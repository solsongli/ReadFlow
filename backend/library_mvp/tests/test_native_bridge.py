"""No real RetainPDF process/library: synthetic blobs and bounded MockTransport."""
from __future__ import annotations

import hashlib
from pathlib import Path
import tempfile
import unittest

import httpx

from backend.library_mvp.native_bridge import NativeBridge, NativeBridgeError
from backend.library_mvp.store import Store
from backend.library_mvp.tests.test_store import synthetic_pdf


class NativeBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="retain-native-bridge-")
        self.store = Store(Path(self.temporary.name))
        self.raw = synthetic_pdf(["Native source evidence", "Second synthetic page"])
        uploaded = self.store.add_pdf(self.raw, filename="synthetic.pdf")
        self.item, self.attachment = uploaded["item"], uploaded["attachment"]
        self.sha = hashlib.sha256(self.raw).hexdigest()
        self.requests = []
        self.clients = []

    def tearDown(self):
        for client in self.clients:
            client.close()
        self.store.close()
        self.temporary.cleanup()

    def bridge(self, handler):
        def transport(request):
            self.requests.append(request)
            self.assertEqual(request.url.host, "127.0.0.1")
            self.assertEqual(request.headers.get("x-api-key"), "synthetic-local-test-key")
            return handler(request)
        client = httpx.Client(transport=httpx.MockTransport(transport))
        self.clients.append(client)
        return NativeBridge("http://127.0.0.1:49117", "synthetic-local-test-key", client=client)

    def envelope(self, data, status=200):
        return httpx.Response(status, json={"code": 0, "message": "ok", "data": data})

    def test_new_registration_is_multipart_source_only_and_sha_verified(self):
        published = False
        def handler(request):
            nonlocal published
            if request.url.path == "/api/v1/uploads":
                self.assertEqual(request.method, "POST")
                self.assertIn("multipart/form-data;", request.headers["content-type"])
                self.assertIn(b'name="file"', request.content)
                self.assertIn(self.raw, request.content)
                self.assertNotIn(b"name=\"library_only\"", request.content)
                self.assertNotIn(b"name=\"developer_mode\"", request.content)
                published = True
                return self.envelope({"upload_id": "synthetic-upload", "document_id": self.sha,
                                      "filename": "synthetic.pdf", "page_count": 2})
            if request.url.path.endswith("/source.pdf"):
                return httpx.Response(200, content=self.raw)
            return self.envelope({"document_id": self.sha, "page_count": 2, "active_job_id": None}) if published else httpx.Response(404)
        bridge = self.bridge(handler)
        result = bridge.register(self.store, self.attachment["id"])
        self.assertTrue(result["reader_ready"], result)
        self.assertEqual(result["native_document_id"], self.sha)
        self.assertIn("research_item_id=" + self.item["id"], result["reader_url"])
        self.assertIn("attachment_id=" + self.attachment["id"], result["reader_url"])
        self.assertNotIn("job_id", result["reader_url"])
        self.assertFalse(any("/ocr" in str(request.url) or "/translate" in str(request.url) or "/jobs" in str(request.url)
                             for request in self.requests))
        self.assertEqual(self.store.attachment_path(self.attachment["id"]).read_bytes(), self.raw)

    def test_retry_and_new_bridge_instance_reuse_existing_document(self):
        def handler(request):
            self.assertEqual(request.method, "GET")
            if request.url.path.endswith("/source.pdf"):
                return httpx.Response(200, content=self.raw)
            return self.envelope({"document_id": self.sha, "page_count": 2, "active_job_id": "real-existing-job"})
        bridge = self.bridge(handler)
        self.assertFalse(bridge.cached(self.attachment)["reader_ready"])
        self.assertTrue(bridge.register(self.store, self.attachment["id"])["reader_ready"])
        self.assertTrue(bridge.register(self.store, self.attachment["id"])["reader_ready"])
        self.assertTrue(bridge.cached(self.attachment)["reader_ready"])
        new_bridge = self.bridge(handler)
        self.assertTrue(new_bridge.register(self.store, self.attachment["id"])["reader_ready"])
        self.assertEqual(sum(request.method == "POST" for request in self.requests), 0)

    def test_transport_failure_preserves_store_and_retry_succeeds(self):
        failing = True
        def handler(request):
            if failing:
                raise httpx.ConnectError("Synthetic connection failed", request=request)
            if request.url.path.endswith("/source.pdf"):
                return httpx.Response(200, content=self.raw)
            return self.envelope({"document_id": self.sha, "page_count": 2})
        bridge = self.bridge(handler)
        result = bridge.register(self.store, self.attachment["id"])
        self.assertFalse(result["reader_ready"])
        self.assertEqual(result["native_bridge"]["code"], "NATIVE_SERVICE_UNAVAILABLE")
        self.assertEqual(self.store.get_item(self.item["id"])["attachments"][0]["id"], self.attachment["id"])
        failing = False
        self.assertTrue(bridge.register(self.store, self.attachment["id"])["reader_ready"])

    def test_repair_or_active_revision_checksum_mismatch_never_reuploads(self):
        modified = synthetic_pdf(["Changed source", "Different second page"])
        def handler(request):
            self.assertEqual(request.method, "GET")
            if request.url.path.endswith("/source.pdf"):
                return httpx.Response(200, content=modified)
            return self.envelope({"document_id": self.sha, "page_count": 2, "active_version_id": "changed-source-version"})
        bridge = self.bridge(handler)
        result = bridge.register(self.store, self.attachment["id"])
        self.assertFalse(result["reader_ready"])
        self.assertEqual(result["native_bridge"]["code"], "NATIVE_SOURCE_HASH_MISMATCH")
        self.assertEqual(self.store.attachment_path(self.attachment["id"]).read_bytes(), self.raw)

    def test_auth_and_redirect_failures_are_safe_and_not_followed(self):
        for status, code in ((401, "NATIVE_AUTH_REJECTED"), (403, "NATIVE_AUTH_REJECTED"),
                             (302, "NATIVE_REDIRECT_BLOCKED")):
            with self.subTest(status=status):
                bridge = self.bridge(lambda request: httpx.Response(status, headers={"Location": "https://external.invalid/source"}))
                result = bridge.register(self.store, self.attachment["id"])
                self.assertFalse(result["reader_ready"])
                self.assertEqual(result["native_bridge"]["code"], code)
                self.assertNotIn("synthetic-local-test-key", str(result))

    def test_invalid_upload_identity_is_reported_as_partial_failure(self):
        def handler(request):
            if request.method == "POST":
                return self.envelope({"document_id": "0" * 64})
            return httpx.Response(404)
        result = self.bridge(handler).register(self.store, self.attachment["id"])
        self.assertFalse(result["reader_ready"])
        self.assertEqual(result["native_bridge"]["code"], "NATIVE_IDENTITY_MISMATCH")
        self.assertTrue(self.store.attachment_path(self.attachment["id"]).is_file())

    def test_missing_native_source_can_be_published_without_a_job(self):
        source_present = False
        def handler(request):
            nonlocal source_present
            if request.method == "POST":
                source_present = True
                return self.envelope({"document_id": self.sha})
            if request.url.path.endswith("/source.pdf"):
                return httpx.Response(200, content=self.raw) if source_present else httpx.Response(404)
            return self.envelope({"document_id": self.sha, "page_count": 2})
        result = self.bridge(handler).register(self.store, self.attachment["id"])
        self.assertTrue(result["reader_ready"], result)
        self.assertEqual(sum(request.method == "POST" for request in self.requests), 1)

    def test_only_explicit_loopback_origin_is_accepted(self):
        for url in ("https://127.0.0.1:49117", "http://192.168.1.10:49117", "http://example.invalid:49117",
                    "http://127.0.0.1", "http://127.0.0.1:49117/api/v1", "http://127.0.0.1:49117/?x=1",
                    "http://key:secret@127.0.0.1:49117"):
            with self.subTest(url=url), self.assertRaises(NativeBridgeError):
                NativeBridge(url, "synthetic-local-test-key")
        with self.assertRaises(NativeBridgeError):
            NativeBridge("http://127.0.0.1:49117", "")


if __name__ == "__main__":
    unittest.main()
