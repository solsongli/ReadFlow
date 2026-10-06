"""Job-level local failures and persisted diagnostics, with fake transports and no external calls."""
import asyncio
import json
from pathlib import Path
import tempfile
import unittest
import httpx
import pymupdf as fitz
from backend.library_mvp.api import create_app
from backend.library_mvp.paper_blocks_model import SCHEMA_VERSION, EXTRACTOR_VERSION, protected_ranges
from backend.library_mvp.paper_blocks_storage import write_json
from backend.library_mvp.document_models import revision
from backend.library_mvp.paper_blocks_render import runtime_paths
from backend.library_mvp.store import StoreError
from ops.development.readflow_fake_openai import completion_response


class RobustJobFlowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        try:
            runtime_paths()
        except StoreError:
            self.skipTest("Bundled Typst unavailable; domain/transport robustness tests still run")
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.temp.name), allow_external_models=True)
        self.scope = self.app.router.lifespan_context(self.app)
        await self.scope.__aenter__()
        self.service = self.app.state.paper_blocks
        self.secret = "offline-test-value"
        self.source = "Task. Fine manipulation improves policy accuracy to 95% over 20 trials [1], and fine manipulation generalizes."
        with fitz.open() as pdf:
            page = pdf.new_page()
            page.insert_text((50, 150), self.source, fontsize=10)
            imported = self.app.state.store.add_pdf(pdf.tobytes(), filename="robust.pdf")
        self.entry, self.item = imported["attachment"], imported["item"]["id"]
        root = self.service.storage.directory(self.entry)
        block = {
            "id": "111111111111111111111111",
            "page": 1,
            "type": "text",
            "text": self.source,
            "size": 10,
            "source_lines": [{"lead": "Task."}],
            "protected": protected_ranges(self.source),
            "anchors": [{"page": 1, "bbox": [50, 135, 545, 190], "view_bbox": [0.08, 0.16, 0.92, 0.23]}],
        }
        write_json(
            root / "blocks.json",
            {
                "schema_version": SCHEMA_VERSION,
                "extractor_version": EXTRACTOR_VERSION,
                "model_revision": revision(),
                "blocks": [block],
                "warnings": [],
                "pages": [{"page": 1, "width": 595, "height": 842}],
            },
        )
        self.config = {"base_url": "http://127.0.0.1:9/v1", "model": "fixture", "api_key": self.secret}

    async def asyncTearDown(self):
        await self.scope.__aexit__(None, None, None)
        self.temp.cleanup()

    async def settle(self, job):
        for _ in range(400):
            if job["id"] not in self.service.controls:
                return self.service.jobs[job["id"]]
            await asyncio.sleep(0.01)
        self.fail("Fake job did not settle")

    async def test_terms_failure_continues_batches_with_diagnostics_and_usage(self):
        counter = 0

        def call(config, messages, **kwargs):
            nonlocal counter
            if messages[0]["content"].startswith("READFLOW_PAPER_TERMS"):
                error = RuntimeError("Fixed fake service error")
                error.http_status = 503
                error.provider_code = "server_error"
                error.safe_error = {"code": "network", "message": "模型服务暂不可达"}
                raise error
            status, response = completion_response(
                {"model": "readflow-real-variants", "messages": messages}, counter
            )
            counter += 1
            return {"content": response["choices"][0]["message"]["content"], "usage": response["usage"]}

        self.service.assistance.chat = call
        job = await self.settle(self.service.start(self.item, {"translation": self.config}))
        self.assertEqual(job["status"], "done", job.get("error"))
        self.assertIn("terms_unavailable", job["notices"])
        self.assertEqual(job["diagnostics"][0]["stage"], "terms")
        self.assertEqual(job["diagnostics"][0]["http_status"], 503)
        result = self.service.storage.result(self.entry)
        self.assertIn("terms_unavailable", result["notices"])
        self.assertGreater(result["usage"]["total_tokens"], 0)
        self.assertEqual(result["qa"]["needs_review"], 0)
        self.assertNotIn(self.secret, json.dumps(result))
        self.assertNotIn(self.source, json.dumps(result))

    async def test_authentication_is_global_and_persists_safe_stage(self):
        def call(*args, **kwargs):
            error = RuntimeError(self.secret + " " + self.source)
            error.http_status = 401
            error.provider_code = "invalid_api_key"
            error.safe_error = {"code": "credentials", "message": "模型服务认证失败"}
            raise error

        self.service.assistance.chat = call
        job = await self.settle(self.service.start(self.item, {"translation": self.config}))
        self.assertEqual(job["status"], "failed")
        self.assertEqual(
            job["error"]["details"],
            {
                "stage": "terms",
                "exception": "RuntimeError",
                "http_status": 401,
                "provider_code": "invalid_api_key",
            },
        )
        result = self.service.storage.result(self.entry)
        self.assertEqual(result["error"], job["error"])
        self.assertNotIn(self.secret, json.dumps(result))
        self.assertNotIn(self.source, json.dumps(result))

    async def test_total_network_failure_finishes_retries_then_reports_network(self):
        self.service.assistance.chat = lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectTimeout(""))
        job = await self.settle(self.service.start(self.item, {"translation": self.config}))
        self.assertEqual(job["status"], "failed")
        self.assertEqual(job["error"]["code"], "network")
        self.assertEqual(job["error"]["details"]["exception"], "ConnectTimeout")
        self.assertEqual(job["error"]["details"]["stage"], "batch")
        self.assertEqual(self.service.storage.result(self.entry)["error"], job["error"])

    async def test_local_qa_refresh_uses_cache_without_model_or_credentials(self):
        def call(config, messages, **kwargs):
            status, response = completion_response(
                {"model": "readflow-real-variants", "messages": messages}, 0
            )
            return {"content": response["choices"][0]["message"]["content"], "usage": response["usage"]}

        self.service.assistance.chat = call
        job = await self.settle(self.service.start(self.item, {"translation": self.config}))
        self.assertEqual(job["status"], "done")
        cache = self.service.storage.cache(self.entry)
        for value in cache.values():
            value["qa"]["issues"] = ["terminology"]
        self.service.storage.merge_cache(self.entry, cache)
        self.service.assistance.chat = lambda *a, **k: self.fail("No model request is permitted")
        self.service.assistance.allowed = False
        client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://localhost")
        async with client:
            response = await client.post(
                f"/api/research/workbench/items/{self.item}/blocks/recheck",
                json={"language": "zh-CN", "glossary_id": ""},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["model_requests"], 0)
            self.assertEqual(response.json()["qa"]["needs_review"], 0)
