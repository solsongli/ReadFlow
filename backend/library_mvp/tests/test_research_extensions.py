"""Integrated app tests: synthetic PDFs, no OCR/model network calls."""
import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import fitz
import httpx
from backend.library_mvp.api import create_app
from backend.library_mvp.ocr_modules import OcrModules
from backend.library_mvp.store import StoreError


class ExtensionTests(unittest.IsolatedAsyncioTestCase):
    async def test_catalog_default_gate_local_config_search_and_lifespan(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'library'
            app = create_app(root)
            with patch('urllib.request.urlopen') as network:
                async with app.router.lifespan_context(app):
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                        modules = (await client.get('/api/research/ocr/modules')).json()['modules']
                        self.assertEqual(len(modules), 2)
                        self.assertTrue(modules[0]['builtin'])
                        self.assertFalse(modules[0]['download_enabled'])
                        module = modules[1]
                        self.assertEqual(module['status'], 'not_installed')
                        self.assertEqual(module['total_bytes'], 151802982)
                        preview = (await client.get('/api/research/ocr/modules/rapidocr-mobile-cpu/preview')).json()
                        result = await client.post('/api/research/ocr/modules/rapidocr-mobile-cpu/install', json={'preview_hash': preview['preview_hash']})
                        self.assertEqual(result.status_code, 403)
                        self.assertEqual(result.json()['error']['code'], 'OCR_DOWNLOAD_DISABLED')
                        configured = await client.put('/api/research/agent/config', json={'base_url': 'http://localhost:11434/v1', 'model': 'user-selected-model', 'api_key': ''})
                        self.assertEqual(configured.status_code, 200)
                        self.assertNotIn('api_key', configured.json())
                        self.assertFalse(configured.json()['api_key_configured'])
                        self.assertFalse(configured.json()['external_models_allowed'])
                        with fitz.open() as doc:
                            page = doc.new_page()
                            page.insert_text((40, 40), 'Synthetic quorum evidence for integrated local search.')
                            raw = doc.tobytes()
                        paper = (await client.post('/api/research/files', content=raw, headers={'content-type': 'application/pdf'})).json()
                        item_id = paper['item']['id']
                        agent = await client.post('/api/research/agent/runs', json={'item_ids': [item_id], 'query': 'quorum', 'mode': 'agent'})
                        self.assertEqual(agent.status_code, 403)
                        run = (await client.post('/api/research/agent/runs', json={'item_ids': [item_id], 'query': 'quorum', 'mode': 'source-search'})).json()
                        for _ in range(100):
                            if run['status'] not in ('queued', 'running'):
                                break
                            await asyncio.sleep(.01)
                            run = (await client.get('/api/research/agent/runs/' + run['id'])).json()
                        self.assertEqual(run['status'], 'completed')
                        self.assertEqual(run['result']['citations'][0]['page_idx'], 0)
                        self.assertFalse(run['result']['model_verified'])
                network.assert_not_called()
            with self.assertRaises(Exception):
                app.state.store.list_items()
            # Reopening the app preserves config and source data, without rerunning OCR/AI.
            reopened = create_app(root)
            async with reopened.router.lifespan_context(reopened):
                self.assertEqual(len(reopened.state.store.list_items()['items']), 1)
                self.assertTrue(reopened.state.library_agent.config.status()['configured'])

    async def test_incompatible_bundle_refused_before_download(self):
        with tempfile.TemporaryDirectory() as temporary:
            modules = OcrModules(Path(temporary), allow_download=True)
            preview = modules.preview('rapidocr-mobile-cpu')
            with patch('platform.machine', return_value='aarch64'), patch('urllib.request.urlopen') as network:
                with self.assertRaises(StoreError) as error:
                    modules.start_install('rapidocr-mobile-cpu', preview['preview_hash'])
                self.assertEqual(error.exception.code, 'OCR_PLATFORM_UNSUPPORTED')
                network.assert_not_called()


if __name__ == '__main__':
    unittest.main()
