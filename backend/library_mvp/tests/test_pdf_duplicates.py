"""Standalone PDF uploads deduplicate without changing Connector/CSL semantics."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import unittest
import httpx
from backend.library_mvp.api import create_app
from backend.library_mvp.tests.test_store import synthetic_pdf


class PdfDuplicatesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.temp.name))
        self.store = self.app.state.store
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://fixture.test')
        self.raw = synthetic_pdf(['Duplicate import fixture'])

    async def asyncTearDown(self):
        await self.client.aclose()
        self.store.close()
        self.temp.cleanup()

    async def upload(self, name='paper.pdf'):
        response = await self.client.post('/api/research/files', params={'filename': name}, content=self.raw, headers={'Content-Type': 'application/pdf'})
        self.assertEqual(response.status_code, 201)
        return response.json()

    async def test_same_bytes_with_different_names_return_same_item_and_attachment(self):
        first = await self.upload()
        for name in ['renamed.pdf', 'paper.pdf', 'fourth.pdf']:
            result = await self.upload(name)
            self.assertTrue(result['duplicate'])
            self.assertEqual(result['item']['id'], first['item']['id'])
            self.assertEqual(result['attachment']['id'], first['attachment']['id'])
        self.assertFalse(first['duplicate'])
        self.assertEqual(self.app.state.workbench.list()['counts']['all'], 1)

    async def test_trashed_item_is_restored_with_metadata_notes_and_groups(self):
        first = await self.upload(); identity = first['item']['id']
        await self.client.patch('/api/research/workbench/items/' + identity + '/state', json={'starred': True, 'title_translated': '保留题名'})
        await self.client.post('/api/research/items/' + identity + '/notes', json={'body': 'Keep note'})
        group = self.store.create_collection({'name': 'Keep group'})
        self.app.state.workbench.change_membership(group['id'], {'add': [identity]})
        self.app.state.workbench.set_trashed({'item_ids': [identity]}, True)
        result = await self.upload()
        row = self.app.state.workbench.row(identity)
        self.assertTrue(result['duplicate']); self.assertEqual(result['item']['id'], identity)
        self.assertIsNone(row['deleted_at']); self.assertTrue(row['starred'])
        self.assertEqual(row['title_translated'], '保留题名'); self.assertEqual(row['notes_count'], 1)
        self.assertIn(group['id'], row['group_ids'])

    async def test_existing_legacy_duplicates_are_not_merged_and_live_item_wins(self):
        one = self.store.add_pdf(self.raw)
        two = self.store.add_pdf(self.raw)
        self.app.state.workbench.set_trashed({'item_ids': [one['item']['id']]}, True)
        result = await self.upload()
        self.assertEqual(result['item']['id'], two['item']['id'])
        counts = self.app.state.workbench.list()['counts']
        self.assertEqual((counts['all'], counts['trash']), (1, 1))

    async def test_concurrent_uploads_create_only_one_item(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.store.add_pdf(self.raw, deduplicate=True), range(4)))
        self.assertEqual(len({r['item']['id'] for r in results}), 1)
        self.assertEqual(sum(r['duplicate'] for r in results), 3)

    async def test_explicit_attachment_targets_keep_original_non_files_semantics(self):
        first = self.store.add_pdf(self.raw)
        other = self.store.create_item({'title': 'Connector record'})
        attached = self.store.add_pdf(self.raw, item_id=other['id'])
        self.assertNotEqual(first['item']['id'], attached['item']['id'])
        self.assertFalse(attached['duplicate'])
        self.assertTrue(self.store.add_pdf(self.raw, item_id=other['id'])['duplicate'])
