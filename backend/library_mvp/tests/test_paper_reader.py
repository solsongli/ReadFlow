from pathlib import Path
import tempfile
import unittest
import httpx
from backend.library_mvp.api import create_app
from backend.library_mvp.tests.test_store import synthetic_pdf


class PaperReaderTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.temp.name))
        self.store = self.app.state.store
        self.item = self.store.add_pdf(synthetic_pdf(['one','two']))['item']['id']
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),base_url='http://fixture')
        self.url = f'/api/research/workbench/items/{self.item}/reader'

    async def asyncTearDown(self):
        await self.client.aclose(); self.store.close(); self.temp.cleanup()

    async def test_bookmark_add_delete_and_persist(self):
        added = await self.client.post(self.url+'/bookmarks',json={'page':2,'offset':.321,'name':'Method'})
        self.assertEqual(added.status_code,200)
        mark = added.json()['bookmarks'][0]
        self.assertEqual((mark['page'],mark['offset'],mark['name']),(2,.321,'Method'))
        self.assertEqual((await self.client.get(self.url)).json()['bookmarks'],[mark])
        self.assertEqual((await self.client.delete(self.url+'/bookmarks/'+mark['id'])).json()['bookmarks'],[])

    async def test_invalid_pages_names_and_cross_item_deletion(self):
        for body in [{'page':3,'name':'bad'},{'page':True,'name':'bad'},{'page':1,'name':''},{'page':1,'offset':2,'name':'bad'}]:
            self.assertEqual((await self.client.post(self.url+'/bookmarks',json=body)).status_code,400)
        mark=(await self.client.post(self.url+'/bookmarks',json={'page':1,'name':'keep'})).json()['bookmarks'][0]
        other=self.store.create_item({'title':'other'})['id']
        await self.client.delete(f'/api/research/workbench/items/{other}/reader/bookmarks/{mark["id"]}')
        self.assertEqual(len((await self.client.get(self.url)).json()['bookmarks']),1)

    async def test_reading_time_is_bounded_and_retry_idempotent(self):
        for _ in range(2): await self.client.post(self.url+'/time',json={'seconds':15,'id':'tick-one'})
        self.assertEqual((await self.client.get(self.url)).json()['seconds'],15)
        self.assertEqual((await self.client.post(self.url+'/time',json={'seconds':61,'id':'invalid'})).status_code,400)

    async def test_translated_supplement_bookmark_preserves_document_mode(self):
        response = await self.client.post(self.url+'/bookmarks',json={'page':14,'mode':'translated','name':'Supplement'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['bookmarks'][0]['mode'],'translated')
        self.assertEqual((await self.client.post(self.url+'/bookmarks',json={'page':1,'mode':'foreign','name':'invalid'})).status_code,400)
