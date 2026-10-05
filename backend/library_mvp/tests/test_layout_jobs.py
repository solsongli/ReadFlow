"""Both PDF variants and offline cached rendering use real local renderers with fake text."""
import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock
import httpx
import pymupdf as fitz
from backend.library_mvp.api import create_app
from backend.library_mvp.paper_blocks_render import runtime_paths
from backend.library_mvp.paper_blocks_storage import write_json
from backend.library_mvp.paper_blocks_model import cache_key
from backend.library_mvp.store import StoreError


class LayoutJobs(unittest.IsolatedAsyncioTestCase):
    async def test_cached_render_without_credentials_gate_and_both_file_contracts(self):
        try:
            runtime_paths()
        except StoreError:
            self.skipTest("Bundled Typst/font resources are not available on this CI worker")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            app = create_app(root, allow_external_models=False)
            async with app.router.lifespan_context(app):
                service = app.state.paper_blocks
                with fitz.open() as pdf:
                    page = pdf.new_page()
                    page.insert_text((50, 150), "A paragraph with reproducible scientific evidence.", fontsize=12)
                    item = app.state.store.add_pdf(pdf.tobytes(), filename="layout-test.pdf")
                entry = item["attachment"]
                document = service.storage.extract(entry)
                folder = service.storage.directory(entry)
                cache = {cache_key(b, "zh-CN", "fixture"): {"text": "中文测试译文"} for b in document["blocks"]}
                service.merge_cache(entry, cache)
                write_json(folder / "selection.json", {"language": "zh-CN", "fingerprint": "fixture"})
                service.assistance.gate = Mock(side_effect=AssertionError("No external gate needed"))
                service.assistance.chat = Mock(side_effect=AssertionError("No model request allowed"))
                url = f"/api/research/workbench/items/{item['item']['id']}/blocks"
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app), base_url="http://localhost"
                ) as client:
                    response = await client.post(url + "/render", json={"language": "zh-CN"})
                    self.assertEqual(response.status_code, 202)
                    identity = response.json()["id"]
                    for _ in range(300):
                        if service.jobs[identity]["status"] in {"done", "failed"}:
                            break
                        await asyncio.sleep(0.02)
                    self.assertEqual(service.jobs[identity]["status"], "done", service.jobs[identity].get("error"))
                    status = (await client.get(url)).json()
                    self.assertTrue(status["result"]["layout_ready"])
                    self.assertTrue(status["result"]["reflow_ready"])
                    performance = status["result"]["performance"]
                    self.assertGreater(performance["timings_s"]["render"], 0)
                    self.assertGreaterEqual(performance["timings_s"]["extraction"], 0)
                    self.assertEqual(performance["requests"]["count"], 0)
                    for name in ("translated-layout.pdf", "translated.pdf"):
                        file = await client.get(url + "/files/" + name)
                        self.assertEqual(file.status_code, 200)
                        self.assertTrue(file.content.startswith(b"%PDF"))
                    self.assertEqual((await client.get(url + "/files/private.json")).status_code, 404)
                    self.assertEqual(
                        (await client.post(url + "/render", json={"block_id": "bad"})).status_code, 400
                    )
                    proposal = {"language": "zh-CN", "revision": 0,
                                "entries": [{"source": "paragraph", "target": "段落"}]}
                    edited = await client.patch(url + "/terms", json=proposal)
                    self.assertEqual(edited.status_code, 200)
                    self.assertTrue(edited.json()["affected"])
                    self.assertEqual(edited.json()["revision"], 1)
                    self.assertEqual((await client.patch(url + "/terms", json=proposal)).status_code, 409)
                    self.assertEqual((await client.get(url)).json()["terms"]["entries"][0]["target"], "段落")
                service.assistance.gate.assert_not_called()
                service.assistance.chat.assert_not_called()
