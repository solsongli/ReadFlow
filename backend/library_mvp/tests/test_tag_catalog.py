import unittest
import pymupdf
from backend.library_mvp.tests import test_canvases as fixtures

ROOT = '/api/research/workbench/tags'


class TagCatalogTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.CanvasTests.asyncSetUp
    asyncTearDown = fixtures.CanvasTests.asyncTearDown
    ok = fixtures.CanvasTests.ok

    def second_item(self):
        with pymupdf.open() as pdf:
            pdf.new_page().insert_text((50, 50), 'Second tagged paper')
            return self.store.add_pdf(pdf.tobytes(), filename='second.pdf')['item']['id']

    async def tags(self, item):
        return (await self.ok('GET', f'/api/research/items/{item}'))['tags']

    async def test_colored_tags_take_positions_and_swap(self):
        first = (await self.ok('PUT', ROOT + '/colors/待精读', {'color': 2}))['items']
        self.assertEqual(first, [{'name': '待精读', 'color': 2, 'position': 1}])
        await self.ok('PUT', ROOT + '/colors/方法', {'color': 4})
        # Moving 方法 onto position 1 swaps it with 待精读.
        swapped = (await self.ok('PUT', ROOT + '/colors/方法', {'color': 5, 'position': 1}))['items']
        self.assertEqual([(t['name'], t['color'], t['position']) for t in swapped],
                         [('方法', 5, 1), ('待精读', 2, 2)])
        # A new tag claiming an occupied slot pushes the owner to the first free slot.
        pushed = (await self.ok('PUT', ROOT + '/colors/综述', {'color': 1, 'position': 2}))['items']
        self.assertEqual([(t['name'], t['position']) for t in pushed], [('方法', 1), ('综述', 2), ('待精读', 3)])
        cleared = (await self.ok('DELETE', ROOT + '/colors/综述'))['items']
        self.assertEqual([t['name'] for t in cleared], ['方法', '待精读'])

    async def test_at_most_nine_colored_tags_and_validation(self):
        for index in range(9):
            await self.ok('PUT', ROOT + f'/colors/t{index}', {'color': 1 + index % 7})
        self.assertEqual((await self.client.put(ROOT + '/colors/extra', json={'color': 1})).status_code, 409)
        self.assertEqual((await self.client.put(ROOT + '/colors/t0', json={'color': 8})).status_code, 400)
        self.assertEqual((await self.client.put(ROOT + '/colors/t0', json={'color': 1, 'position': 10})).status_code, 400)

    async def test_batch_apply_rename_merge_and_delete(self):
        other = self.second_item()
        await self.ok('PATCH', f'/api/research/items/{self.item}', {'tags': ['综述']})
        result = await self.ok('POST', ROOT + '/apply', {'item_ids': [self.item, other], 'add': ['待精读', '综述']})
        self.assertEqual(result, {'updated': 2})
        self.assertEqual(await self.tags(self.item), ['综述', '待精读'])
        self.assertEqual(await self.tags(other), ['待精读', '综述'])
        self.assertEqual(await self.ok('POST', ROOT + '/apply', {'item_ids': [other], 'remove': ['综述']}), {'updated': 1})
        self.assertEqual(await self.tags(other), ['待精读'])
        await self.ok('PUT', ROOT + '/colors/待精读', {'color': 3})
        renamed = await self.ok('POST', ROOT + '/rename', {'from': '待精读', 'to': '精读'})
        self.assertEqual(renamed['updated'], 2)
        self.assertEqual([t['name'] for t in renamed['colors']], ['精读'])
        self.assertEqual(await self.tags(self.item), ['综述', '精读'])
        # Renaming onto an existing tag merges without duplicates.
        await self.ok('POST', ROOT + '/rename', {'from': '综述', 'to': '精读'})
        self.assertEqual(await self.tags(self.item), ['精读'])
        deleted = await self.ok('POST', ROOT + '/delete', {'name': '精读'})
        self.assertEqual((deleted['updated'], deleted['colors']), (2, []))
        self.assertEqual(await self.tags(self.item), [])

    async def test_apply_rejects_unknown_items_atomically(self):
        response = await self.client.post(ROOT + '/apply', json={'item_ids': [self.item, 'missing'], 'add': ['x']})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(await self.tags(self.item), [])
        self.assertEqual((await self.client.post(ROOT + '/apply', json={'item_ids': []})).status_code, 400)
