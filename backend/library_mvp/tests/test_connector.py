"""Synthetic-only Connector API tests; no real browser, extension or network."""
from __future__ import annotations

import asyncio
import copy
from email.header import Header
import json
from pathlib import Path
import tempfile
import unittest
import uuid

import httpx

from backend.library_mvp.connector import (
    ConnectorService, StoreConnectorBackend, create_connector_app,
    create_store_connector_service, sanitize_source,
)
from backend.library_mvp.store import Store

HEADERS = {"X-Zotero-Connector-API-Version": "3", "X-Zotero-Version": "6.0.99"}
EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
PDF_BYTES = b"%PDF-1.4\nsynthetic protocol bytes, validated separately by real Store tests\n%%EOF\n"


def item(identity="ITEM0001", title="Synthetic paper", **fields):
    return {"id": identity, "itemType": "journalArticle", "title": title,
            "creators": [{"creatorType": "author", "firstName": "Ada", "lastName": "Example"}],
            "tags": [{"tag": "automatic-synthetic", "type": 1}], "attachments": [], **fields}


def payload(session="SESSION1", items=None, **extra):
    return {"sessionID": session, "uri": "https://example.invalid/synthetic", "items": items or [item()], **extra}


def metadata(identity="FILE0001", parent="ITEM0001", **extra):
    return {"id": identity, "parentItemID": parent, "url": "https://example.invalid/synthetic.pdf",
            "title": "Full Text PDF", "contentType": "application/pdf", **extra}


class FakeBackend:
    def __init__(self):
        self.items = {}
        self.requests = []
        self.uploads = []
        self.updates = []
        self.selected = "L1"
        self.pause_save = None
        self.pause_upload = None
        self.fail_save = False
        self.fail_upload = False

    def list_targets(self):
        return [{"id": "Cmethods", "name": "Synthetic Methods", "filesEditable": True, "level": 1}]

    def get_selected_target(self):
        return self.selected

    async def save_items(self, *, source_id, items, target_id, raw_request):
        self.requests.append(copy.deepcopy(raw_request))
        if self.pause_save:
            entered, released = self.pause_save
            entered.set()
            await released.wait()
        if self.fail_save:
            raise RuntimeError("synthetic internal credential must not leak")
        result = {}
        for source in items:
            identity = str(uuid.uuid5(uuid.NAMESPACE_URL, source_id + "/" + source["source_key"]))
            self.items[identity] = {**copy.deepcopy(source), "id": identity, "target_id": target_id}
            result[source["source_key"]] = identity
        return result

    async def save_pdf(self, data, *, item_id, filename, metadata, source_id, attachment_key):
        if self.pause_upload:
            entered, released = self.pause_upload
            entered.set()
            await released.wait()
        if self.fail_upload:
            raise RuntimeError("synthetic upload credential must not leak")
        if item_id is None:
            item_id = str(uuid.uuid5(uuid.NAMESPACE_URL, source_id + "/standalone"))
            self.items[item_id] = {"title": metadata["title"], "target_id": self.selected, "tags": []}
        self.uploads.append({"data": data, "item_id": item_id, "filename": filename, "metadata": copy.deepcopy(metadata),
                             "source_id": source_id, "attachment_key": attachment_key})
        return {"item_id": item_id, "attachment_id": f"local-attachment-{len(self.uploads)}", "reader_ready": True}

    def update_session(self, *, item_ids, target_id, tags, note, source_id):
        self.updates.append({"item_ids": item_ids, "target_id": target_id, "tags": list(tags), "note": note, "source_id": source_id})
        self.selected = target_id
        for identity in item_ids:
            self.items[identity]["target_id"] = target_id
            self.items[identity]["tags"] = list(tags)
            self.items[identity]["session_note"] = note


class ProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.backend = FakeBackend()
        self.service = ConnectorService(self.backend, library_name="Synthetic RetainPDF library")
        self.app = create_connector_app(self.service)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app, client=("127.0.0.1", 43210)),
                                        base_url="http://127.0.0.1:23119")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def post(self, method, body=None, headers=None):
        return await self.client.post("/connector/" + method, json={} if body is None else body,
                                      headers={**HEADERS, **(headers or {})})

    async def upload(self, meta=None, session="SESSION1", data=PDF_BYTES, method="saveAttachment", extra_headers=None):
        return await self.client.post("/connector/" + method, params={"sessionID": session}, content=data,
                                      headers={**HEADERS, "Content-Type": "application/pdf",
                                               "X-Metadata": json.dumps(meta or metadata(), ensure_ascii=True), **(extra_headers or {})})

    async def test_ping_is_truthful_and_has_only_declared_capabilities(self):
        page = await self.client.get("/connector/ping")
        self.assertEqual(page.status_code, 200)
        self.assertIn("RetainPDF experimental", page.text)
        self.assertNotIn("Zotero is running", page.text)
        response = await self.post("ping", {"activeURL": "https://example.invalid/ignored"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["x-zotero-connector-api-version"], "3")
        self.assertEqual(response.headers["x-zotero-version"], "RetainPDF/4.2.5-experimental")
        prefs = response.json()["prefs"]
        for key in ["downloadAssociatedFiles", "supportsAttachmentUpload"]:
            self.assertTrue(prefs[key])
        for key in ["automaticSnapshots", "supportsTagsAutocomplete", "reportActiveURL"]:
            self.assertFalse(prefs[key])
        self.assertFalse(response.json()["realConnectorVerified"])
        self.assertEqual(self.backend.requests, [])

    async def test_selected_collection_matches_actual_library_name_and_target_shape(self):
        response = await self.post("getSelectedCollection")
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["libraryID"], 1)
        self.assertEqual(result["name"], "Synthetic RetainPDF library")
        self.assertTrue(result["libraryEditable"] and result["filesEditable"] and result["editable"])
        self.assertEqual(result["targets"][0], {"id": "L1", "name": "Synthetic RetainPDF library", "filesEditable": True, "level": 0})
        self.assertEqual(result["tags"], {})
        self.assertIsNone(result["id"])

    async def test_save_items_creates_mapping_without_doi_merging(self):
        response = await self.post("saveItems", payload(items=[item("ITEM0001", DOI="10.test/shared"), item("ITEM0002", DOI="10.test/shared")]))
        self.assertEqual(response.status_code, 201)
        session = self.service.sessions["SESSION1"]
        self.assertEqual(set(session.item_ids), {"ITEM0001", "ITEM0002"})
        self.assertEqual(len(set(session.item_ids.values())), 2)
        self.assertEqual(len(self.backend.items), 2)
        self.assertEqual(self.backend.items[session.item_ids["ITEM0001"]]["authors"], ["Ada Example"])

    async def test_duplicate_session_returns_official_conflict_shape(self):
        self.assertEqual((await self.post("saveItems", payload())).status_code, 201)
        duplicate = await self.post("saveItems", payload())
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.json()["error"], "SESSION_EXISTS")
        self.assertEqual(len(self.backend.requests), 1)

    async def test_missing_session_and_duplicate_item_ids_fail_before_storage(self):
        for body, code in [(payload(session=None), "SESSION_ID_NOT_PROVIDED"),
                           (payload(items=[item(), item()]), "DUPLICATE_ITEM_ID")]:
            response = await self.post("saveItems", body)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["error"], code)
        self.assertEqual(self.backend.requests, [])

    async def test_source_credentials_and_url_credentials_are_removed(self):
        body = payload(items=[item(cookies="synthetic-item-cookie", detailedCookies=[{"value": "synthetic-browser-cookie"}],
                                  url="https://synthetic-user:synthetic-password@example.invalid/article?token=synthetic-token&id=paper#access_token=synthetic-fragment")],
                       credentials={"password": "synthetic-password"}, headers={"Authorization": "Bearer synthetic-auth"})
        response = await self.post("saveItems", body)
        self.assertEqual(response.status_code, 201)
        saved = json.dumps(self.backend.requests[0])
        for secret in ["synthetic-item-cookie", "synthetic-browser-cookie", "synthetic-password", "synthetic-token", "synthetic-auth", "synthetic-fragment"]:
            self.assertNotIn(secret, saved)
        self.assertEqual(self.backend.requests[0]["items"][0]["url"], "https://example.invalid/article?id=paper")
        self.assertIn("SOURCE_CREDENTIALS_REMOVED", {w["code"] for w in response.json()["warnings"]})

    async def test_binary_attachment_uses_parent_mapping_and_is_retry_idempotent(self):
        await self.post("saveItems", payload())
        first = await self.upload()
        second = await self.upload()
        self.assertEqual((first.status_code, second.status_code), (201, 201))
        self.assertTrue(second.json()["duplicate"])
        self.assertEqual(len(self.backend.uploads), 1)
        self.assertEqual(self.backend.uploads[0]["data"], PDF_BYTES)
        self.assertEqual(self.backend.uploads[0]["item_id"], self.service.sessions["SESSION1"].item_ids["ITEM0001"])

    async def test_attachment_conflicting_retry_reports_conflict(self):
        await self.post("saveItems", payload())
        await self.upload()
        response = await self.upload(data=PDF_BYTES + b"different")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "ATTACHMENT_ID_CONFLICT")
        self.assertEqual(len(self.backend.uploads), 1)

    async def test_chinese_rfc2047_titles_are_decoded_for_filename(self):
        await self.post("saveItems", payload())
        chinese = "合成论文 全文"
        for index, encoded in enumerate([Header(chinese, "utf-8").encode(), "=?UTF-8?Q?=E5=90=88=E6=88=90=E8=AE=BA=E6=96=87_=E5=85=A8=E6=96=87?="]):
            response = await self.upload(metadata(identity=f"FILE{index}", title=encoded))
            self.assertEqual(response.status_code, 201)
            self.assertEqual(self.backend.uploads[-1]["metadata"]["title"], chinese)
            self.assertEqual(self.backend.uploads[-1]["filename"], chinese + ".pdf")

    async def test_unknown_parent_or_unknown_session_never_uploads(self):
        await self.post("saveItems", payload())
        missing_parent = await self.upload(metadata(parent="MISSING"))
        missing_session = await self.upload(session="MISSING")
        self.assertEqual(missing_parent.json()["error"], "PARENT_ITEM_NOT_FOUND")
        self.assertEqual(missing_session.json()["error"], "SESSION_NOT_FOUND")
        self.assertEqual(self.backend.uploads, [])

    async def test_metadata_session_mismatch_and_duplicate_query_are_rejected(self):
        await self.post("saveItems", payload())
        response = await self.upload(metadata(sessionID="OTHER"))
        self.assertEqual(response.json()["error"], "SESSION_ID_MISMATCH")
        response = await self.client.post("/connector/saveAttachment?sessionID=SESSION1&sessionID=OTHER", content=PDF_BYTES,
                                          headers={**HEADERS, "Content-Type": "application/pdf", "X-Metadata": json.dumps(metadata())})
        self.assertEqual(response.json()["error"], "AMBIGUOUS_SESSION_ID")
        self.assertEqual(self.backend.uploads, [])

    async def test_attachment_type_and_missing_metadata_fail_explicitly(self):
        await self.post("saveItems", payload())
        response = await self.upload(extra_headers={"Content-Type": "application/epub+zip"})
        self.assertEqual(response.status_code, 415)
        response = await self.upload(metadata(contentType="text/html"))
        self.assertEqual(response.status_code, 415)
        response = await self.client.post("/connector/saveAttachment", content=PDF_BYTES, headers={**HEADERS, "Content-Type": "application/pdf"})
        self.assertEqual(response.json()["error"], "METADATA_NOT_PROVIDED")
        self.assertEqual(self.backend.uploads, [])

    async def test_standalone_pdf_is_created_without_auto_recognition(self):
        response = await self.upload({"title": "Synthetic standalone", "url": "https://example.invalid/solo.pdf", "contentType": "application/pdf"},
                                     session="STANDALONE", method="saveStandaloneAttachment")
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.json()["canRecognize"])
        self.assertEqual(self.service.sessions["STANDALONE"].state, "active")
        repeat = await self.upload({"title": "Synthetic standalone", "contentType": "application/pdf"}, session="STANDALONE", method="saveStandaloneAttachment")
        self.assertEqual(repeat.status_code, 409)

    async def test_identical_standalone_retry_is_idempotent_in_the_same_session(self):
        meta = {"title": "Synthetic standalone", "url": "https://example.invalid/solo.pdf", "contentType": "application/pdf"}
        first = await self.upload(meta, session="STANDALONE", method="saveStandaloneAttachment")
        second = await self.upload(meta, session="STANDALONE", method="saveStandaloneAttachment")
        self.assertEqual((first.status_code, second.status_code), (201, 201))
        self.assertEqual(first.json()["attachment_id"], second.json()["attachment_id"])
        self.assertTrue(second.json()["duplicate"])
        self.assertEqual(len(self.backend.uploads), 1)

    async def test_standalone_cannot_reuse_a_bibliographic_session(self):
        await self.post("saveItems", payload())
        response = await self.upload({"title": "Synthetic standalone"}, method="saveStandaloneAttachment")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "SESSION_EXISTS")
        self.assertEqual(self.backend.uploads, [])

    async def test_invalid_attachment_metadata_is_rejected_before_backend_upload(self):
        for field in [{"url": {}}, {"url": 1}, {"url": None}, {"url": "https://example.invalid/" + "x" * 2000},
                      {"title": []}, {"title": "x" * 1001}]:
            response = await self.upload({"title": "Synthetic standalone", **field},
                                         session="STANDALONE", method="saveStandaloneAttachment")
            self.assertEqual(response.status_code, 400, str(field)[:40])
            self.assertEqual(response.json()["error"], "INVALID_METADATA")
        self.assertEqual(self.backend.uploads, [])
        self.assertEqual(self.service.sessions, {})

    async def test_update_session_changes_only_declared_target_tags_and_note(self):
        await self.post("saveItems", payload())
        response = await self.post("updateSession", {"sessionID": "SESSION1", "target": "Cmethods", "tags": ["中文", "tag, with comma", "中文"],
                                                    "note": "<p>Safe note</p><script>do_not_run()</script>"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {})
        self.assertEqual(self.backend.updates[0]["tags"], ["中文", "tag, with comma"])
        self.assertEqual(self.backend.updates[0]["note"], "Safe note")
        target = (await self.post("getSelectedCollection")).json()
        self.assertEqual(target["id"], "Cmethods")
        self.assertEqual(target["name"], "Synthetic Methods")

    async def test_legacy_comma_delimited_tags_are_supported(self):
        await self.post("saveItems", payload())
        response = await self.post("updateSession", {"sessionID": "SESSION1", "target": "L1", "tags": " one, two ,one"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.backend.updates[0]["tags"], ["one", "two"])

    async def test_invalid_target_does_not_apply_partial_session_update(self):
        await self.post("saveItems", payload())
        response = await self.post("updateSession", {"sessionID": "SESSION1", "target": "Cmissing", "tags": ["not applied"]})
        self.assertEqual(response.json()["error"], "COLLECTION_NOT_FOUND")
        self.assertEqual(self.backend.updates, [])

    async def test_delay_sync_and_resolver_result_follow_declared_wire_shapes(self):
        await self.post("saveItems", payload())
        delayed = await self.post("delaySync")
        self.assertEqual(delayed.status_code, 204)
        self.assertEqual(delayed.content, b"")
        resolvers = await self.post("hasAttachmentResolvers", {"sessionID": "SESSION1", "itemID": "ITEM0001"})
        self.assertEqual(resolvers.status_code, 200)
        self.assertIs(resolvers.json(), False)

    async def test_unknown_translators_snapshots_and_document_methods_report_unsupported(self):
        for method in ["getTranslators", "getTranslatorCode", "saveSnapshot", "saveSingleFile", "document/start", "arbitraryMethod"]:
            response = await self.post(method)
            self.assertEqual(response.status_code, 501, method)
            self.assertEqual(response.json()["error"], "UNSUPPORTED_METHOD")
            self.assertIn("RetainPDF", response.headers["x-zotero-version"])
        self.assertEqual(self.backend.requests, [])

    async def test_web_origins_are_rejected_even_if_protocol_headers_are_supplied(self):
        for origin in ["https://example.invalid", "null", "http://127.0.0.1:23119", "chrome-extension://short"]:
            response = await self.post("saveItems", payload(), headers={"Origin": origin})
            self.assertEqual(response.status_code, 403)
            self.assertNotIn("access-control-allow-origin", response.headers)
        self.assertEqual(self.backend.requests, [])

    async def test_extension_origin_cors_is_exact_without_credentials_or_wildcard(self):
        response = await self.post("ping", headers={"Origin": EXTENSION_ORIGIN})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], EXTENSION_ORIGIN)
        self.assertNotIn("access-control-allow-credentials", response.headers)
        self.assertEqual(response.headers["vary"], "Origin")

    async def test_extension_post_preflight_accepts_only_protocol_headers(self):
        headers = {"Origin": EXTENSION_ORIGIN, "Access-Control-Request-Method": "POST",
                   "Access-Control-Request-Headers": "Content-Type,X-Zotero-Version,X-Zotero-Connector-API-Version,X-Metadata"}
        response = await self.client.options("/connector/saveAttachment", headers=headers)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.headers["access-control-allow-origin"], EXTENSION_ORIGIN)
        self.assertNotEqual(response.headers["access-control-allow-origin"], "*")
        headers["Access-Control-Request-Headers"] += ",Authorization"
        response = await self.client.options("/connector/saveAttachment", headers=headers)
        self.assertEqual(response.status_code, 403)

    async def test_simple_web_posts_and_unversioned_posts_are_rejected(self):
        response = await self.client.post("/connector/saveItems", content=json.dumps(payload()), headers={"Content-Type": "text/plain"})
        self.assertGreaterEqual(response.status_code, 400)
        response = await self.client.post("/connector/saveItems", content=json.dumps(payload()), headers={**HEADERS, "Content-Type": "text/plain"})
        self.assertEqual(response.status_code, 415)
        response = await self.client.post("/connector/saveItems", json=payload(), headers={"X-Zotero-Connector-API-Version": "3"})
        self.assertEqual(response.json()["error"], "CONNECTOR_VERSION_REQUIRED")
        response = await self.post("saveItems", payload(), headers={"X-Zotero-Connector-API-Version": "2"})
        self.assertEqual(response.status_code, 412)
        self.assertEqual(self.backend.requests, [])

    async def test_loopback_host_and_forwarded_header_checks_block_rebinding(self):
        for host in ["example.invalid:23119", "127.0.0.1.example.invalid", "localhost:65536", "user@localhost:23119"]:
            response = await self.post("saveItems", payload(), headers={"Host": host})
            self.assertEqual(response.status_code, 400)
        for name in ["Forwarded", "X-Forwarded-For", "X-Forwarded-Host"]:
            response = await self.post("saveItems", payload(), headers={name: "synthetic proxy"})
            self.assertEqual(response.status_code, 403)
        self.assertEqual(self.backend.requests, [])

    async def test_duplicate_protocol_and_security_headers_are_rejected(self):
        pairs = [("Host", "localhost:23119", "example.invalid"),
                 ("Origin", EXTENSION_ORIGIN, "https://example.invalid"),
                 ("X-Zotero-Version", "6.0.99", "6.0.99"),
                 ("X-Zotero-Connector-API-Version", "3", "2"),
                 ("Content-Type", "application/json", "text/plain"),
                 ("Content-Length", "2", "2"),
                 ("X-Metadata", "{}", "{}")]
        for name, first, second in pairs:
            headers = [(key, value) for key, value in HEADERS.items() if key.lower() != name.lower()]
            if name.lower() != "content-type":
                headers.append(("Content-Type", "application/json"))
            headers.extend([(name, first), (name, second)])
            response = await self.client.post("/connector/saveItems", content=b"{}", headers=headers)
            self.assertEqual(response.status_code, 400, name)
            self.assertEqual(response.json()["error"], "AMBIGUOUS_HEADERS", name)
        self.assertEqual(self.backend.requests, [])

    async def test_non_loopback_peer_is_rejected_even_with_local_host(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app, client=("203.0.113.5", 12345)), base_url="http://127.0.0.1:23119") as client:
            response = await client.post("/connector/saveItems", json=payload(), headers=HEADERS)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"], "LOOPBACK_REQUIRED")

    async def test_absent_origin_privileged_background_request_is_supported(self):
        response = await self.post("saveItems", payload(), headers={"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("access-control-allow-origin", response.headers)

    async def test_oversized_declared_request_and_non_finite_json_are_rejected(self):
        response = await self.client.post("/connector/saveItems", content=b"{}", headers={**HEADERS, "Content-Type": "application/json", "Content-Length": "999999999"})
        self.assertEqual(response.status_code, 413)
        response = await self.client.post("/connector/saveItems", content=b'{"extra":NaN}', headers={**HEADERS, "Content-Type": "application/json"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.backend.requests, [])

    async def test_failures_are_visible_without_leaking_backend_details(self):
        self.backend.fail_save = True
        response = await self.post("saveItems", payload())
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("synthetic internal credential", response.text)
        status = self.service.status()
        self.assertFalse(status["real_connector_verified"])
        self.assertTrue(status["failures"])
        self.assertNotIn("credential", json.dumps(status))
        self.assertEqual(self.service.sessions["SESSION1"].state, "failed")

    async def test_concurrent_update_waits_for_save_items_mapping(self):
        entered, released = asyncio.Event(), asyncio.Event()
        self.backend.pause_save = (entered, released)
        saving = asyncio.create_task(self.post("saveItems", payload()))
        await asyncio.wait_for(entered.wait(), 1)
        updating = asyncio.create_task(self.post("updateSession", {"sessionID": "SESSION1", "target": "Cmethods", "tags": ["after-save"]}))
        await asyncio.sleep(0)
        self.assertEqual(self.backend.updates, [])
        released.set()
        saved, changed = await asyncio.gather(saving, updating)
        self.assertEqual((saved.status_code, changed.status_code), (201, 200))
        local_id = self.service.sessions["SESSION1"].item_ids["ITEM0001"]
        self.assertEqual(self.backend.items[local_id]["target_id"], "Cmethods")

    async def test_concurrent_target_update_is_applied_after_inflight_upload(self):
        await self.post("saveItems", payload())
        entered, released = asyncio.Event(), asyncio.Event()
        self.backend.pause_upload = (entered, released)
        uploading = asyncio.create_task(self.upload())
        await asyncio.wait_for(entered.wait(), 1)
        updating = asyncio.create_task(self.post("updateSession", {"sessionID": "SESSION1", "target": "Cmethods", "tags": ["after-upload"]}))
        await asyncio.sleep(0)
        self.assertEqual(self.backend.updates, [])
        released.set()
        uploaded, changed = await asyncio.gather(uploading, updating)
        self.assertEqual((uploaded.status_code, changed.status_code), (201, 200))
        local_id = self.service.sessions["SESSION1"].item_ids["ITEM0001"]
        self.assertEqual(self.backend.items[local_id]["target_id"], "Cmethods")
        self.assertEqual(self.backend.items[local_id]["tags"], ["after-upload"])

    async def test_session_limits_and_expiry_are_bounded(self):
        clock = [1.0]
        self.service.clock = lambda: clock[0]
        self.service.session_ttl = 2
        self.service.max_sessions = 1
        self.assertEqual((await self.post("saveItems", payload())).status_code, 201)
        self.assertEqual((await self.post("saveItems", payload("SESSION2"))).status_code, 429)
        clock[0] = 4
        self.assertEqual((await self.post("saveItems", payload("SESSION2"))).status_code, 201)
        missing = await self.post("updateSession", {"sessionID": "SESSION1", "target": "L1"})
        self.assertEqual(missing.json()["error"], "SESSION_NOT_FOUND")


class StoreIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="retainpdf-connector-synthetic-")
        self.store = Store(Path(self.temp.name) / "data")
        self.callback_calls = []
        self.callback_transaction_states = []
        async def callback(store, attachment_id):
            self.callback_transaction_states.append(store.db.in_transaction)
            self.callback_calls.append((store, attachment_id))
            return {"reader_ready": True, "native_document_id": "synthetic-native-document", "reader_url": "#synthetic-reader"}
        self.service = create_store_connector_service(self.store, pdf_callback=callback, library_name="Synthetic local library")
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=create_connector_app(self.service), client=("127.0.0.1", 45678)),
                                        base_url="http://127.0.0.1:23119")
        import fitz
        with fitz.open() as doc:
            page = doc.new_page()
            page.insert_text((60, 60), "Synthetic paper. Offline Connector test only.")
            self.pdf = doc.tobytes()

    async def asyncTearDown(self):
        await self.client.aclose()
        self.store.close()
        self.temp.cleanup()

    async def post(self, method, body):
        return await self.client.post("/connector/" + method, json=body, headers=HEADERS)

    async def upload(self, method="saveAttachment", meta=None, session="SESSION1"):
        return await self.client.post("/connector/" + method, params={"sessionID": session}, content=self.pdf,
                                      headers={**HEADERS, "Content-Type": "application/pdf", "X-Metadata": json.dumps(meta or metadata())})

    async def test_store_persists_bibliographic_source_and_pdf_before_native_callback(self):
        captured = await self.post("saveItems", payload(items=[item(extra="Synthetic untranslated extra", cookies="synthetic-cookie")]))
        self.assertEqual(captured.status_code, 201)
        local_id = self.service.sessions["SESSION1"].item_ids["ITEM0001"]
        self.assertEqual(self.store.get_item(local_id)["title"], "Synthetic paper")
        sources = self.store.source_records(local_id)
        self.assertEqual(sources["items"][0]["raw_source"]["item"]["extra"], "Synthetic untranslated extra")
        self.assertNotIn("synthetic-cookie", json.dumps(sources))
        uploaded = await self.upload()
        self.assertEqual(uploaded.status_code, 201)
        self.assertTrue(uploaded.json()["reader_ready"])
        attachment_id = uploaded.json()["attachment_id"]
        self.assertEqual(self.store.attachment_path(attachment_id).read_bytes(), self.pdf)
        self.assertEqual(self.callback_calls, [(self.store, attachment_id)])
        self.assertEqual(self.callback_transaction_states, [False], "Native bridge must run only after PDF/source transaction commits")
        with self.store.lock:
            row = self.store.db.execute("SELECT raw_source_json FROM source_links WHERE entity_type='connector-attachment'").fetchone()
        self.assertEqual(json.loads(row[0])["url"], "https://example.invalid/synthetic.pdf")

    async def test_store_target_tree_uses_existing_uuid_without_duplicate_collections(self):
        root = self.store.create_collection({"name": "Synthetic root"})
        child = self.store.create_collection({"name": "Synthetic child", "parent_id": root["id"]})
        response = await self.post("getSelectedCollection", {})
        targets = response.json()["targets"]
        self.assertEqual([r["level"] for r in targets], [0, 1, 2])
        self.service.backend.selected_target = "C" + child["id"]
        response = await self.post("saveItems", payload())
        self.assertEqual(response.status_code, 201)
        local_id = self.service.sessions["SESSION1"].item_ids["ITEM0001"]
        self.assertEqual(self.store.get_item(local_id)["collection_ids"], [child["id"]])
        self.assertEqual(len(self.store.list_collections()), 2)

    async def test_store_session_tags_keep_captured_automatic_tags_and_note_updates_are_idempotent(self):
        await self.post("saveItems", payload())
        local_id = self.service.sessions["SESSION1"].item_ids["ITEM0001"]
        for body in ["<p>First note</p>", "<p>Second note</p>"]:
            response = await self.post("updateSession", {"sessionID": "SESSION1", "target": "L1", "tags": ["manual-synthetic"], "note": body})
            self.assertEqual(response.status_code, 200)
        saved = self.store.get_item(local_id)
        self.assertEqual(set(saved["tags"]), {"automatic-synthetic", "manual-synthetic"})
        self.assertEqual(len(saved["notes"]), 1)
        self.assertEqual(saved["notes"][0]["body"], "Second note")
        await self.post("updateSession", {"sessionID": "SESSION1", "target": "L1", "tags": [], "note": ""})
        saved = self.store.get_item(local_id)
        self.assertEqual(saved["tags"], ["automatic-synthetic"])
        self.assertEqual(saved["notes"], [])

    async def test_save_batch_rolls_back_all_items_if_store_rejects_later_item(self):
        canonical, _ = self.service._canonical_items(payload(items=[item("ONE"), item("TWO")]), "synthetic:atomic")
        canonical[1]["title"] = "x" * 1001
        backend = self.service.backend
        with self.assertRaises(ValueError):
            backend.save_items(source_id="synthetic:atomic", items=canonical, target_id="L1", raw_request={})
        self.assertEqual(self.store.list_items()["items"], [])
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM source_links").fetchone()[0], 0)

    async def test_persisted_capture_map_survives_service_restart_without_duplicate_item(self):
        await self.post("saveItems", payload())
        original = self.service.sessions["SESSION1"].item_ids["ITEM0001"]
        restarted = create_store_connector_service(self.store, library_name="Synthetic local library")
        result = await restarted.save_items(payload())
        self.assertEqual(result["items"], 1)
        self.assertEqual(restarted.sessions["SESSION1"].item_ids["ITEM0001"], original)
        self.assertEqual(len(self.store.list_items()["items"]), 1)

    async def test_pdf_bridge_failure_preserves_bytes_and_has_visible_failure_status(self):
        async def broken(store, identity):
            raise RuntimeError("synthetic internal bridge credential must not leak")
        self.service.backend.pdf_callback = broken
        await self.post("saveItems", payload())
        response = await self.upload()
        self.assertEqual(response.status_code, 201, "PDF saving succeeded even though reader bridge failed")
        self.assertFalse(response.json()["reader_ready"])
        attachment_id = response.json()["attachment_id"]
        self.assertEqual(self.store.attachment_path(attachment_id).read_bytes(), self.pdf)
        self.assertIn("NATIVE_READER_UNAVAILABLE", {w["code"] for w in response.json()["warnings"]})
        self.assertNotIn("synthetic internal bridge credential", response.text)
        self.assertIn("NATIVE_READER_UNAVAILABLE", {f["code"] for f in self.service.status()["failures"]})

    async def test_standalone_source_upload_is_retry_safe_after_service_restart(self):
        meta = {"title": "Synthetic standalone", "url": "https://example.invalid/standalone.pdf", "contentType": "application/pdf"}
        first = await self.upload("saveStandaloneAttachment", meta, "STANDALONE")
        self.assertEqual(first.status_code, 201)
        original_id = first.json()["attachment_id"]
        restarted = create_store_connector_service(self.store, library_name="Synthetic local library")
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_connector_app(restarted), client=("127.0.0.1", 45678)), base_url="http://127.0.0.1:23119") as client:
            second = await client.post("/connector/saveStandaloneAttachment?sessionID=STANDALONE", content=self.pdf,
                                       headers={**HEADERS, "Content-Type": "application/pdf", "X-Metadata": json.dumps(meta)})
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.json()["attachment_id"], original_id)
        self.assertEqual(len(self.store.list_items()["items"]), 1)

    async def test_standalone_same_session_retry_preserves_one_item_attachment_and_bridge(self):
        meta = {"title": "Synthetic standalone", "url": "https://example.invalid/solo.pdf", "contentType": "application/pdf"}
        first = await self.upload("saveStandaloneAttachment", meta, "STANDALONE")
        second = await self.upload("saveStandaloneAttachment", meta, "STANDALONE")
        self.assertEqual((first.status_code, second.status_code), (201, 201))
        self.assertEqual(first.json()["attachment_id"], second.json()["attachment_id"])
        self.assertTrue(second.json()["duplicate"])
        self.assertEqual(len(self.store.list_items()["items"]), 1)
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM attachments").fetchone()[0], 1)
        self.assertEqual(len(self.callback_calls), 1)

    async def test_invalid_standalone_metadata_never_writes_records_or_blobs(self):
        for invalid in [{"url": {}}, {"url": 1}, {"title": "x" * 1001}]:
            response = await self.upload("saveStandaloneAttachment", {"title": "Synthetic standalone", **invalid}, "STANDALONE")
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["error"], "INVALID_METADATA")
        for table in ("items", "attachments", "source_links"):
            self.assertEqual(self.store.db.execute(f"SELECT count(*) FROM {table}").fetchone()[0], 0)
        self.assertEqual(list(self.store.blobs.rglob("*.pdf")), [])
        self.assertEqual(self.callback_calls, [])

    async def test_pdf_source_failure_rolls_back_records_and_retry_succeeds_before_bridge(self):
        self.store.db.execute("""CREATE TEMP TRIGGER synthetic_source_failure BEFORE INSERT ON source_links
            WHEN NEW.entity_type='connector-attachment' BEGIN SELECT RAISE(ABORT,'synthetic forced source failure'); END""")
        meta = {"title": "Synthetic standalone", "url": "https://example.invalid/solo.pdf", "contentType": "application/pdf"}
        failed = await self.upload("saveStandaloneAttachment", meta, "STANDALONE")
        self.assertEqual(failed.status_code, 503)
        for table in ("items", "attachments", "source_links"):
            self.assertEqual(self.store.db.execute(f"SELECT count(*) FROM {table}").fetchone()[0], 0)
        self.assertFalse(self.store.db.in_transaction)
        self.assertEqual(self.callback_calls, [])
        self.store.db.execute("DROP TRIGGER synthetic_source_failure")
        retried = await self.upload("saveStandaloneAttachment", meta, "STANDALONE")
        self.assertEqual(retried.status_code, 201)
        self.assertEqual(len(self.store.list_items()["items"]), 1)
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM source_links").fetchone()[0], 1)
        self.assertEqual(len(self.callback_calls), 1)

    async def test_parent_pdf_source_failure_preserves_parent_and_rolls_back_attachment(self):
        await self.post("saveItems", payload())
        local_id = self.service.sessions["SESSION1"].item_ids["ITEM0001"]
        self.store.db.execute("""CREATE TEMP TRIGGER synthetic_source_failure BEFORE INSERT ON source_links
            WHEN NEW.entity_type='connector-attachment' BEGIN SELECT RAISE(ABORT,'synthetic forced source failure'); END""")
        response = await self.upload()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.store.get_item(local_id)["attachments"], [])
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM items").fetchone()[0], 1)
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM source_links").fetchone()[0], 1)
        self.assertEqual(self.callback_calls, [])

    async def test_translated_child_notes_are_persistent_safe_plaintext(self):
        response = await self.post("saveItems", payload(items=[item(notes=[{"note": "<p>Synthetic note</p><script>do_not_run()</script>"}])]))
        self.assertEqual(response.status_code, 201)
        local_id = self.service.sessions["SESSION1"].item_ids["ITEM0001"]
        note = self.store.get_item(local_id)["notes"][0]
        self.assertEqual(note["body"], "Synthetic note")
        self.assertIsNone(note["page_idx"])


class SourceSanitizationTests(unittest.TestCase):
    def test_cleaning_is_recursive_and_preserves_bibliographic_extra(self):
        value = {"title": "Synthetic", "nested": [{"Credentials": {"password": "synthetic"}, "extra": "kept"}],
                 "url": "https://user:password@example.invalid/article?id=paper&api_key=synthetic"}
        clean, count = sanitize_source(value)
        self.assertEqual(clean["title"], "Synthetic")
        self.assertEqual(clean["nested"], [{"extra": "kept"}])
        self.assertEqual(clean["url"], "https://example.invalid/article?id=paper")
        self.assertGreater(count, 0)
        self.assertIn("Credentials", value["nested"][0], "do not mutate caller source data")


if __name__ == "__main__":
    unittest.main()
