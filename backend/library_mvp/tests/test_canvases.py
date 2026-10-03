"""Canvas APIs tested against temporary stores only."""
import base64
from pathlib import Path
import tempfile
import unittest
import httpx
import pymupdf
from backend.library_mvp.api import create_app

ROOT = '/api/research/workbench/canvases'


class CanvasTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.temp.name))
        self.store = self.app.state.store
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://localhost')
        with pymupdf.open() as pdf:
            pdf.new_page().insert_text((50, 50), 'Synthetic canvas evidence')
            upload = self.store.add_pdf(pdf.tobytes(), filename='canvas.pdf')
        self.item, self.attachment = upload['item']['id'], upload['attachment']['id']
        self.canvas = await self.ok('POST', ROOT, {'name': 'Related work'})
        self.path = ROOT + '/' + self.canvas['id']

    async def asyncTearDown(self):
        await self.client.aclose()
        self.store.close()
        self.temp.cleanup()

    async def ok(self, method, path, data=None):
        response = await self.client.request(method, path, json=data)
        self.assertLess(response.status_code, 300, response.text)
        return response.json() if response.content else None

    def node(self, identity='node', kind='sticky', **kwargs):
        return {'id': identity, 'type': kind, 'x': 10, 'y': 20, 'width': 260, 'height': 180,
                'text': 'Thought', **kwargs}

    async def annotation(self, region=False):
        data = {'attachment_id': self.attachment, 'page_index': 0, 'type': 'region' if region else 'highlight',
                'color': 'blue', 'rects': [{'x': .1, 'y': .1, 'width': .2, 'height': .1}],
                'quote': 'Evidence', 'note': 'Interpretation'}
        if region:
            pixmap = pymupdf.Pixmap(pymupdf.csRGB, (0, 0, 20, 20), False)
            data['image'] = base64.b64encode(pixmap.tobytes('png')).decode()
        return await self.ok('POST', f'/api/research/workbench/items/{self.item}/annotations', data)

    async def test_canvas_crud_optional_group_and_cascade(self):
        renamed = await self.ok('PATCH', self.path, {'name': 'Chapter 2'})
        self.assertEqual(renamed['name'], 'Chapter 2')
        self.assertEqual(len((await self.ok('GET', ROOT))['items']), 1)
        await self.ok('PATCH', self.path, {'nodes': [self.node('a'), self.node('b')],
            'edges': [{'id': 'e', 'from_id': 'a', 'to_id': 'b', 'label': '支持', 'style': 'arrow'}]})
        await self.ok('DELETE', self.path)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM canvas_nodes').fetchone()[0], 0)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM canvas_edges').fetchone()[0], 0)
        self.assertIsNotNone(self.store.get_item(self.item))

    async def test_incremental_save_preserves_other_nodes_and_deletes_incident_edges(self):
        await self.ok('PATCH', self.path, {'nodes': [self.node('a'), self.node('b')],
            'edges': [{'id': 'e', 'from_id': 'a', 'to_id': 'b', 'label': '', 'style': 'line'}]})
        result = await self.ok('PATCH', self.path, {'nodes': [self.node('a', x=400)]})
        self.assertEqual(len(result['nodes']), 2)
        self.assertEqual(next(n for n in result['nodes'] if n['id'] == 'a')['x'], 400)
        result = await self.ok('PATCH', self.path, {'delete_nodes': ['a']})
        self.assertEqual(result['edges'], [])

    async def test_invalid_edges_and_cross_canvas_ids_roll_back(self):
        await self.ok('PATCH', self.path, {'nodes': [self.node('a')]})
        second = await self.ok('POST', ROOT, {'name': 'Other'})
        response = await self.client.patch(ROOT + '/' + second['id'], json={'nodes': [self.node('a')]})
        self.assertEqual(response.status_code, 400)
        response = await self.client.patch(self.path, json={'nodes': [self.node('b')],
            'edges': [{'id': 'bad', 'from_id': 'b', 'to_id': 'missing'}]})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(len((await self.ok('GET', self.path))['nodes']), 1)

    async def test_annotation_delete_requires_explicit_choice_and_keep_is_static(self):
        annotation = await self.annotation()
        await self.ok('PATCH', self.path, {'nodes': [self.node(kind='excerpt', annotation_id=annotation['id'])]})
        refs = await self.ok('GET', ROOT + '?unused=1')
        self.assertEqual(len(refs['items']), 1)
        url = f'/api/research/workbench/items/{self.item}/annotations/{annotation["id"]}'
        response = await self.client.delete(url)
        self.assertEqual(response.status_code, 409)
        await self.ok('PATCH', url, {'color': 'red'})
        self.assertEqual((await self.ok('GET', self.path))['nodes'][0]['color'], 'red')
        await self.ok('DELETE', url + '?canvas_policy=keep')
        node = (await self.ok('GET', self.path))['nodes'][0]
        self.assertIsNone(node['annotation_id'])
        self.assertTrue(node['orphaned'])
        self.assertEqual(node['color'], 'red')
        self.assertEqual(node['quote'], 'Evidence')

    async def test_annotation_delete_remove_cascades_edges(self):
        annotation = await self.annotation()
        await self.ok('PATCH', self.path, {'nodes': [self.node('source', 'excerpt', annotation_id=annotation['id']), self.node('idea')],
            'edges': [{'id': 'e', 'from_id': 'source', 'to_id': 'idea'}]})
        await self.ok('DELETE', f'/api/research/workbench/items/{self.item}/annotations/{annotation["id"]}?canvas_policy=remove')
        data = await self.ok('GET', self.path)
        self.assertEqual([n['id'] for n in data['nodes']], ['idea'])
        self.assertEqual(data['edges'], [])

    async def test_image_snapshot_survives_source_deletion_and_canvas_delete_cleans_assets(self):
        annotation = await self.annotation(region=True)
        value = await self.ok('PATCH', self.path, {'nodes': [self.node('image', 'excerpt', annotation_id=annotation['id'])]})
        node = value['nodes'][0]
        self.assertEqual(node['type'], 'image')
        image = self.store.canvases.root / node['image_ref']
        self.assertTrue(image.exists())
        await self.ok('DELETE', f'/api/research/workbench/items/{self.item}/annotations/{annotation["id"]}?canvas_policy=keep')
        response = await self.client.get(self.path + '/nodes/image/image')
        self.assertEqual(response.status_code, 200)
        static = (await self.ok('GET', self.path))['nodes'][0]
        await self.ok('PATCH', self.path, {'delete_nodes': ['image']})
        await self.ok('PATCH', self.path, {'nodes': [static]})
        self.assertEqual((await self.ok('GET', self.path))['nodes'][0]['image_ref'], node['image_ref'])
        await self.ok('DELETE', self.path)
        self.assertFalse(image.exists())

    async def test_export_groups_and_reference_citekey(self):
        annotation = await self.annotation()
        await self.ok('PATCH', self.path, {'nodes': [self.node('g', 'group', x=0, y=0, width=600, height=500, text='Methods'),
            self.node('quote', 'excerpt', annotation_id=annotation['id'])]})
        result = await self.ok('GET', self.path + '/export')
        self.assertIn('## Methods', result['markdown'])
        self.assertIn('Evidence', result['markdown'])
        self.assertIn('第 1 页', result['markdown'])
        self.assertIn('@', result['markdown'])

    async def test_notes_workspace_deletion_uses_the_same_reference_policy(self):
        annotation = await self.annotation()
        await self.ok('PATCH', self.path, {'nodes': [self.node(kind='excerpt', annotation_id=annotation['id'])]})
        url = '/api/research/notes/' + annotation['id']
        self.assertEqual((await self.client.delete(url)).status_code, 409)
        await self.ok('DELETE', url + '?canvas_policy=keep')
        self.assertTrue((await self.ok('GET', self.path))['nodes'][0]['orphaned'])

    async def test_paper_card_uses_library_citekey_disambiguation(self):
        self.store.update_item(self.item, {'title': 'Same title', 'authors': ['Alice Zhang'], 'date': '2025'})
        self.store.create_item({'title': 'Same title', 'authors': ['Alice Zhang'], 'date': '2025'})
        result = await self.ok('PATCH', self.path, {'nodes': [self.node(kind='paper', item_id=self.item)]})
        self.assertEqual(result['nodes'][0]['citekey'], self.app.state.workbench.row(self.item)['citekey'])
