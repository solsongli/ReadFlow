"""Deterministic fake batch barriers; no sockets, models or real credentials."""
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import pymupdf
from backend.library_mvp.api import create_app
from backend.library_mvp.paper_blocks_model import cache_key


class ConcurrentBlocks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.temp.name), allow_external_models=True)
        self.service = self.app.state.paper_blocks
        with pymupdf.open() as pdf:
            pdf.new_page().insert_text((40, 100), "Synthetic batch fixture")
            item = self.app.state.store.add_pdf(pdf.tobytes(), filename="batch.pdf")
        self.item, self.entry = item["item"]["id"], item["attachment"]
        self.config = {"base_url": "http://127.0.0.1:9/v1", "model": "synthetic", "api_key": "synthetic-private"}
        self.blocks = [
            {"id": str(i), "type": "text", "text": f"Paragraph {i}.", "protected": []} for i in range(26)
        ]
        self.doc = {"blocks": self.blocks, "extractor_version": "heuristic-2", "schema_version": 1}
        self.patches = [
            patch.object(self.service.storage, "extract", return_value=self.doc),
            patch("backend.library_mvp.paper_blocks_service.runtime_paths", return_value=("", "", "")),
            patch(
                "backend.library_mvp.paper_blocks_service.render",
                return_value={"render_fallback": [], "label_fallback": []},
            ),
        ]
        for p in self.patches:
            p.start()
        self.release = threading.Event()

    def tearDown(self):
        self.release.set()
        self.service.close()
        self.app.state.store.close()
        for p in self.patches:
            p.stop()
        self.temp.cleanup()

    def wait_done(self, job):
        deadline = time.monotonic() + 8
        while job["id"] in self.service.controls and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertNotIn(job["id"], self.service.controls)
        return self.service.jobs[job["id"]]

    def test_one_full_task_has_two_parallel_batches_and_one_write_per_batch(self):
        barrier, lock = threading.Barrier(3), threading.Lock()
        calls, running, peak = [], 0, 0

        def fake(config, messages, control=None, **options):
            nonlocal running, peak
            rows = json.loads(messages[-1]["content"])["blocks"]
            self.assertIn("Simplified Chinese", messages[0]["content"])
            with lock:
                calls.append(rows)
                index = len(calls)
                running += 1
                peak = max(peak, running)
            if index <= 2:
                barrier.wait(timeout=4)
                self.release.wait(timeout=4)
            with lock:
                running -= 1
            return {
                "content": json.dumps({"blocks": [{"id": r["id"], "text": r["text"]} for r in rows]}),
                "usage": {
                    "prompt_tokens": 5,
                    "completion_tokens": 20,
                    "total_tokens": 25,
                    "completion_tokens_details": {"reasoning_tokens": 12},
                },
            }

        self.service.assistance.chat = fake
        writes = []
        original = self.service.merge_cache

        def save(entry, delta):
            writes.append(set(delta))
            original(entry, delta)

        self.service.merge_cache = save
        job = self.service.start(self.item, {"translation": self.config})
        barrier.wait(timeout=4)
        self.assertEqual(peak, 2)
        self.release.set()
        self.assertEqual(self.wait_done(job)["percent"], 100)
        self.assertEqual(self.service.jobs[job["id"]]["usage"]["reasoning_tokens"], 36)
        self.assertEqual(self.service.jobs[job["id"]]["usage"]["total_tokens"], 75)
        result = self.service.storage.result(self.entry)
        self.assertEqual(result["usage"]["reasoning_tokens"], 36)
        self.assertEqual(result["render_fallback"], [])
        self.assertEqual(result["label_fallback"], [])
        self.assertNotIn("fallback_blocks", result)
        self.assertEqual(len(calls), 3)
        self.assertEqual(sorted(map(len, writes)), [2, 12, 12])
        self.assertEqual(len(self.service.storage.cache(self.entry)), 26)

    def test_single_and_full_coexist_and_atomic_delta_commits_do_not_lose_other_language(self):
        self.doc["blocks"] = self.blocks[:2]
        barrier = threading.Barrier(3)

        def fake(config, messages, control=None, **options):
            barrier.wait(timeout=4)
            self.release.wait(timeout=4)
            rows = json.loads(messages[-1]["content"])["blocks"]
            return json.dumps({"blocks": [{"id": r["id"], "text": r["text"]} for r in rows]})

        self.service.assistance.chat = fake
        single = self.service.start(self.item, {"translation": self.config, "block_id": "0", "language": "en"})
        full = self.service.start(self.item, {"translation": self.config})
        self.assertNotEqual(single["id"], full["id"])
        same = self.service.start(self.item, {"translation": self.config})
        self.assertEqual(full["id"], same["id"])
        barrier.wait(timeout=4)
        self.release.set()
        self.assertEqual(self.wait_done(single)["status"], "done")
        self.assertEqual(self.wait_done(full)["status"], "done")
        cache = self.service.storage.cache(self.entry)
        self.assertEqual(len(cache), 3)
        for block in self.blocks[:2]:
            self.assertIn(cache_key(block, "zh-CN", full["fingerprint"]), cache)
        self.assertIn(cache_key(self.blocks[0], "en", single["fingerprint"]), cache)

    def test_cancel_interrupts_both_inflight_batches_and_clears_credentials(self):
        barrier = threading.Barrier(3)
        controls = []

        def fake(config, messages, control=None, **options):
            controls.append(control)
            control.add_cancel_callback(self.release.set)
            barrier.wait(timeout=4)
            self.release.wait(timeout=4)
            control.raise_if_stopped()
            raise AssertionError("Cancelled requests cannot complete")

        self.service.assistance.chat = fake
        job = self.service.start(self.item, {"translation": self.config})
        barrier.wait(timeout=4)
        credentials = self.service.controls[job["id"]]["credentials"]
        self.service.cancel(self.item, job["id"])
        self.assertFalse(credentials)
        done = self.wait_done(job)
        self.assertEqual(done["status"], "cancelled")
        self.assertLess(done["percent"], 100)
        self.assertEqual(len(controls), 2)
        self.assertEqual(self.service.storage.cache(self.entry), {})
