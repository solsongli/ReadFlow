"""Synthetic-only importer tests: no real Zotero files or requests are used."""
from __future__ import annotations

import copy
import json
import unittest
from unittest.mock import patch

import httpx

from backend.library_mvp.zotero import (
    ImportPlanError, LocalSnapshotError, build_import_plan, fetch_local_snapshot,
)


def record(key, item_type="journalArticle", **fields):
    return {"key": key, "version": 7,
            "data": {"key": key, "version": 7, "itemType": item_type, **fields}}


def collection(key, name, parent=False):
    return {"key": key, "version": 7, "data": {"key": key, "version": 7, "name": name, "parentCollection": parent}}


def api_payload(items=None, collections=None):
    return {"format": "zotero-api", "source_id": "local:synthetic:users:0",
            "data": {"items": items or [], "collections": collections or []}}


def warning_codes(plan):
    return {w["code"] for w in plan["warnings"]}


class ImportPlanTests(unittest.TestCase):
    def test_wrapped_items_preserve_sources_hierarchy_and_unverified_annotations(self):
        original = api_payload([
            record("PAPER001", title="A synthetic paper", DOI="https://doi.org/10.test/example",
                   creators=[{"creatorType": "author", "firstName": "Ada", "lastName": "Example"},
                             {"creatorType": "author", "name": "Synthetic Lab"},
                             {"creatorType": "editor", "name": "Editor Team"}],
                   tags=[{"tag": "methods", "type": 1}, {"tag": "synthetic"}],
                   collections=["COLL0002"], publicationTitle="Synthetic Journal", pluginField={"value": "kept"}),
            record("FILE0001", "attachment", parentItem="PAPER001", filename="paper.pdf",
                   contentType="application/pdf", linkMode="imported_file", path="unread/synthetic/paper.pdf"),
            record("NOTE0001", "note", parentItem="PAPER001", note="<p>First <strong>note</strong>.</p><script>do_not_run()</script><p>Second &amp; safe.</p>"),
            record("ANNO0001", "annotation", parentItem="FILE0001", annotationType="highlight",
                   annotationText="An exact source quote.", annotationComment="Synthetic comment.",
                   annotationPageLabel="iii", annotationPosition=json.dumps({"pageIndex": 2, "rects": [[1, 2, 3, 4]]})),
        ], [collection("COLL0001", "Synthetic root"), collection("COLL0002", "Methods", "COLL0001")])
        untouched = copy.deepcopy(original)
        plan = build_import_plan(original)
        self.assertEqual(original, untouched, "preview must not modify caller data")
        paper = plan["items"][0]
        self.assertEqual(paper["source_key"], "PAPER001")
        self.assertEqual(paper["source_version"], 7)
        self.assertEqual(paper["authors"], ["Ada Example", "Synthetic Lab"])
        self.assertEqual(paper["doi"], "10.test/example")
        self.assertEqual(paper["tags"], ["methods", "synthetic"])
        self.assertEqual(paper["collection_source_keys"], ["COLL0002"])
        self.assertEqual(plan["collections"][1]["parent_source_key"], "COLL0001")
        self.assertEqual(paper["attachments"][0]["missing_reason"], "file_not_imported")
        self.assertEqual(paper["attachments"][0]["raw_source"]["data"]["path"], "unread/synthetic/paper.pdf")
        annotation, note = paper["notes"]
        self.assertEqual(annotation["source_key"], "ANNO0001")
        self.assertIsNone(annotation["page_idx"], "source page must not become an unverified local anchor")
        self.assertEqual(annotation["source_page_idx"], 2)
        self.assertEqual(annotation["source_page_label"], "iii")
        self.assertEqual(annotation["attachment_source_key"], "FILE0001")
        self.assertEqual(annotation["quote"], "An exact source quote.")
        self.assertNotIn("script", note["body"])
        self.assertNotIn("do_not_run", note["body"])
        self.assertIn("Second & safe.", note["body"])
        self.assertIn("<script>", note["raw_source"]["data"]["note"])
        self.assertEqual(plan["counts"], {"items": 1, "collections": 2, "tags": 2, "attachments": 1, "notes": 1, "annotations": 1})
        self.assertTrue({"annotation_geometry_not_mapped", "attachment_file_not_imported", "fields_preserved_in_source", "creator_roles_not_mapped"} <= warning_codes(plan))

    def test_plan_hash_is_stable_across_top_level_record_order(self):
        first = api_payload([record("PAPER002", title="Second"), record("PAPER001", title="First")],
                            [collection("COLL0002", "Second"), collection("COLL0001", "First")])
        second = copy.deepcopy(first)
        second["data"]["items"].reverse()
        second["data"]["collections"].reverse()
        self.assertEqual(build_import_plan(first)["plan_hash"], build_import_plan(second)["plan_hash"])
        self.assertEqual(len(build_import_plan(first)["plan_hash"]), 64)

    def test_source_namespace_changes_identity_hash(self):
        first = api_payload([record("PAPER001", title="Synthetic")])
        second = copy.deepcopy(first)
        second["source_id"] = "local:different-synthetic:users:0"
        self.assertNotEqual(build_import_plan(first)["plan_hash"], build_import_plan(second)["plan_hash"])

    def test_conflicting_duplicate_api_keys_fail(self):
        with self.assertRaises(ImportPlanError) as caught:
            build_import_plan(api_payload([record("PAPER001", title="First"), record("PAPER001", title="Conflicting")]))
        self.assertEqual(caught.exception.code, "duplicate_key_conflict")

    def test_identical_duplicate_api_records_are_reported_and_not_duplicated(self):
        source = record("PAPER001", title="First")
        plan = build_import_plan(api_payload([source, copy.deepcopy(source)]))
        self.assertEqual(plan["counts"]["items"], 1)
        self.assertIn("duplicate_source_record", warning_codes(plan))

    def test_wrapper_key_or_version_mismatch_fails(self):
        for field, value in [("key", "DIFFERENT"), ("version", 9)]:
            source = record("PAPER001", title="Synthetic")
            source[field] = value
            with self.subTest(field=field), self.assertRaises(ImportPlanError):
                build_import_plan(api_payload([source]))

    def test_direct_data_array_is_supported(self):
        plan = build_import_plan({"format": "zotero-api", "source_id": "synthetic:direct",
                                  "data": [{"key": "PAPER001", "version": 1, "itemType": "book", "title": "Book"}],
                                  "collections": []})
        self.assertEqual(plan["items"][0]["item_type"], "book")

    def test_collection_cycle_and_missing_parent_are_reported(self):
        plan = build_import_plan(api_payload([], [collection("A", "A", "B"), collection("B", "B", "A"), collection("C", "C", "MISSING")]))
        self.assertIsNone(plan["collections"][0]["parent_source_key"])
        self.assertEqual(plan["collections"][1]["parent_source_key"], "A")
        self.assertIsNone(plan["collections"][2]["parent_source_key"])
        self.assertTrue({"collection_cycle", "collection_parent_missing"} <= warning_codes(plan))

    def test_orphan_records_remain_visible_with_original_keys(self):
        plan = build_import_plan(api_payload([
            record("ORPHAN01", "attachment", parentItem="MISSING", filename="solo.pdf", linkMode="linked_file"),
            record("ORPHAN02", "note", note="<p>Standalone synthetic note</p>"),
            record("ANNO0001", "annotation", parentItem="ORPHAN01", annotationText="Source quote"),
        ]))
        self.assertEqual({p["source_key"] for p in plan["items"]}, {"ORPHAN01", "ORPHAN02"})
        paper = next(p for p in plan["items"] if p["source_key"] == "ORPHAN01")
        self.assertEqual(paper["notes"][0]["attachment_source_key"], "ORPHAN01")
        self.assertTrue({"standalone_item", "orphan_parent"} <= warning_codes(plan))

    def test_invalid_annotation_position_is_preserved_without_anchor(self):
        plan = build_import_plan(api_payload([record("PAPER001", title="Synthetic"),
                record("FILE0001", "attachment", parentItem="PAPER001", linkMode="imported_file"),
                record("ANNO0001", "annotation", parentItem="FILE0001", annotationPosition="{broken")]))
        note = plan["items"][0]["notes"][0]
        self.assertIsNone(note["page_idx"])
        self.assertIsNone(note["source_page_idx"])
        self.assertEqual(note["raw_source"]["data"]["annotationPosition"], "{broken")
        self.assertIn("annotation_position_invalid", warning_codes(plan))

    def test_dangerous_links_and_paths_are_not_executable(self):
        plan = build_import_plan(api_payload([record("PAPER001", title="Synthetic", url="javascript:alert(1)"),
                       record("FILE0001", "attachment", parentItem="PAPER001", filename="../../paper.pdf", linkMode="linked_url", url="file:///unread/synthetic.pdf")]))
        paper = plan["items"][0]
        self.assertEqual(paper["url"], "")
        self.assertEqual(paper["attachments"][0]["filename"], "paper.pdf")
        self.assertEqual(paper["attachments"][0]["url"], "")
        self.assertIn("unsafe_url_not_mapped", warning_codes(plan))

    def test_csl_standard_mapping_and_fixed_capability_warnings(self):
        plan = build_import_plan({"format": "csl-json", "source_id": "synthetic:csl", "data": [{
            "id": "source-1", "type": "article-journal", "title": "Synthetic CSL",
            "author": [{"given": "Ada", "family": "Example"}, {"literal": "Synthetic Lab"}],
            "issued": {"date-parts": [[2024, 6, 3]]}, "DOI": "10.test/csl", "container-title": "Synthetic Journal"}]})
        paper = plan["items"][0]
        self.assertEqual(paper["date"], "2024-06-03")
        self.assertEqual(paper["authors"], ["Ada Example", "Synthetic Lab"])
        self.assertEqual(paper["raw_source"]["container-title"], "Synthetic Journal")
        self.assertTrue({"csl_bibliography_only", "collections_not_in_csl", "tags_not_in_csl", "attachments_not_in_csl", "notes_not_in_csl", "annotations_not_in_csl", "word_citations_not_migrated", "plugin_data_not_migrated"} <= warning_codes(plan))

    def test_csl_doi_is_never_used_to_merge_different_source_ids(self):
        plan = build_import_plan({"format": "csl-json", "source_id": "synthetic:csl", "data": [
            {"id": "one", "title": "First", "DOI": "10.test/shared"},
            {"id": "two", "title": "Second", "DOI": "10.test/shared"}]})
        self.assertEqual(plan["counts"]["items"], 2)

    def test_csl_no_id_uses_content_hash_with_explicit_duplicate_policy(self):
        raw = {"type": "book", "title": "Synthetic, no id"}
        plan = build_import_plan({"format": "csl-json", "source_id": "synthetic:csl", "data": [raw, copy.deepcopy(raw)]})
        self.assertEqual(plan["counts"]["items"], 1)
        self.assertTrue(plan["items"][0]["source_key"].startswith("csl-content:"))
        self.assertTrue({"csl_identity_generated", "duplicate_source_record"} <= warning_codes(plan))

    def test_malformed_or_excessive_inputs_fail_before_import(self):
        cases = [
            {"format": "rdf", "source_id": "synthetic", "data": []},
            {"format": "zotero-api", "source_id": "", "data": []},
            {"format": "zotero-api", "source_id": "synthetic", "data": [{"key": "A", "title": {"not": "text"}}]},
            {"format": "zotero-api", "source_id": "synthetic", "data": [{"key": "A", "geometry": float("nan")}]},
            {"format": "zotero-api", "source_id": "synthetic", "data": [] , "other": "x" * 200001},
        ]
        for payload in cases:
            with self.subTest(format=payload["format"]), self.assertRaises(ImportPlanError):
                build_import_plan(payload)
        with patch("backend.library_mvp.zotero.MAX_ITEMS", 1), self.assertRaises(ImportPlanError):
            build_import_plan(api_payload([record("ONE"), record("TWO")]))


    def test_canonical_field_limits_report_truncation_and_keep_raw(self):
        source = record("PAPER001", title="T" * 1100, date="D" * 600,
                        DOI="x" * 600, url="https://example.invalid/" + "u" * 2100,
                        creators=[{"creatorType": "author", "name": "A" * 600}],
                        tags=[{"tag": f"tag-{i:03d}"} for i in range(101)])
        plan = build_import_plan(api_payload([source,
            record("NOTE0001", "note", parentItem="PAPER001", note="n" * 100001)],
            [collection("COLL0001", "C" * 600)]))
        paper = plan["items"][0]
        self.assertEqual(len(paper["title"]), 1000)
        self.assertEqual(len(paper["date"]), 500)
        self.assertEqual(len(paper["authors"][0]), 500)
        self.assertEqual(len(paper["tags"]), 100)
        self.assertEqual(paper["doi"], "", "do not invent a truncated DOI")
        self.assertEqual(paper["url"], "", "do not invent a truncated URL")
        self.assertEqual(len(paper["notes"][0]["body"]), 100000)
        self.assertEqual(len(plan["collections"][0]["name"]), 500)
        self.assertEqual(paper["raw_source"]["data"]["title"], "T" * 1100)
        truncations = [w for w in plan["warnings"] if w["code"] == "FIELD_TRUNCATED"]
        self.assertTrue({"title", "date", "authors[0]", "tags", "doi", "url", "body", "name"} <= {w["field"] for w in truncations})
        self.assertTrue(any("未映射 1 项" in w["message"] for w in truncations))

    def test_identity_keys_are_rejected_instead_of_truncated(self):
        source = record("K" * 501, title="Synthetic")
        with self.assertRaises(ImportPlanError):
            build_import_plan(api_payload([source]))

    def test_nonempty_attachment_note_becomes_persistent_unanchored_note(self):
        plan = build_import_plan(api_payload([record("PAPER001", title="Synthetic"),
            record("FILE0001", "attachment", parentItem="PAPER001", filename="synthetic.pdf",
                   linkMode="imported_file", note="<p>Attachment note</p>", customField="kept")]))
        paper = plan["items"][0]
        note = paper["notes"][0]
        self.assertEqual(note["body"], "Attachment note")
        self.assertEqual(note["source_key"], "FILE0001")
        self.assertEqual(note["attachment_source_key"], "FILE0001")
        self.assertIsNone(note["page_idx"])
        self.assertEqual(plan["counts"]["notes"], 1)
        self.assertEqual(paper["attachments"][0]["raw_source"]["data"]["customField"], "kept")
        self.assertIn("fields_preserved_in_source", warning_codes(plan))

