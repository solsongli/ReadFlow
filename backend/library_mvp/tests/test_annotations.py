"""Synthetic R2 CRUD, migration, image lifecycle and ReadFlow count integration."""
import base64
import json
from pathlib import Path
import tempfile
import unittest
import httpx
import pymupdf
from backend.library_mvp.api import create_app


class AnnotationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.temp.name))
        self.store = self.app.state.store
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://localhost')
        with pymupdf.open() as pdf:
            pdf.new_page().insert_text((50, 50), 'Synthetic annotation fixture')
            uploaded = self.store.add_pdf(pdf.tobytes(), filename='annotation.pdf')
        self.item = uploaded['item']['id']
        self.attachment = uploaded['attachment']['id']
        self.root = f'/api/research/workbench/items/{self.item}/annotations'

    async def asyncTearDown(self):
        await self.client.aclose()
        self.store.close()
        self.temp.cleanup()

    def payload(self, kind='highlight'):
        return {'attachment_id': self.attachment, 'page_index': 0, 'type': kind, 'color': 'yellow',
                'rects': [{'x': .1, 'y': .2, 'width': .3, 'height': .02}],
                'quote': 'A quotation', 'note': '**Observation**', 'ink': [], 'width': 2}

    async def request(self, method, path, data=None):
        response = await self.client.request(method, path, json=data)
        self.assertLess(response.status_code, 300, response.text)
        return response.json() if response.content else None

    async def test_crud_scope_validation_and_note_workspace_edits(self):
        row = await self.request('POST', self.root, self.payload())
        updated = await self.request('PATCH', self.root + '/' + row['id'], {'color': 'blue', 'note': 'Changed'})
        self.assertEqual(updated['color'], 'blue')
        self.assertEqual((await self.request('GET', self.root))['items'][0]['note'], 'Changed')
        await self.request('PATCH', '/api/research/notes/' + row['id'], {'body': 'From Notes'})
        self.assertEqual((await self.request('GET', self.root))['items'][0]['note'], 'From Notes')
        other = self.store.create_item({'title': 'Other'})['id']
        response = await self.client.delete(f'/api/research/workbench/items/{other}/annotations/{row["id"]}')
        self.assertEqual(response.status_code, 404)
        for patch in ({'page_index': 10}, {'color': 'unknown'}, {'rects': [{'x': -1}]}, {'width': 100}):
            response = await self.client.patch(self.root + '/' + row['id'], json=patch)
            self.assertEqual(response.status_code, 400)
        await self.request('DELETE', self.root + '/' + row['id'])
        await self.request('DELETE', self.root + '/' + row['id'])
        self.assertEqual((await self.request('GET', self.root))['items'], [])

    async def test_region_image_lifecycle_and_restore(self):
        pix = pymupdf.Pixmap(pymupdf.csRGB, (0, 0, 20, 20), False)
        image = 'data:image/png;base64,' + base64.b64encode(pix.tobytes('png')).decode()
        row = await self.request('POST', self.root, {**self.payload('region'), 'image': image})
        path = self.store.annotations.image_path(row['id'])
        self.assertTrue(path.is_file())
        response = await self.client.get('/api/research/annotations/' + row['id'] + '/image')
        self.assertEqual(response.headers['content-type'], 'image/png')
        await self.request('DELETE', self.root + '/' + row['id'])
        self.assertFalse(path.exists())
        restored = await self.request('POST', self.root, {**row, 'image': image})
        self.assertEqual(restored['id'], row['id'])
        invalid = await self.client.post(self.root, json={**self.payload('region'), 'image': 'bad'})
        self.assertEqual(invalid.status_code, 400)

    async def test_migration_is_idempotent_retains_original_and_does_not_resurrect(self):
        attachment = self.store.get_attachment(self.attachment)
        native = {'id': 'native-legacy', 'itemId': self.item, 'attachmentId': self.attachment,
                  'documentId': attachment['sha256'], 'page': 1, 'pane': 'source',
                  'quote': 'Legacy quotation', 'note': 'Legacy note', 'color': 'purple',
                  'createdAt': '2026-10-03T12:00:00Z',
                  'selection': {'type': 'text', 'coordinateSpace': 'reader-viewport',
                                'rect': {'left': 20, 'top': 30, 'width': 100, 'height': 15}}}
        note = self.store.create_note(self.item, {'attachment_id': self.attachment, 'page_idx': 0,
                                                 'quote': native['quote'], 'body': native['note'],
                                                 'reader_annotation': native})
        before = dict(self.store.db.execute('SELECT * FROM notes WHERE id=?', (note['id'],)).fetchone())
        self.store.annotations.migrate()
        self.store.annotations.migrate()
        rows = (await self.request('GET', self.root))['items']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['source_id'], note['id'])
        self.assertEqual(rows[0]['rects'], [])
        await self.request('PATCH', self.root + '/' + rows[0]['id'], {'note': 'New canonical note'})
        self.assertEqual(dict(self.store.db.execute('SELECT * FROM notes WHERE id=?', (note['id'],)).fetchone()), before)
        await self.request('DELETE', self.root + '/' + rows[0]['id'])
        self.store.annotations.migrate()
        self.assertEqual((await self.request('GET', self.root))['items'], [])
        restored = await self.request('POST', self.root, rows[0])
        self.assertEqual(restored['source_id'], note['id'])
        self.assertEqual(restored['rects'], [])
        self.assertIsNotNone(self.store.db.execute('SELECT 1 FROM notes WHERE id=?', (note['id'],)).fetchone())

    async def test_counts_desk_notes_export_and_semantic_labels(self):
        row = await self.request('POST', self.root, self.payload())
        self.store.create_note(self.item, {'body': 'Free note'})
        item = await self.request('GET', '/api/research/workbench/items/' + self.item)
        self.assertEqual((item['notes_count'], item['annotations_count']), (2, 1))
        notes = await self.request('GET', '/api/research/workbench/notes')
        self.assertEqual(notes['counts'], {'total': 2, 'notes': 1, 'annotations': 1})
        desk = await self.request('GET', '/api/research/workbench/desk')
        self.assertEqual(desk['recent_annotations'][0]['id'], row['id'])
        self.assertEqual(desk['counts']['annotations'], 1)
        labels = dict(zip(('yellow', 'blue', 'green', 'red', 'purple'), ('待引用', '方法', '结果', '疑问', '概念')))
        export = await self.request('POST', self.root + '/export', {'semantics': labels})
        self.assertIn('## 待引用', export['markdown'])
        self.assertIn('> A quotation', export['markdown'])
        note = await self.request('POST', self.root + '/export', {'ids': [row['id']], 'as_note': True})
        self.assertIn('第 1 页', note['body'])
        await self.request('POST', '/api/research/workbench/items/trash', {'item_ids': [self.item]})
        self.assertEqual((await self.request('GET', '/api/research/workbench/notes'))['total'], 0)

    async def test_ink_and_sticky_are_counted_as_annotations(self):
        await self.request('POST', self.root, {**self.payload('ink'), 'rects': [],
                                             'ink': [{'x': .1, 'y': .1}, {'x': .2, 'y': .2}]})
        await self.request('POST', self.root, {**self.payload('sticky'), 'quote': ''})
        desk = await self.request('GET', '/api/research/workbench/desk')
        self.assertEqual(desk['counts']['annotations'], 2)
        self.assertEqual(desk['counts']['notes'], 0)

    async def test_create_retry_is_idempotent_and_conflicting_id_is_rejected(self):
        payload = {**self.payload(), 'id': 'stable-client-id'}
        first = await self.request('POST', self.root, payload)
        second = await self.request('POST', self.root, payload)
        self.assertEqual(first, second)
        self.assertEqual(len((await self.request('GET', self.root))['items']), 1)
        conflict = await self.client.post(self.root, json={**payload, 'note': 'conflicting'})
        self.assertEqual(conflict.status_code, 409)

    async def test_imported_annotation_without_attachment_keeps_editable_text(self):
        note = self.store.create_note(self.item, {'quote': 'Unpositioned quote', 'body': 'Imported'})
        rows = (await self.request('GET', self.root))['items']
        self.assertEqual(rows[0]['id'], note['id'])
        updated = await self.request('PATCH', self.root + '/' + note['id'], {'note': 'Edited', 'color': 'green'})
        self.assertEqual(updated['note'], 'Edited')
        self.assertEqual(updated['rects'], [])
