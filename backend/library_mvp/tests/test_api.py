"""ASGI tests do not open a real browser, source library, or model service."""
from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx

from backend.library_mvp.api import create_app
from backend.library_mvp.tests.test_store import synthetic_pdf


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="retain-research-api-test-")
        self.app = create_app(Path(self.temporary.name))
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://localhost")

    async def asyncTearDown(self):
        await self.client.aclose()
        self.app.state.store.close()
        self.temporary.cleanup()

    async def upload(self, *, item_id=None, lines=None):
        params = {"filename": "synthetic.pdf"}
        if item_id:
            params["item_id"] = item_id
        response = await self.client.post("/api/research/files", params=params,
                                          content=synthetic_pdf(lines or ["Alpha source evidence"]),
                                          headers={"Content-Type": "application/pdf"})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    async def test_complete_local_library_and_persistent_page_note_flow(self):
        self.assertTrue((await self.client.get("/healthz")).json()["ok"])
        self.assertEqual((await self.client.get("/healthz")).json()["ai"]["status"], "not-verified")
        collection = (await self.client.post("/api/research/collections", json={"name": "Synthetic collection"})).json()
        uploaded = await self.upload(lines=["Page one alpha", "Page two beta"])
        item, attachment = uploaded["item"], uploaded["attachment"]
        edited = await self.client.patch("/api/research/items/" + item["id"], json={
            "title": "Edited synthetic paper", "authors": ["Ada Example"], "tags": ["read"],
            "collection_ids": [collection["id"]]})
        self.assertEqual(edited.status_code, 200)
        pages = (await self.client.get("/api/research/attachments/" + attachment["id"] + "/pages")).json()
        self.assertEqual(pages["parse_status"], "native_text")
        note = await self.client.post("/api/research/items/" + item["id"] + "/notes", json={
            "attachment_id": attachment["id"], "page_idx": 1, "quote": "Page two beta", "body": "Persistent note"})
        self.assertEqual(note.status_code, 201)
        read = await self.client.get("/api/research/items/" + item["id"])
        self.assertEqual(read.json()["notes"][0]["page_idx"], 1)
        listing = await self.client.get("/api/research/items", params={"query": "Edited", "collection_id": collection["id"]})
        self.assertEqual(len(listing.json()["items"]), 1)
        pdf = await self.client.get("/api/research/attachments/" + attachment["id"] + "/pdf")
        self.assertEqual(pdf.status_code, 200)
        self.assertIn("application/pdf", pdf.headers["content-type"])
        self.assertEqual(pdf.headers["x-pdf-sha256"], attachment["sha256"])
        markdown = await self.client.get("/api/research/items/" + item["id"] + "/export")
        self.assertIn("PDF page 2", markdown.text)
        self.assertIn("attachment", markdown.headers["content-disposition"])

    async def test_write_content_type_and_invalid_json_are_rejected(self):
        wrong = await self.client.post("/api/research/items", content='{"title":"wrong"}',
                                       headers={"Content-Type": "text/plain"})
        self.assertEqual(wrong.status_code, 415)
        invalid = await self.client.post("/api/research/items", content="{", headers={"Content-Type": "application/json"})
        self.assertEqual(invalid.status_code, 400)
        array = await self.client.post("/api/research/items", json=[])
        self.assertEqual(array.status_code, 400)
        wrong_pdf = await self.client.post("/api/research/files", content=synthetic_pdf(["Evidence"]),
                                           headers={"Content-Type": "application/octet-stream"})
        self.assertEqual(wrong_pdf.status_code, 415)

    async def test_note_scope_and_page_errors_do_not_persist(self):
        first = await self.upload()
        other = (await self.client.post("/api/research/items", json={"title": "Other paper"})).json()
        foreign = await self.client.post("/api/research/items/" + other["id"] + "/notes", json={
            "attachment_id": first["attachment"]["id"], "page_idx": 0, "body": "Invalid foreign reference"})
        self.assertEqual(foreign.status_code, 400)
        self.assertEqual(foreign.json()["error"]["code"], "ATTACHMENT_SCOPE_MISMATCH")
        invalid_page = await self.client.post("/api/research/items/" + first["item"]["id"] + "/notes", json={
            "attachment_id": first["attachment"]["id"], "page_idx": 5, "body": "Invalid page"})
        self.assertEqual(invalid_page.status_code, 400)
        self.assertEqual((await self.client.get("/api/research/items/" + other["id"])).json()["notes"], [])

    async def test_notes_edit_and_delete(self):
        item = (await self.client.post("/api/research/items", json={"title": "Note-only paper"})).json()
        response = await self.client.post("/api/research/items/" + item["id"] + "/notes", json={"body": "First"})
        identity = response.json()["id"]
        edited = await self.client.patch("/api/research/notes/" + identity, json={"body": "Second"})
        self.assertEqual(edited.json()["body"], "Second")
        self.assertEqual((await self.client.delete("/api/research/notes/" + identity)).status_code, 204)
        self.assertEqual((await self.client.get("/api/research/items/" + item["id"])).json()["notes"], [])
        missing = await self.client.get("/api/research/items/missing")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.json()["error"]["code"], "NOT_FOUND")

    async def test_blank_pdf_and_exports(self):
        response = await self.client.post("/api/research/files", content=synthetic_pdf([""]),
                                           headers={"Content-Type": "application/pdf"})
        item_id = response.json()["item"]["id"]
        attachment_id = response.json()["attachment"]["id"]
        parsed = await self.client.get("/api/research/attachments/" + attachment_id + "/pages")
        self.assertEqual(parsed.json()["parse_status"], "needs_ocr")
        for format in ("markdown", "bibtex", "csljson", "sourcejson"):
            exported = await self.client.get("/api/research/items/" + item_id + "/export", params={"format": format})
            self.assertEqual(exported.status_code, 200)
            self.assertIn("attachment", exported.headers["content-disposition"])
        wrong = await self.client.get("/api/research/items/" + item_id + "/export", params={"format": "wordplugin"})
        self.assertEqual(wrong.status_code, 400)


    async def test_zotero_preview_commit_idempotence_and_guarded_rollback(self):
        payload = {"format": "zotero-api", "source_id": "local:synthetic:users:0", "data": {
            "items": [{"key": "ITEM0001", "version": 1, "data": {"key": "ITEM0001", "version": 1,
                       "itemType": "journalArticle", "title": "Synthetic migrated paper",
                       "creators": [{"creatorType": "author", "firstName": "Ada", "lastName": "Example"}],
                       "collections": ["COLL0001"], "tags": [{"tag": "synthetic"}]}},
                      {"key": "NOTE0001", "version": 1, "data": {"key": "NOTE0001", "version": 1,
                       "itemType": "note", "parentItem": "ITEM0001", "note": "<p>合成笔记</p>"}}],
            "collections": [{"key": "COLL0001", "version": 1, "data": {"key": "COLL0001", "version": 1,
                              "name": "Synthetic collection", "parentCollection": False}}]}}
        preview = await self.client.post("/api/research/imports/preview", json=payload)
        self.assertEqual(preview.status_code, 200, preview.text)
        plan_hash = preview.json()["plan_hash"]
        mismatch = await self.client.post("/api/research/imports/commit", json={"payload": payload, "plan_hash": "wrong"})
        self.assertEqual(mismatch.status_code, 409)
        self.assertEqual((await self.client.get("/api/research/items")).json()["items"], [])
        imported = await self.client.post("/api/research/imports/commit", json={"payload": payload, "plan_hash": plan_hash})
        self.assertEqual(imported.status_code, 200, imported.text)
        self.assertEqual(imported.json()["created_items"], 1)
        repeated = await self.client.post("/api/research/imports/commit", json={"payload": payload, "plan_hash": plan_hash})
        self.assertEqual(repeated.json()["unchanged_items"], 1)
        item = (await self.client.get("/api/research/items")).json()["items"][0]
        self.assertEqual(item["authors"], ["Ada Example"])
        self.assertIn("合成笔记", item["notes"][0]["body"])
        rollback = await self.client.post("/api/research/imports/" + imported.json()["batch_id"] + "/rollback", json={})
        self.assertEqual(rollback.status_code, 200, rollback.text)
        self.assertTrue(rollback.json()["rolled_back"])
        self.assertEqual((await self.client.get("/api/research/items")).json()["items"], [])


    async def test_legacy_zotero_namespace_requirement_is_visible(self):
        from backend.library_mvp.zotero import LocalSnapshotError
        with patch("backend.library_mvp.zotero.fetch_local_snapshot",
                   side_effect=LocalSnapshotError("LOCAL_SOURCE_NAMESPACE_REQUIRED", "Choose a unique name for this source library.")) as fetch:
            response = await self.client.get("/api/research/imports/zotero-local/preview")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "LOCAL_SOURCE_NAMESPACE_REQUIRED")
        self.assertIn("unique", response.json()["error"]["message"])
        fetch.assert_called_once_with(source_namespace=None)
        self.assertEqual((await self.client.get("/api/research/items")).json()["items"], [])

    async def test_explicit_legacy_namespace_is_forwarded_without_network(self):
        payload = {"format": "zotero-api", "source_id": "local:legacy:my-legacy-research-library:users:0",
                   "data": {"items": [{"key": "LEGACY01", "version": 1, "data": {
                       "key": "LEGACY01", "version": 1, "itemType": "journalArticle", "title": "Synthetic legacy paper"}}],
                            "collections": []}}
        with patch("backend.library_mvp.zotero.fetch_local_snapshot", return_value=payload) as fetch:
            response = await self.client.get("/api/research/imports/zotero-local/preview",
                                              params={"source_namespace": "my-legacy-research-library"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["plan"]["source_id"], payload["source_id"])
        fetch.assert_called_once_with(source_namespace="my-legacy-research-library")
        self.assertEqual((await self.client.get("/api/research/items")).json()["items"], [])



class NativeApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from backend.library_mvp.native_bridge import NativeBridge
        import hashlib
        self.temporary = tempfile.TemporaryDirectory(prefix="retain-native-api-test-")
        self.raw = synthetic_pdf(["Original reader source evidence"])
        self.sha = hashlib.sha256(self.raw).hexdigest()
        self.native_documents = set()
        self.native_calls = []
        self.fail_native = False
        self.mismatched_native_source = False
        def native_handler(request):
            self.native_calls.append(request)
            self.assertEqual(request.headers.get("x-api-key"), "synthetic-local-test-key")
            if self.fail_native:
                raise httpx.ConnectError("Synthetic local service is offline", request=request)
            if request.url.path == "/api/v1/uploads":
                self.assertIn(self.raw, request.content)
                self.native_documents.add(self.sha)
                return httpx.Response(200, json={"code": 0, "data": {"document_id": self.sha}})
            if request.url.path.endswith("/source.pdf"):
                raw = b"synthetic mismatched PDF" if self.mismatched_native_source else self.raw
                return httpx.Response(200, content=raw)
            if self.sha in self.native_documents:
                return httpx.Response(200, json={"code": 0, "data": {
                    "document_id": self.sha, "page_count": 1, "active_job_id": None}})
            return httpx.Response(404)
        self.native_client = httpx.Client(transport=httpx.MockTransport(native_handler))
        self.bridge = NativeBridge("http://127.0.0.1:49117", "synthetic-local-test-key", client=self.native_client)
        self.app = create_app(Path(self.temporary.name), bridge=self.bridge)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://localhost")

    async def asyncTearDown(self):
        await self.client.aclose()
        self.native_client.close()
        self.app.state.store.close()
        self.temporary.cleanup()

    async def upload(self):
        return await self.client.post("/api/research/files", params={"filename": "native.pdf"},
                                      content=self.raw, headers={"Content-Type": "application/pdf"})

    async def test_api_upload_is_reader_ready_only_after_source_verification(self):
        response = await self.upload()
        self.assertEqual(response.status_code, 201, response.text)
        result = response.json()
        self.assertFalse(result["partial_failure"])
        self.assertTrue(result["attachment"]["reader_ready"])
        self.assertEqual(result["attachment"]["native_document_id"], self.sha)
        self.assertEqual(result["native_bridge"]["verified_sha256"], self.sha)
        item = (await self.client.get("/api/research/items/" + result["item"]["id"])).json()
        self.assertTrue(item["attachments"][0]["reader_ready"])
        self.assertIn("/reader.html?document_id=", item["attachments"][0]["reader_url"])
        self.assertFalse(any("/jobs" in str(request.url) or "/ocr" in str(request.url) for request in self.native_calls))

    async def test_partial_failure_keeps_pdf_and_retry_is_idempotent(self):
        self.fail_native = True
        response = await self.upload()
        self.assertEqual(response.status_code, 201)
        result = response.json()
        self.assertTrue(result["partial_failure"])
        self.assertFalse(result["attachment"]["reader_ready"])
        attachment_id = result["attachment"]["id"]
        source = await self.client.get("/api/research/attachments/" + attachment_id + "/pdf")
        self.assertEqual(source.content, self.raw)
        self.fail_native = False
        retry = await self.client.post("/api/research/attachments/" + attachment_id + "/native-reader", json={})
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertTrue(retry.json()["attachment"]["reader_ready"])
        self.assertFalse(retry.json()["partial_failure"])
        self.assertEqual(len((await self.client.get("/api/research/items")).json()["items"]), 1)
        again = await self.client.post("/api/research/attachments/" + attachment_id + "/native-reader", json={})
        self.assertEqual(again.status_code, 200)
        self.assertEqual(sum(request.method == "POST" for request in self.native_calls), 1)

    async def test_source_checksum_mismatch_remains_explicit_partial_failure(self):
        self.mismatched_native_source = True
        result = (await self.upload()).json()
        self.assertTrue(result["partial_failure"])
        self.assertFalse(result["attachment"]["reader_ready"])
        self.assertIsNone(result["attachment"]["native_document_id"])
        self.assertEqual(result["native_bridge"]["code"], "NATIVE_SOURCE_HASH_MISMATCH")
        path = self.app.state.store.attachment_path(result["attachment"]["id"])
        self.assertEqual(path.read_bytes(), self.raw)

    async def test_retry_does_not_accept_disk_paths_or_unsupported_payload(self):
        result = (await self.upload()).json()
        retry = await self.client.post("/api/research/attachments/" + result["attachment"]["id"] + "/native-reader",
                                       json={"path": "/private/real-library.pdf"})
        self.assertEqual(retry.status_code, 400)
        self.assertEqual(retry.json()["error"]["code"], "INVALID_NATIVE_REGISTRATION")


if __name__ == "__main__":
    unittest.main()