class LocalSnapshotTests(unittest.TestCase):
    def fixture(self, *, items=None, collections=None, server_id="synthetic-server", version="7", override=None):
        items = items or []
        collections = collections or []
        requests = []
        def handler(request):
            requests.append(request)
            self.assertEqual(request.method, "GET")
            self.assertEqual(request.url.host, "127.0.0.1")
            self.assertEqual(request.url.port, 23119)
            self.assertIn(request.url.path, {"/api/", "/api/users/0/items", "/api/users/0/collections"})
            self.assertNotIn("authorization", request.headers)
            self.assertNotIn("zotero-api-key", request.headers)
            headers = {"Zotero-API-Version": "3", "Zotero-Schema-Version": "100"}
            if server_id is not None:
                headers["Zotero-Server-ID"] = server_id
            if request.url.path != "/api/" and version is not None:
                headers["Last-Modified-Version"] = version
            if override:
                response = override(request, headers, requests)
                if response is not None:
                    return response
            if request.url.path == "/api/":
                return httpx.Response(200, headers=headers, content=b"")
            source = items if request.url.path.endswith("/items") else collections
            start = int(request.url.params["start"])
            limit = int(request.url.params["limit"])
            headers["Total-Results"] = str(len(source))
            if request.headers.get("If-Modified-Since-Version"):
                return httpx.Response(304, headers=headers)
            return httpx.Response(200, headers=headers, json=source[start:start + limit])
        return httpx.Client(transport=httpx.MockTransport(handler)), requests

    def test_snapshot_is_loopback_get_only_partitioned_and_version_checked(self):
        items = [record(f"ITEM{i:04d}", title=f"Synthetic {i}") for i in range(101)]
        client, requests = self.fixture(items=items, collections=[collection("COLL0001", "Synthetic")])
        with client:
            payload = fetch_local_snapshot(client=client, base_url="http://localhost:23119/api/")
        self.assertEqual(payload["source_id"], "local:synthetic-server:users:0")
        self.assertEqual(payload["snapshot"]["library_version"], 7)
        self.assertEqual(payload["snapshot"]["consistency"], "version_checked")
        self.assertEqual(len(payload["data"]["items"]), 101)
        page_requests = [r for r in requests if r.url.path.endswith("/items") and r.url.params["limit"] == "100"]
        self.assertEqual([r.url.params["start"] for r in page_requests], ["0", "100"])
        self.assertTrue(all(r.headers.get("Zotero-Server-ID") == "synthetic-server" for r in requests[1:]))
        self.assertIn("personal_library_only", warning_codes(build_import_plan(payload)))
        self.assertFalse(any("/file" in r.url.path for r in requests))

    def test_local_api_disabled_gives_actionable_safe_message(self):
        client, requests = self.fixture(override=lambda r, h, rs: httpx.Response(403, content=b"not displayed"))
        with client, self.assertRaises(LocalSnapshotError) as caught:
            fetch_local_snapshot(client=client)
        self.assertEqual(caught.exception.code, "local_api_disabled")
        self.assertIn("Zotero 设置", str(caught.exception))
        self.assertNotIn("not displayed", str(caught.exception))
        self.assertEqual(len(requests), 1)

    def test_version_change_during_paging_is_rejected(self):
        def change(r, h, requests):
            if r.url.params.get("start") == "100":
                h["Last-Modified-Version"] = "8"
                return httpx.Response(200, headers=h, json=[record("LAST0001")])
        client, _ = self.fixture(items=[record(f"ITEM{i:04d}") for i in range(101)], override=change)
        with client, self.assertRaises(LocalSnapshotError) as caught:
            fetch_local_snapshot(client=client)
        self.assertEqual(caught.exception.code, "library_changed")

    def test_version_change_at_final_check_is_rejected(self):
        def change(r, h, requests):
            if r.url.params.get("limit") == "1":
                h["Last-Modified-Version"] = "8"
                return httpx.Response(200, headers=h, json=[])
        client, _ = self.fixture(override=change)
        with client, self.assertRaises(LocalSnapshotError) as caught:
            fetch_local_snapshot(client=client)
        self.assertEqual(caught.exception.code, "library_changed")

    def test_instance_change_or_disappearance_is_rejected(self):
        for changed_id in ["different-instance", None]:
            def change(r, h, requests):
                if len(requests) == 2:
                    if changed_id is None:
                        h.pop("Zotero-Server-ID")
                    else:
                        h["Zotero-Server-ID"] = changed_id
                    return httpx.Response(200, headers=h, json=[])
            client, _ = self.fixture(override=change)
            with self.subTest(changed_id=changed_id), client, self.assertRaises(LocalSnapshotError) as caught:
                fetch_local_snapshot(client=client)
            self.assertEqual(caught.exception.code, "instance_changed")

    def test_identity_appearing_at_final_root_check_is_rejected(self):
        def change(r, h, requests):
            if r.url.path == "/api/" and len(requests) > 1:
                h["Zotero-Server-ID"] = "new-instance"
                return httpx.Response(200, headers=h, content=b"")
        client, _ = self.fixture(server_id=None, override=change)
        with client, self.assertRaises(LocalSnapshotError) as caught:
            fetch_local_snapshot(client=client, source_namespace="synthetic-library")
        self.assertEqual(caught.exception.code, "instance_changed")

    def test_missing_version_is_rejected_for_identified_instance(self):
        client, _ = self.fixture(version=None)
        with client, self.assertRaises(LocalSnapshotError) as caught:
            fetch_local_snapshot(client=client)
        self.assertEqual(caught.exception.code, "library_version_missing")

    def test_legacy_zotero_has_explicit_identity_and_consistency_downgrade(self):
        client, _ = self.fixture(server_id=None, version="0")
        with client:
            payload = fetch_local_snapshot(client=client, source_namespace="synthetic-library-A")
        self.assertEqual(payload["source_id"], "local:legacy:synthetic-library-A:users:0")
        self.assertEqual(payload["snapshot"]["consistency"], "legacy_best_effort")
        self.assertTrue({"legacy_instance_named", "legacy_snapshot_best_effort"} <= warning_codes(build_import_plan(payload)))

    def test_legacy_requires_named_namespace_before_reading_library_data(self):
        for namespace in [None, "", "   ", "x" * 201, "two\nlines", 123]:
            client, requests = self.fixture(server_id=None, version="0")
            with self.subTest(namespace=repr(namespace)[:30]), client, self.assertRaises(LocalSnapshotError) as caught:
                fetch_local_snapshot(client=client, source_namespace=namespace)
            self.assertEqual(caught.exception.code, "LOCAL_SOURCE_NAMESPACE_REQUIRED")
            self.assertEqual(len(requests), 1, "only API capabilities may be read before naming the source")

    def test_two_legacy_namespaces_keep_identical_source_keys_separate(self):
        plans = []
        for namespace in ["synthetic-library-A", "synthetic-library-B"]:
            client, _ = self.fixture(server_id=None, version="0", items=[record("SAME0001", title="Synthetic")])
            with client:
                plans.append(build_import_plan(fetch_local_snapshot(client=client, source_namespace=namespace)))
        self.assertEqual(plans[0]["items"][0]["source_key"], plans[1]["items"][0]["source_key"])
        self.assertNotEqual(plans[0]["source_id"], plans[1]["source_id"])
        self.assertNotEqual(plans[0]["plan_hash"], plans[1]["plan_hash"])

    def test_identified_instance_ignores_manual_namespace(self):
        hashes = []
        for namespace in [None, "manual-name-A", "manual-name-B"]:
            client, _ = self.fixture(items=[record("SAME0001", title="Synthetic")])
            with client:
                payload = fetch_local_snapshot(client=client, source_namespace=namespace)
            self.assertEqual(payload["source_id"], "local:synthetic-server:users:0")
            self.assertIsNone(payload["snapshot"]["source_namespace"])
            hashes.append(build_import_plan(payload)["plan_hash"])
        self.assertEqual(len(set(hashes)), 1)

    def test_redirect_to_file_or_remote_url_is_never_followed(self):
        for location in ["file:///unread/synthetic.pdf", "https://example.invalid/library"]:
            client, requests = self.fixture(override=lambda r, h, rs: httpx.Response(302, headers={"Location": location}))
            with self.subTest(location=location), client, self.assertRaises(LocalSnapshotError) as caught:
                fetch_local_snapshot(client=client)
            self.assertEqual(caught.exception.code, "redirect_refused")
            self.assertEqual(len(requests), 1)
            self.assertNotIn(location, str(caught.exception))

    def test_remote_arbitrary_port_or_path_is_rejected_before_network(self):
        client, requests = self.fixture()
        with client:
            for url in ["https://api.zotero.org/", "http://127.0.0.1:9999/api/", "http://127.0.0.1:23119/file/", "http://user:password@localhost:23119/api/", "http://localhost:23119/api/?key=x"]:
                with self.subTest(url=url), self.assertRaises(LocalSnapshotError) as caught:
                    fetch_local_snapshot(client=client, base_url=url)
                self.assertEqual(caught.exception.code, "local_url_required")
        self.assertEqual(requests, [])

    def test_untrusted_link_header_does_not_control_requests(self):
        def malicious_link(r, h, requests):
            if r.url.path.endswith("/items") and r.url.params.get("limit") == "100":
                h["Link"] = '<https://example.invalid/private>; rel="next"'
                h["Total-Results"] = "1"
                return httpx.Response(200, headers=h, json=[record("PAPER001")])
        client, requests = self.fixture(override=malicious_link)
        with client:
            fetch_local_snapshot(client=client)
        self.assertTrue(all(r.url.host == "127.0.0.1" for r in requests))

    def test_duplicate_keys_across_pages_fail(self):
        items = [record(f"ITEM{i:04d}") for i in range(100)] + [record("ITEM0000")]
        client, _ = self.fixture(items=items)
        with client, self.assertRaises(LocalSnapshotError) as caught:
            fetch_local_snapshot(client=client)
        self.assertEqual(caught.exception.code, "pagination_duplicate_key")

    def test_declared_large_library_is_rejected_without_fetching_all(self):
        def too_large(r, h, requests):
            if r.url.path.endswith("/items"):
                h["Total-Results"] = "999999"
                return httpx.Response(200, headers=h, json=[])
        client, requests = self.fixture(override=too_large)
        with client, self.assertRaises(LocalSnapshotError) as caught:
            fetch_local_snapshot(client=client)
        self.assertEqual(caught.exception.code, "snapshot_item_limit")
        self.assertEqual(len(requests), 2)

    def test_byte_limit_is_enforced_on_streamed_response(self):
        client, _ = self.fixture(items=[record("PAPER001", title="synthetic" * 20)])
        with client, patch("backend.library_mvp.zotero.MAX_PAYLOAD_BYTES", 64), self.assertRaises(LocalSnapshotError) as caught:
            fetch_local_snapshot(client=client)
        self.assertEqual(caught.exception.code, "snapshot_byte_limit")

    def test_connection_error_does_not_leak_internal_details(self):
        def failure(request):
            raise httpx.ConnectError("synthetic internal credential or file path", request=request)
        with httpx.Client(transport=httpx.MockTransport(failure)) as client, self.assertRaises(LocalSnapshotError) as caught:
            fetch_local_snapshot(client=client)
        self.assertEqual(caught.exception.code, "local_connection_failed")
        self.assertNotIn("credential", str(caught.exception))

    def test_supplied_client_credentials_and_cookies_are_not_inherited(self):
        client, requests = self.fixture()
        client.headers["Zotero-API-Key"] = "synthetic-not-a-secret"
        client.headers["Authorization"] = "Bearer synthetic-not-a-secret"
        client.auth = httpx.BasicAuth("synthetic-user", "synthetic-password")
        client.cookies.set("synthetic-session", "not-a-secret")
        with client:
            fetch_local_snapshot(client=client)
        self.assertTrue(all("cookie" not in r.headers for r in requests))

    def test_future_api_version_is_rejected(self):
        client, _ = self.fixture(override=lambda r, h, rs: httpx.Response(200, headers={"Zotero-API-Version": "4"}))
        with client, self.assertRaises(LocalSnapshotError) as caught:
            fetch_local_snapshot(client=client)
        self.assertEqual(caught.exception.code, "api_version_unsupported")


if __name__ == "__main__":
    unittest.main()
