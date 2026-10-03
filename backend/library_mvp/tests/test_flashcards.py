import json
import unittest
from backend.library_mvp.tests import test_canvases as fixtures
from backend.library_mvp.flashcard_schedule import schedule

ROOT = '/api/research/workbench/flashcards'


class FlashcardTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.CanvasTests.asyncSetUp
    asyncTearDown = fixtures.CanvasTests.asyncTearDown
    ok = fixtures.CanvasTests.ok
    annotation = fixtures.CanvasTests.annotation

    async def card(self, annotation=None):
        deck = await self.ok('POST', '/api/research/workbench/decks', {'name': 'Methods'})
        return await self.ok('POST', ROOT, {'deck_id': deck['id'], 'item_id': self.item,
            'annotation_id': annotation, 'page': 1, 'kind': 'question', 'front': 'Question?', 'back': 'Answer'})

    async def test_card_crud_and_review_checkpoint(self):
        card = await self.card()
        self.assertEqual(card['due'], '0001-01-01')
        result = await self.ok('POST', ROOT + '/' + card['id'] + '/review',
                               {'rating': 3, 'day': '2026-10-03', 'version': 0})
        self.assertEqual(result['due'], '2026-10-04')
        duplicate = await self.client.post(ROOT + '/' + card['id'] + '/review',
                               json={'rating': 3, 'day': '2026-10-03', 'version': 0})
        self.assertEqual(duplicate.status_code, 409)
        logs = await self.ok('GET', '/api/research/workbench/card-reviews?day=2026-10-03')
        self.assertEqual(len(logs['items']), 1)
        self.assertEqual(json.loads(logs['items'][0]['previous'])['due'], '0001-01-01')
        edited = await self.ok('PATCH', ROOT + '/' + card['id'], {'front': 'Changed', 'suspended': True})
        self.assertEqual(edited['front'], 'Changed')
        self.assertTrue(edited['suspended'])
        await self.ok('DELETE', ROOT + '/' + card['id'])
        self.assertEqual((await self.ok('GET', ROOT))['items'], [])
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM card_reviews').fetchone()[0], 0)

    async def test_annotation_link_keep_and_remove(self):
        source = await self.annotation()
        card = await self.card(source['id'])
        path = f'/api/research/workbench/items/{self.item}/annotations/{source["id"]}'
        self.assertEqual((await self.client.delete(path)).status_code, 409)
        await self.ok('DELETE', path + '?canvas_policy=keep')
        saved = (await self.ok('GET', ROOT))['items'][0]
        self.assertIsNone(saved['annotation_id'])
        self.assertTrue(saved['orphaned'])
        self.assertEqual(saved['quote'], source['quote'])
        source = await self.annotation()
        await self.card(source['id'])
        await self.ok('DELETE', f'/api/research/workbench/items/{self.item}/annotations/{source["id"]}?canvas_policy=remove')
        self.assertEqual(len((await self.ok('GET', ROOT))['items']), 1)

    async def test_deck_delete_cascades(self):
        card = await self.card()
        await self.ok('DELETE', '/api/research/workbench/decks/' + card['deck_id'])
        self.assertEqual((await self.ok('GET', ROOT))['items'], [])

    async def test_all_ratings_and_learning_intervals(self):
        state = {'interval': 0, 'repetitions': 0, 'ease': 2.5}
        self.assertEqual([schedule(state, r, '2026-10-03')['interval'] for r in range(1, 5)], [0, 1, 1, 4])
        good = schedule(state, 3, '2026-10-03')
        self.assertEqual(schedule(good, 3, '2026-10-04')['interval'], 6)
        for _ in range(30):
            state = schedule(state, 1, '2026-10-03')
        self.assertEqual(state['ease'], 1.3)

    async def test_validation_and_suspended_cards_cannot_be_reviewed(self):
        card = await self.card()
        invalid = await self.client.patch(ROOT + '/' + card['id'], json={'front': ''})
        self.assertEqual(invalid.status_code, 400)
        invalid = await self.client.patch(ROOT + '/' + card['id'], json={'item_id': 'another-item'})
        self.assertEqual(invalid.status_code, 400)
        suspended = await self.ok('PATCH', ROOT + '/' + card['id'], {'suspended': True})
        invalid = await self.client.post(ROOT + '/' + card['id'] + '/review',
            json={'rating': 3, 'day': '2026-10-03', 'version': suspended['version']})
        self.assertEqual(invalid.status_code, 409)
