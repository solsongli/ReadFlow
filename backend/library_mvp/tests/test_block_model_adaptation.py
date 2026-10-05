"""All HTTP is in-process fake transport, including retries, JSON negotiation and usage."""
import json
import unittest
import httpx
from backend.library_mvp.paper_blocks_transport import run_batch
from backend.library_mvp.paper_blocks_translate import translate_blocks, batches, estimate_tokens
from backend.library_mvp.paper_blocks_model import cache_key
from ops.development.readflow_fake_openai import completion_response


class ModelAdaptationTests(unittest.TestCase):
    def config(self, model):
        return {"model": model, "base_url": "http://127.0.0.1:9/v1", "api_key": "fixture-only"}

    def pipeline(self, mode):
        counts, requests, usage = 0, [], 0
        blocks = [
            {"id": str(i), "text": "Source evidence.", "type": "text", "protected": [], "section": "Methods"}
            for i in range(5)
        ]
        config = self.config(mode)

        def handle(request):
            nonlocal counts
            body = json.loads(request.content)
            requests.append(body)
            status, value = completion_response(body, counts)
            counts += 1
            return httpx.Response(status, json=value)

        def call(messages):
            nonlocal usage
            result = run_batch(config, messages, transport=httpx.MockTransport(handle), backoff=lambda *_: None)
            usage += result["usage"]["total_tokens"]
            return result

        cache = {}
        errors = translate_blocks(
            blocks,
            cache,
            "zh-CN",
            "test",
            call,
            [],
            lambda: None,
            lambda *_: None,
            cache.update,
            title="Synthetic paper",
            plan=lambda rows, *_: list(batches(rows)),
        )
        self.assertEqual(errors, [])
        self.assertEqual(len(cache), 5)
        self.assertTrue(all(cache_key(b, "zh-CN", "test") in cache for b in blocks))
        self.assertGreater(usage, 0)
        for request in requests:
            body = json.loads(request["messages"][-1]["content"])
            self.assertEqual(body["paper_title"], "Synthetic paper")
            self.assertTrue(all(b["section"] == "Methods" for b in body["blocks"]))
        return requests

    def test_fenced_json_is_accepted(self):
        self.assertEqual(len(self.pipeline("readflow-fenced")), 1)

    def test_length_splits_batches_and_accumulates_usage(self):
        calls = self.pipeline("readflow-length")
        self.assertGreater(len(calls), 1)
        self.assertLess(len(json.loads(calls[-1]["messages"][-1]["content"])["blocks"]), 5)

    def test_429_then_success(self):
        self.assertEqual(len(self.pipeline("readflow-rate-limit")), 2)

    def test_missing_or_tampered_id_retries_only_that_block(self):
        for mode in ("readflow-missing", "readflow-tampered"):
            calls = self.pipeline(mode)
            self.assertEqual(len(calls), 2)
            self.assertEqual(len(json.loads(calls[1]["messages"][-1]["content"])["blocks"]), 1)

    def test_json_mode_falls_back_on_explicit_unsupported_response(self):
        calls = self.pipeline("readflow-no-json")
        self.assertIn("response_format", calls[0])
        self.assertNotIn("response_format", calls[1])

    def test_retry_limit_and_backoff_for_5xx(self):
        waits, calls = [], []

        def handle(request):
            calls.append(request)
            return httpx.Response(503, json={"error": "fixture service offline"})

        with self.assertRaises(RuntimeError):
            run_batch(
                self.config("synthetic"),
                [],
                transport=httpx.MockTransport(handle),
                backoff=lambda seconds, _: waits.append(seconds),
            )
        self.assertEqual(len(calls), 4)
        self.assertEqual(waits, [1, 2, 4])

    def test_dynamic_budget_accounts_for_cjk_tokens(self):
        self.assertGreater(estimate_tokens("学" * 400), estimate_tokens("a" * 400))
        blocks = [{"text": "学" * 900} for _ in range(5)]
        self.assertEqual([len(b) for b in batches(blocks)], [2, 2, 1])
