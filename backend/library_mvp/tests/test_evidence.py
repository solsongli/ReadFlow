from __future__ import annotations

import hashlib
import unittest

import httpx
from fastapi import FastAPI

from backend.library_mvp.evidence import EvidenceError, find_evidence, register_evidence_routes, validate_answer

SHA = "a" * 64


class FakeStore:
    def __init__(self):
        self.parsed = {"revision_id": "revision-1", "sha256": SHA, "parse_status": "native_text",
                       "pages": [{"page_idx": 0, "page_label": "i", "text": "ignored",
                                  "blocks": [{"block_id": "p0-b0", "text": "Accuracy reached 92 percent in synthetic examples.",
                                              "bbox": [1, 2, 3, 4]}]},
                                 {"page_idx": 1, "page_label": "1", "text": "ignored",
                                  "blocks": [{"block_id": "p1-b0", "text": "A limitation is missing OCR on scanned pages.",
                                              "bbox": [2, 3, 4, 5]}]}]}
        self.calls = []

    def get_item(self, identity):
        return {"id": identity, "attachments": [{"id": "file-a", "sha256": SHA, "page_count": 2,
                                                  "available": True}]}

    def get_pages(self, identity):
        self.calls.append(identity)
        return self.parsed


class EvidenceTests(unittest.TestCase):
    def test_exact_source_hash_revision_and_page(self):
        result = find_evidence(FakeStore(), "paper-a", "accuracy")
        self.assertEqual(result["kind"], "source-search")
        self.assertFalse(result["model_verified"])
        evidence = result["citations"][0]
        self.assertEqual(evidence["page_idx"], 0)
        self.assertEqual(evidence["page_label"], "i")
        self.assertEqual(evidence["revision_id"], "revision-1")
        self.assertEqual(evidence["sha256"], SHA)
        self.assertEqual(evidence["quote_sha256"], hashlib.sha256(evidence["quote"].encode()).hexdigest())

    def test_scope_rejected_before_reading_file(self):
        store = FakeStore()
        with self.assertRaises(EvidenceError) as raised:
            find_evidence(store, "paper-a", "accuracy", "another-paper-file")
        self.assertEqual(raised.exception.code, "ATTACHMENT_SCOPE_MISMATCH")
        self.assertEqual(store.calls, [])

    def test_no_match_does_not_fabricate_evidence(self):
        self.assertEqual(find_evidence(FakeStore(), "paper-a", "astronomy")["citations"], [])

    def test_stale_parse_hash_rejected(self):
        store = FakeStore()
        store.parsed["sha256"] = "b" * 64
        with self.assertRaises(EvidenceError) as raised:
            find_evidence(store, "paper-a", "accuracy")
        self.assertEqual(raised.exception.code, "PARSE_HASH_MISMATCH")

    def test_page_out_of_bounds_rejected(self):
        store = FakeStore()
        store.parsed["pages"][0]["page_idx"] = 9
        with self.assertRaises(EvidenceError):
            find_evidence(store, "paper-a", "accuracy")

    def test_mock_model_refs_use_source_snapshot(self):
        evidence = find_evidence(FakeStore(), "paper-a", "accuracy")["citations"]
        result = validate_answer("Synthetic accuracy was 92 percent [1].", evidence)
        self.assertEqual(result["citations"], evidence)
        self.assertEqual(result["validation_mode"], "mock-interface")
        self.assertFalse(result["model_verified"])

    def test_fabricated_and_missing_refs_are_rejected(self):
        evidence = find_evidence(FakeStore(), "paper-a", "accuracy")["citations"]
        for answer in ["Unsupported [42].", "No markers."]:
            with self.assertRaises(EvidenceError):
                validate_answer(answer, evidence)

    def test_overlong_and_stopword_queries_rejected(self):
        for query in ["a", "the paper", "x" * 2001, None]:
            with self.assertRaises(EvidenceError):
                find_evidence(FakeStore(), "paper-a", query)


class EvidenceRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_production_has_no_model_provider(self):
        app = FastAPI()
        register_evidence_routes(app, FakeStore())
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://local.test") as client:
            response = await client.post("/api/research/items/paper-a/ai/ask", json={"query": "accuracy"})
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["error"]["code"], "AI_MODEL_NOT_AUTHORIZED")

    async def test_mock_provider_contract_and_pdf_scope(self):
        app = FastAPI()
        register_evidence_routes(app, FakeStore(), ask_provider=lambda question, evidence: "92 percent [1].")
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://local.test") as client:
            response = await client.post("/api/research/items/paper-a/ai/ask", json={"query": "accuracy"})
            self.assertEqual(response.status_code, 200)
            self.assertFalse(response.json()["model_verified"])
            self.assertEqual(response.json()["citations"][0]["page_idx"], 0)
            mismatch = await client.post("/api/research/items/paper-a/ai/ask",
                                        json={"query": "accuracy", "attachment_id": "foreign"})
            self.assertEqual(mismatch.status_code, 409)

    async def test_non_json_request_rejected(self):
        app = FastAPI()
        register_evidence_routes(app, FakeStore())
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://local.test") as client:
            response = await client.post("/api/research/items/paper-a/evidence", content=b'{"query":"accuracy"}')
            self.assertEqual(response.status_code, 415)


if __name__ == "__main__":
    unittest.main()
