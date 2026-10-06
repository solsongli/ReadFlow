"""Loading old translations repairs both PDFs locally and never enters the model gate."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock
import httpx
import pymupdf as fitz
from backend.library_mvp.api import create_app
from backend.library_mvp.paper_blocks_storage import write_json
from backend.library_mvp.paper_blocks_model import cache_key, SCHEMA_VERSION, EXTRACTOR_VERSION
from backend.library_mvp.document_models import revision
from backend.library_mvp.paper_blocks_render import runtime_paths
from backend.library_mvp.store import StoreError


class MarkerRepairJobs(unittest.IsolatedAsyncioTestCase):
    async def test_read_migration_local_render_and_atomic_concurrent_merge(self):
        try:
            runtime_paths()
        except StoreError:
            self.skipTest("Bundled Typst/fonts unavailable; pure marker tests still run")
        with tempfile.TemporaryDirectory() as temp:
            app = create_app(Path(temp), allow_external_models=False)
            async with app.router.lifespan_context(app):
                service = app.state.paper_blocks
                with fitz.open() as pdf:
                    for index in range(2):
                        page = pdf.new_page()
                        page.insert_text((50, 150), f"Chapter {index + 1}", fontsize=12)
                    pdf.set_toc([[1, "Chapter 1", 1], [1, "Chapter 2", 2]])
                    added = app.state.store.add_pdf(pdf.tobytes(), filename="migration.pdf")
                entry, item = added["attachment"], added["item"]["id"]
                folder = service.storage.directory(entry)
                blocks = [
                    {
                        "id": str(index + 1) * 24,
                        "page": index + 1,
                        "type": "heading",
                        "size": 12,
                        "text": f"Chapter {index + 1}",
                        "protected": [],
                        "anchors": [
                            {
                                "page": index + 1,
                                "bbox": [50, 135, 350, 180],
                                "view_bbox": [0.1, 0.1, 0.6, 0.3],
                            }
                        ],
                    }
                    for index in range(2)
                ]
                write_json(
                    folder / "blocks.json",
                    {
                        "schema_version": SCHEMA_VERSION,
                        "extractor_version": EXTRACTOR_VERSION,
                        "model_revision": revision(),
                        "blocks": blocks,
                        "warnings": [],
                        "pages": [{"page": 1}, {"page": 2}],
                    },
                )
                cache = {
                    cache_key(b, "zh-CN", "fixture"): {
                        "text": "BOLD_START章节BOLD_END",
                        "runs": [{"kind": "text", "text": "BOLD_START章节BOLD_END"}],
                        "qa": {"issues": [], "retried": True},
                    }
                    for b in blocks
                }
                write_json(folder / "translations.json", cache)
                write_json(
                    folder / "result.json",
                    {
                        "language": "zh-CN",
                        "fingerprint": "fixture",
                        "layout_ready": True,
                        "usage": {"total_tokens": 100},
                        "revision": "old",
                    },
                )
                service.assistance.gate = Mock(side_effect=AssertionError("No model gate needed"))
                service.assistance.chat = Mock(side_effect=AssertionError("No model call permitted"))
                with ThreadPoolExecutor(max_workers=2) as pool:
                    cleaned = pool.submit(service.storage.cache, entry)
                    written = pool.submit(service.merge_cache, entry, {"unrelated": {"text": "kept"}})
                    cleaned.result()
                    written.result()
                self.assertIn("unrelated", service.storage.cache(entry))
                client = httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=app), base_url="http://localhost"
                )
                async with client:
                    url = f"/api/research/workbench/items/{item}/blocks"
                    first = (await client.get(url)).json()
                    self.assertNotIn("BOLD", json.dumps(first["document"]))
                    self.assertEqual(len(first["jobs"]), 1)
                    identity = first["job"]["id"]
                    for _ in range(400):
                        state = (await client.get(url)).json()
                        if service.jobs[identity]["status"] in ("done", "failed"):
                            break
                        await asyncio.sleep(0.02)
                    self.assertEqual(
                        service.jobs[identity]["status"], "done", service.jobs[identity].get("error")
                    )
                    state = (await client.get(url)).json()
                    self.assertEqual(len(state["jobs"]), 1)
                    self.assertFalse(service.storage.repair_state(entry)["pending"])
                    self.assertEqual(state["result"]["usage"]["total_tokens"], 100)
                    self.assertEqual(state["result"]["qa"]["retried"], 2)
                    self.assertNotIn("BOLD", (folder / "translations.json").read_text())
                    for name in ("translated-layout.pdf", "translated.pdf"):
                        with fitz.open(folder / name) as pdf:
                            self.assertNotIn("BOLD", "".join(page.get_text() for page in pdf).upper())
                            self.assertNotIn("BOLD", str(pdf.get_toc()).upper())
                    service.assistance.gate.assert_not_called()
                    service.assistance.chat.assert_not_called()
