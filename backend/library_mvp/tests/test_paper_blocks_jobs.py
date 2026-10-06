"""Fake transports only; task lifetime, HTTP contracts, cancellation and credential hygiene."""
import asyncio
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

import httpx
import pymupdf
from backend.library_mvp.api import create_app
from backend.library_mvp.paper_blocks_render import runtime_paths
from backend.library_mvp.store import StoreError


class BlockJobTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.app = create_app(self.root, allow_external_models=True)
        self.lifespan = self.app.router.lifespan_context(self.app)
        await self.lifespan.__aenter__()
        self.service = self.app.state.paper_blocks
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://localhost")
        self.config = {
            "base_url": "http://127.0.0.1:9/v1",
            "model": "synthetic",
            "api_key": "synthetic-private-test-value",
        }
        self.items = []
        for i in range(3):
            with pymupdf.open() as doc:
                doc.new_page().insert_text((40, 150), f"Synthetic document {i} with useful body text.")
                imported = self.app.state.store.add_pdf(doc.tobytes(), filename=f"test-{i}.pdf")
            document = self.service.storage.extract(imported["attachment"])
            self.items.append((imported["item"]["id"], document["blocks"][0]["id"]))
        self.url = f"/api/research/workbench/items/{self.items[0][0]}/blocks"
        self.calls = []

        def fake(config, messages, **kwargs):
            rows = json.loads(messages[-1]["content"])["blocks"]
            self.calls.append([r["id"] for r in rows])
            return json.dumps({"blocks": [{"id": r["id"], "text": "【译】" + r["text"]} for r in rows]})

        self.service.assistance.chat = fake

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.lifespan.__aexit__(None, None, None)
        self.temp.cleanup()

    async def settled(self, identity):
        deadline = time.monotonic() + 15
        while identity in self.service.controls and time.monotonic() < deadline:
            await asyncio.sleep(0.01)
        self.assertNotIn(identity, self.service.controls)
        return self.service.jobs[identity]

    async def test_precheck_gate_single_block_cache_and_http_files(self):
        response = await self.client.post(self.url + "/translate", json={})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"]["code"], "unconfigured")
        self.service.assistance.allowed = False
        response = await self.client.post(self.url + "/translate", json={"translation": self.config})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.calls, [])
        self.service.assistance.allowed = True
        payload = {"translation": self.config, "block_id": self.items[0][1]}
        response = await self.client.post(self.url + "/translate", json=payload)
        self.assertEqual(response.status_code, 202)
        self.assertEqual((await self.settled(response.json()["id"]))["status"], "done")
        repeated = await self.client.post(self.url + "/translate", json=payload)
        await self.settled(repeated.json()["id"])
        self.assertEqual(len(self.calls), 2)  # Echo-only fake fails QA and receives one strict retry.
        state = (await self.client.get(self.url)).json()
        self.assertTrue(state["has_translation"])
        self.assertFalse((await self.client.get(self.url + "?language=en")).json()["has_translation"])
        self.assertEqual(state["jobs"][-1]["scope"], "block")
        self.assertIn("【译】", state["document"]["blocks"][0]["translation"])
        self.assertIsNone(state["result"])  # A single-block request does not silently translate other blocks.
        missing = await self.client.get(self.url + "/files/translated.pdf")
        forbidden = await self.client.get(self.url + "/files/selection.json")
        self.assertEqual((missing.status_code, forbidden.status_code), (404, 404))
        archive = await self.client.get(self.url + "/latex")
        self.assertEqual(archive.headers["content-type"], "application/zip")

    async def test_at_most_two_requests_dedup_and_queued_cancel_release_credentials(self):
        entered = threading.Barrier(3)
        release = threading.Event()
        active, peak, started = 0, 0, 0
        lock = threading.Lock()

        def waiting(config, messages, control=None, **options):
            nonlocal active, peak, started
            with lock:
                active += 1
                started += 1
                synchronize = started <= 2
                peak = max(peak, active)
            control.add_cancel_callback(release.set)
            try:
                # Only the first two calls rendezvous. Quality retries are later
                # requests, and a broken fake barrier must not leak the active counter.
                if synchronize:
                    entered.wait(timeout=5)
                release.wait(timeout=5)
            finally:
                with lock:
                    active -= 1
            control.raise_if_stopped()
            rows = json.loads(messages[-1]["content"])["blocks"]
            return json.dumps({"blocks": [{"id": r["id"], "text": r["text"]} for r in rows]})

        self.service.assistance.chat = waiting
        jobs = []
        for item, block in self.items:
            jobs.append(self.service.start(item, {"translation": self.config, "block_id": block}))
        await asyncio.to_thread(entered.wait, 5)
        same = self.service.start(self.items[0][0], {"translation": self.config, "block_id": self.items[0][1]})
        self.assertEqual(same["id"], jobs[0]["id"])
        credentials = self.service.controls[jobs[2]["id"]]["credentials"]
        self.service.cancel(self.items[2][0], jobs[2]["id"])
        self.assertFalse(credentials)
        self.service.cancel(self.items[0][0], jobs[0]["id"])
        release.set()
        results = [await self.settled(job["id"]) for job in jobs]
        self.assertEqual(peak, 2)
        self.assertEqual(results[0]["status"], "cancelled")
        self.assertEqual(results[2]["status"], "cancelled")
        for path in self.root.rglob("*"):
            if path.is_file():
                self.assertNotIn(self.config["api_key"].encode(), path.read_bytes())

    async def test_failure_redaction_and_retry(self):
        def failed(*args, **kwargs):
            raise RuntimeError("401 " + self.config["api_key"])

        original = self.service.assistance.chat
        self.service.assistance.chat = failed
        payload = {"translation": self.config, "block_id": self.items[0][1]}
        job = self.service.start(self.items[0][0], payload)
        failed_job = await self.settled(job["id"])
        self.assertEqual(failed_job["error"]["code"], "credentials")
        self.assertNotIn(self.config["api_key"], json.dumps(failed_job))
        self.service.assistance.chat = original
        retry = self.service.start(self.items[0][0], payload)
        self.assertEqual((await self.settled(retry["id"]))["status"], "done")

    async def test_block_job_survives_render_failure_after_a_failed_job(self):
        """A single-block job must not fail because the PDF refresh fails (e.g. Typst missing on CI)."""
        import os
        from unittest import mock

        def failed(*args, **kwargs):
            raise RuntimeError("401 synthetic")

        original = self.service.assistance.chat
        self.service.assistance.chat = failed
        payload = {"translation": self.config, "block_id": self.items[0][1]}
        first = await self.settled(self.service.start(self.items[0][0], payload)["id"])
        self.assertEqual(first["status"], "failed")
        self.service.assistance.chat = original
        with mock.patch.dict(os.environ, {"READFLOW_TYPST_BIN": "/nonexistent/typst"}):
            retry = await self.settled(self.service.start(self.items[0][0], payload)["id"])
        self.assertEqual(retry["status"], "done")

    async def test_failed_new_service_keeps_existing_current_language_translation_visible(self):
        payload = {"translation": self.config, "block_id": self.items[0][1]}
        good = self.service.start(self.items[0][0], payload)
        self.assertEqual((await self.settled(good["id"]))["status"], "done")

        def failed(*args, **kwargs):
            raise RuntimeError("429 synthetic failure")

        self.service.assistance.chat = failed
        bad = self.service.start(self.items[0][0], {**payload, "translation": {**self.config, "model": "other"}})
        self.assertEqual((await self.settled(bad["id"]))["status"], "failed")
        status = self.service.status(self.items[0][0], language="zh-CN")
        self.assertTrue(status["has_translation"])
        self.assertTrue(status["document"]["blocks"][0]["translation"])

    async def test_provider_echo_with_json_escapes_cannot_persist_credentials(self):
        def echo(config, messages, **kwargs):
            row = json.loads(messages[-1]["content"])["blocks"][0]
            result = json.dumps({"blocks": [{"id": row["id"], "text": config["api_key"]}]})
            escaped = "".join("\\u%04x" % ord(c) for c in config["api_key"])
            return result.replace(config["api_key"], escaped)

        self.service.assistance.chat = echo
        job = self.service.start(self.items[0][0], {"translation": self.config, "block_id": self.items[0][1]})
        self.assertEqual((await self.settled(job["id"]))["status"], "done")
        for path in self.root.rglob("*"):
            if path.is_file():
                self.assertNotIn(self.config["api_key"].encode(), path.read_bytes())
        value = self.service.status(self.items[0][0])["document"]["blocks"][0]["translation"]
        self.assertEqual(value, "[已隐藏]")

    async def test_complete_task_creates_new_pdf_when_typst_is_available(self):
        try:
            runtime_paths()
        except StoreError:
            self.skipTest("CI has no bundled Typst; exercised with the shipped runtime locally")
        job = self.service.start(self.items[0][0], {"translation": self.config})
        self.assertEqual((await self.settled(job["id"]))["status"], "done")
        result = (await self.client.get(self.url)).json()["result"]
        self.assertEqual(result["language"], "zh-CN")
        response = await self.client.get(self.url + "/files/translated.pdf")
        self.assertEqual(response.status_code, 200)
        with pymupdf.open(stream=response.content, filetype="pdf") as pdf:
            self.assertIn("【译】", pdf[0].get_text())

    async def test_scan_page_explains_ocr_limit_without_model_call(self):
        with pymupdf.open() as doc:
            doc.new_page()
            item = self.app.state.store.add_pdf(doc.tobytes(), filename="blank.pdf")["item"]["id"]
        job = self.service.start(item, {"translation": self.config})
        result = await self.settled(job["id"])
        self.assertEqual(result["error"]["code"], "no_text")
        self.assertEqual(self.calls, [])

