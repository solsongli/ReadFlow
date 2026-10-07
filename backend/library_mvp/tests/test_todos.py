import unittest
from backend.library_mvp.tests import test_canvases as fixtures

ROOT = '/api/research/workbench/todos'


class TodoTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.CanvasTests.asyncSetUp
    asyncTearDown = fixtures.CanvasTests.asyncTearDown
    ok = fixtures.CanvasTests.ok

    async def test_crud_order_and_completion(self):
        first = await self.ok('POST', ROOT, {'title': '读完第 3 节', 'item_id': self.item, 'due': '2026-10-09'})
        second = await self.ok('POST', ROOT, {'title': '整理术语'})
        third = await self.ok('POST', ROOT, {'title': '写周报'})
        self.assertEqual(first['item_title'], 'canvas')
        self.assertEqual(first['due'], '2026-10-09')
        self.assertFalse(first['done'])
        self.assertLess(first['position'], second['position'])
        listed = await self.ok('POST', ROOT + '/reorder', {'ids': [third['id'], first['id'], second['id']]})
        self.assertEqual([row['id'] for row in listed['items']], [third['id'], first['id'], second['id']])
        edited = await self.ok('PATCH', ROOT + '/' + second['id'],
                               {'title': '整理术语表', 'due': None, 'item_id': self.item})
        self.assertEqual((edited['title'], edited['due'], edited['item_id']), ('整理术语表', None, self.item))
        done = await self.ok('PATCH', ROOT + '/' + third['id'], {'done': True})
        self.assertTrue(done['done'] and done['done_at'])
        items = (await self.ok('GET', ROOT))['items']
        self.assertEqual([row['id'] for row in items], [first['id'], second['id'], third['id']])
        reopened = await self.ok('PATCH', ROOT + '/' + third['id'], {'done': False})
        self.assertIsNone(reopened['done_at'])
        self.assertGreater(reopened['position'], edited['position'])
        await self.ok('PATCH', ROOT + '/' + third['id'], {'done': True})
        self.assertEqual(await self.ok('POST', ROOT + '/clear-done'), {'removed': 1})
        await self.ok('DELETE', ROOT + '/' + first['id'])
        self.assertEqual([row['id'] for row in (await self.ok('GET', ROOT))['items']], [second['id']])

    async def test_validation_and_unknown_records(self):
        for body in ({'title': ''}, {'title': 'x' * 501}, {'title': 'a', 'due': '2026-13-01'},
                     {'title': 'a', 'due': 'tomorrow'}, {'title': 'a', 'item_id': 'missing'}):
            response = await self.client.post(ROOT, json=body)
            self.assertIn(response.status_code, (400, 404), body)
        todo = await self.ok('POST', ROOT, {'title': '检查'})
        self.assertEqual((await self.client.patch(ROOT + '/' + todo['id'], json={'done': 'yes'})).status_code, 400)
        self.assertEqual((await self.client.patch(ROOT + '/missing', json={'title': 'x'})).status_code, 404)
        self.assertEqual((await self.client.post(ROOT + '/reorder', json={'ids': [todo['id'], todo['id']]})).status_code, 400)
        self.assertEqual((await self.client.post(ROOT + '/reorder', json={'ids': ['missing']})).status_code, 404)

    async def test_deleted_item_keeps_todo_and_survives_restart(self):
        todo = await self.ok('POST', ROOT, {'title': '读完 OpenVLA', 'item_id': self.item})
        with self.store.transaction():
            self.store.db.execute('DELETE FROM items WHERE id=?', (self.item,))
        saved = (await self.ok('GET', ROOT))['items'][0]
        self.assertEqual(saved['id'], todo['id'])
        self.assertIsNone(saved['item_id'])
        from backend.library_mvp.todos import Todos
        self.assertEqual(Todos(self.store).list()[0]['title'], '读完 OpenVLA')
