"""Offline domain tests use only temporary roots and synthetic PDFs."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import fitz

from backend.library_mvp.store import Store, StoreError


def synthetic_pdf(lines: list[str], *, title: str = "Synthetic paper") -> bytes:
    document = fitz.open()
    document.set_metadata({"title": title})
    for line in lines:
        page = document.new_page()
        if line:
            page.insert_text((72, 72), line)
    raw = document.tobytes()
    document.close()
    return raw


def import_plan(*, title: str = "Imported synthetic paper", version: int = 1, notes: bool = True) -> dict:
    return {
        "source_id": "synthetic-zotero-instance:users:0", "source_kind": "zotero-api-v3",
        "plan_hash": "synthetic-reviewed-plan",
        "collections": [
            {"source_key": "COLL0001", "name": "Research", "parent_source_key": None, "raw_source": {"key": "COLL0001"}},
            {"source_key": "COLL0002", "name": "Nested", "parent_source_key": "COLL0001", "raw_source": {"key": "COLL0002"}}],
        "items": [{
            "source_key": "PAPER001", "source_version": version, "title": title, "item_type": "journalArticle",
            "authors": ["Ada Example"], "date": "2024-01-02", "doi": "10.0000/synthetic", "url": "",
            "abstract": "Synthetic abstract", "tags": ["synthetic"], "collection_source_keys": ["COLL0002"],
            "raw_source": {"key": "PAPER001", "version": version, "unknownPluginField": {"keep": True}},
            "attachments": [{"source_key": "ATTACH01", "parent_key": "PAPER001", "filename": "missing.pdf",
                             "mime": "application/pdf", "link_mode": "imported_file", "missing_reason": "file_not_imported",
                             "raw_source": {"key": "ATTACH01", "unknown": "preserved"}}],
            "notes": [{"source_key": "NOTE0001", "parent_key": "ATTACH01", "attachment_source_key": "ATTACH01",
                       "body": "Source note", "quote": "Source quote", "translated_quote": "Translation",
                       "page_idx": None, "source_page_idx": 2, "source_page_label": "3",
                       "raw_source": {"key": "NOTE0001", "annotationPosition": json.dumps({"pageIndex": 2})}}] if notes else []
        }], "warnings": [{"code": "ATTACHMENT_NOT_IMPORTED", "message": "Synthetic missing file."}],
    }


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="retain-research-store-test-")
        self.root = Path(self.temporary.name)
        self.store = Store(self.root)

    def tearDown(self):
        self.store.close()
        self.temporary.cleanup()

    def paper_with_pdf(self, lines=None):
        raw = synthetic_pdf(lines or ["Alpha finding on page one.", "Beta finding on page two."])
        result = self.store.add_pdf(raw, filename="synthetic.pdf")
        return result["item"], result["attachment"], raw

    def test_immutable_pdf_hash_deduplication_and_page_evidence(self):
        item, attachment, raw = self.paper_with_pdf()
        digest = hashlib.sha256(raw).hexdigest()
        self.assertEqual(attachment["document_id"], digest)
        self.assertEqual(self.store.attachment_path(attachment["id"]).read_bytes(), raw)
        duplicate = self.store.add_pdf(raw, filename="renamed.pdf", item_id=item["id"])
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(duplicate["attachment"]["id"], attachment["id"])
        second = self.store.add_pdf(raw, filename="another.pdf")
        self.assertNotEqual(second["item"]["id"], item["id"])
        self.assertEqual(second["attachment"]["sha256"], digest)
        self.assertEqual(len(list((self.root / "blobs").rglob("*.pdf"))), 1)
        pages = self.store.get_pages(attachment["id"])
        self.assertEqual(pages["parse_status"], "native_text")
        self.assertEqual(pages["sha256"], digest)
        self.assertEqual([page["page_idx"] for page in pages["pages"]], [0, 1])
        self.assertIn("Alpha", pages["pages"][0]["blocks"][0]["text"])
        self.assertEqual(pages["revision_id"], self.store.get_pages(attachment["id"])["revision_id"])
        self.assertEqual(self.store.attachment_path(attachment["id"]).read_bytes(), raw)

    def test_metadata_collection_notes_survive_reopening(self):
        collection = self.store.create_collection({"name": "Synthetic"})
        item, attachment, _ = self.paper_with_pdf()
        self.store.update_item(item["id"], {"title": "Edited title", "authors": ["Ada Example"], "date": "2024",
                                             "doi": "10.0000/test", "tags": ["read"], "collection_ids": [collection["id"]]})
        note = self.store.create_note(item["id"], {"attachment_id": attachment["id"], "page_idx": 1,
                                                  "quote": "Beta finding", "translated_quote": "双语笔记", "body": "Persistent note"})
        self.store.close()
        self.store = Store(self.root)
        item = self.store.get_item(item["id"])
        self.assertEqual(item["title"], "Edited title")
        self.assertEqual(item["notes"][0]["id"], note["id"])
        self.assertEqual(item["notes"][0]["page_idx"], 1)
        self.assertEqual(item["notes"][0]["translated_quote"], "双语笔记")
        self.assertEqual(self.store.list_items(collection_id=collection["id"])["items"][0]["id"], item["id"])
        exported, _, _ = self.store.export_item(item["id"], "markdown")
        self.assertIn("PDF page 2", exported)
        self.assertIn(attachment["sha256"], exported)
        self.assertIn("Persistent note", exported)

    def test_notes_reject_cross_paper_and_invalid_page(self):
        first, attachment, _ = self.paper_with_pdf()
        other = self.store.create_item({"title": "Different paper"})
        with self.assertRaises(StoreError) as context:
            self.store.create_note(other["id"], {"attachment_id": attachment["id"], "page_idx": 0, "body": "invalid"})
        self.assertEqual(context.exception.code, "ATTACHMENT_SCOPE_MISMATCH")
        for page_idx in (-1, 2, True, "1"):
            with self.subTest(page_idx=page_idx), self.assertRaises(StoreError):
                self.store.create_note(first["id"], {"attachment_id": attachment["id"], "page_idx": page_idx, "body": "invalid"})
        with self.assertRaises(StoreError):
            self.store.create_note(first["id"], {"page_idx": 0, "body": "unverified anchor"})
        note = self.store.create_note(other["id"], {"body": "Plain note"})
        self.store.update_note(note["id"], {"body": "Updated plain note"})
        self.store.delete_note(note["id"])
        self.assertEqual(self.store.get_item(other["id"])["notes"], [])

    def test_blank_pdf_reports_ocr_requirement(self):
        raw = synthetic_pdf([""])
        response = self.store.add_pdf(raw)
        parsed = self.store.get_pages(response["attachment"]["id"])
        self.assertEqual(parsed["parse_status"], "needs_ocr")
        self.assertEqual(parsed["pages"][0]["text"], "")

    def test_invalid_pdf_does_not_create_a_paper(self):
        for raw in (b"", b"not a PDF", b"%PDF-invalid"):
            with self.subTest(raw=raw), self.assertRaises(StoreError):
                self.store.add_pdf(raw)
        self.assertEqual(self.store.list_items()["items"], [])
        self.assertEqual(list((self.root / "blobs").rglob("*.pdf")), [])

    def test_filename_is_display_only_and_original_integrity_checked(self):
        response = self.store.add_pdf(synthetic_pdf(["Evidence"]), filename="../../private/../sample.pdf")
        self.assertEqual(response["attachment"]["filename"], "sample.pdf")
        path = self.store.attachment_path(response["attachment"]["id"])
        self.assertTrue(path.is_relative_to(self.root))
        path.write_bytes(b"changed by test")
        with self.assertRaises(StoreError) as context:
            self.store.get_pages(response["attachment"]["id"])
        self.assertEqual(context.exception.code, "BLOB_INTEGRITY_FAILURE")

    def test_search_has_literal_wildcard_semantics(self):
        one = self.store.create_item({"title": "100% evidence", "authors": ["Ada Example"], "tags": ["literal_tag"]})
        self.store.create_item({"title": "Ordinary evidence"})
        self.assertEqual([item["id"] for item in self.store.list_items(query="%")["items"]], [one["id"]])
        self.assertEqual(len(self.store.list_items(query="Ada")["items"]), 1)
        self.assertEqual(len(self.store.list_items(query="literal_tag")["items"]), 1)

    def test_collection_cycle_and_unsupported_metadata_rejected(self):
        parent = self.store.create_collection({"name": "Parent"})
        child = self.store.create_collection({"name": "Child", "parent_id": parent["id"]})
        with self.assertRaises(StoreError):
            self.store.update_collection(parent["id"], {"parent_id": child["id"]})
        with self.assertRaises(StoreError):
            self.store.create_item({"title": "Bad URL", "url": "javascript:alert(1)"})
        with self.assertRaises(StoreError):
            self.store.create_item({"title": "Unexpected mutation", "attachments": []})

    def test_exports_escape_html_and_bibtex_and_keep_literal_creators(self):
        item = self.store.create_item({"title": "A & B {sample}", "authors": ["Ada Example", "Example Group"],
                                       "date": "2024-04", "doi": "10.0000/a_b"})
        self.store.create_note(item["id"], {"body": "<script>unsafe()</script>"})
        markdown, _, _ = self.store.export_item(item["id"], "markdown")
        self.assertNotIn("<script>", markdown)
        self.assertIn("&lt;script&gt;", markdown)
        bibtex, _, _ = self.store.export_item(item["id"], "bibtex")
        self.assertIn("\\&", bibtex)
        self.assertIn("\\{sample\\}", bibtex)
        csl = json.loads(self.store.export_item(item["id"], "csljson")[0])[0]
        self.assertEqual(csl["author"], [{"literal": "Ada Example"}, {"literal": "Example Group"}])
        self.assertEqual(csl["issued"], {"raw": "2024-04"})

    def test_source_import_is_idempotent_and_preserves_unavailable_annotations(self):
        plan = import_plan()
        report = self.store.commit_import(plan)
        self.assertEqual(report["created_items"], 1)
        again = self.store.commit_import(plan)
        self.assertEqual(again["unchanged_items"], 1)
        self.assertEqual(again["created_items"], 0)
        item = self.store.list_items()["items"][0]
        self.assertEqual(len(self.store.list_collections()), 2)
        self.assertEqual(len(item["notes"]), 1)
        self.assertIsNone(item["notes"][0]["page_idx"])
        self.assertIsNone(item["notes"][0]["attachment_id"])
        self.assertEqual(item["notes"][0]["source_page_idx"], 2)
        self.assertEqual(item["attachments"], [])
        self.assertFalse(item["imported_attachment_declarations"][0]["available"])
        source = json.loads(self.store.export_item(item["id"], "sourcejson")[0])
        self.assertEqual(source["source_records"]["items"][0]["raw_source"]["unknownPluginField"], {"keep": True})
        self.assertEqual(source["source_records"]["attachments"][0]["raw_source"]["unknown"], "preserved")
        self.assertIn("PDF not verified", self.store.export_item(item["id"], "markdown")[0])

    def test_source_update_and_safe_rollback_restore_previous_snapshot(self):
        self.store.commit_import(import_plan())
        item = self.store.list_items()["items"][0]
        updated = self.store.commit_import(import_plan(title="New source title", version=2, notes=False))
        self.assertEqual(updated["updated_items"], 1)
        self.assertEqual(self.store.get_item(item["id"])["title"], "New source title")
        self.assertEqual(self.store.get_item(item["id"])["notes"], [])
        rollback = self.store.rollback_import(updated["batch_id"])
        self.assertTrue(rollback["rolled_back"])
        restored = self.store.get_item(item["id"])
        self.assertEqual(restored["title"], "Imported synthetic paper")
        self.assertEqual(restored["notes"][0]["body"], "Source note")
        repeated = self.store.commit_import(import_plan())
        self.assertEqual(repeated["unchanged_items"], 1)

    def test_import_never_overwrites_local_edits_or_removes_their_pdf(self):
        initial = self.store.commit_import(import_plan())
        item = self.store.list_items()["items"][0]
        self.store.update_item(item["id"], {"title": "My local title"})
        second = self.store.commit_import(import_plan(title="New upstream title", version=2))
        self.assertEqual(second["updated_items"], 0)
        self.assertEqual(second["conflicts"][0]["code"], "LOCAL_EDITS_PROTECTED")
        self.assertEqual(self.store.get_item(item["id"])["title"], "My local title")
        attachment = self.store.add_pdf(synthetic_pdf(["Local PDF"]), item_id=item["id"])["attachment"]
        rollback = self.store.rollback_import(initial["batch_id"])
        self.assertFalse(rollback["rolled_back"])
        self.assertTrue(self.store.attachment_path(attachment["id"]).is_file())
        self.assertEqual(len(self.store.list_items()["items"]), 1)

    def test_rollback_new_batch_does_not_touch_preexisting_item(self):
        existing = self.store.create_item({"title": "Preexisting local paper"})
        report = self.store.commit_import(import_plan())
        result = self.store.rollback_import(report["batch_id"])
        self.assertTrue(result["rolled_back"])
        self.assertEqual([item["id"] for item in self.store.list_items()["items"]], [existing["id"]])
        self.assertEqual(self.store.list_collections(), [])
        self.assertTrue(self.store.rollback_import(report["batch_id"])["already_rolled_back"])

    def test_invalid_import_transaction_leaves_no_partial_records(self):
        plan = import_plan()
        invalid = copy.deepcopy(plan["items"][0])
        invalid["source_key"] = "PAPER002"
        invalid["url"] = "javascript:bad"
        plan["items"].append(invalid)
        with self.assertRaises(StoreError):
            self.store.commit_import(plan)
        self.assertEqual(self.store.list_items()["items"], [])
        self.assertEqual(self.store.list_collections(), [])
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM import_batches").fetchone()[0], 0)

    def test_legacy_data_root_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / "db").mkdir()
            with self.assertRaises(StoreError) as context:
                Store(path)
            self.assertEqual(context.exception.code, "UNSAFE_DATA_ROOT")
            self.assertFalse((path / "research-library.json").exists())


    def test_import_collection_cycle_is_rejected_atomically(self):
        self.store.commit_import(import_plan())
        plan = import_plan(title="Uncommitted source title", version=2)
        plan["collections"][0]["parent_source_key"] = "COLL0002"
        with self.assertRaises(StoreError) as context:
            self.store.commit_import(plan)
        self.assertEqual(context.exception.code, "COLLECTION_CYCLE")
        self.assertEqual(self.store.list_items()["items"][0]["title"], "Imported synthetic paper")
        self.assertEqual(self.store.list_collections()[1]["parent_id"], None)

    def test_rollback_added_collection_restores_updated_item(self):
        self.store.commit_import(import_plan())
        plan = import_plan(version=2)
        plan["collections"].append({"source_key": "COLL0003", "name": "New collection",
                                    "parent_source_key": None, "raw_source": {"key": "COLL0003"}})
        plan["items"][0]["collection_source_keys"] = ["COLL0003"]
        report = self.store.commit_import(plan)
        self.assertEqual(len(self.store.list_collections()), 3)
        result = self.store.rollback_import(report["batch_id"])
        self.assertTrue(result["rolled_back"], result)
        self.assertEqual(len(self.store.list_collections()), 2)
        self.assertEqual(self.store.commit_import(import_plan())["unchanged_items"], 1)

    def test_rollback_shared_collection_refuses_later_relationship(self):
        imported = self.store.commit_import(import_plan())
        collection = self.store.list_collections()[0]
        unrelated = self.store.create_item({"title": "Later local paper", "collection_ids": [collection["id"]]})
        result = self.store.rollback_import(imported["batch_id"])
        self.assertFalse(result["rolled_back"])
        self.assertTrue(any(conflict["code"] == "COLLECTION_IN_USE" for conflict in result["conflicts"]))
        self.assertEqual(self.store.get_item(unrelated["id"])["collection_ids"], [collection["id"]])
        self.assertEqual(len(self.store.list_items()["items"]), 2)


    def test_data_marker_and_blob_symlinks_are_refused(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            path = Path(root)
            target = Path(outside) / "marker.json"
            target.write_text("{}")
            (path / "research-library.json").symlink_to(target)
            with self.assertRaises(StoreError) as context:
                Store(path)
            self.assertEqual(context.exception.code, "UNSAFE_DATA_ROOT")
        item, attachment, raw = self.paper_with_pdf()
        owned = self.store.attachment_path(attachment["id"])
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / "synthetic.pdf"
            target.write_bytes(raw)
            owned.unlink()
            owned.symlink_to(target)
            with self.assertRaises(StoreError) as context:
                self.store.attachment_path(attachment["id"])
            self.assertEqual(context.exception.code, "UNSAFE_BLOB_PATH")


    def test_csl_import_export_roundtrip_preserves_type_and_unmapped_raw_fields(self):
        from backend.library_mvp.zotero import build_import_plan
        for csl_type, bibtex_type in (("paper-conference", "inproceedings"),
                                      ("article-journal", "article"), ("chapter", "incollection")):
            with self.subTest(csl_type=csl_type):
                raw = {"id": "synthetic-" + csl_type, "type": csl_type, "title": "Synthetic " + csl_type,
                       "author": [{"family": "Example", "given": "Ada"}],
                       "issued": {"date-parts": [[2024, 4, 2]]}, "DOI": "10.0000/" + csl_type,
                       "container-title": "Synthetic container", "volume": "7", "page": "10-20",
                       "custom-source-field": {"preserve": True}}
                payload = {"format": "csl-json", "source_id": "synthetic-csl:" + csl_type, "data": [raw]}
                plan = build_import_plan(payload)
                self.assertTrue(any("container-title" in warning.get("field", "").split(", ") for warning in plan["warnings"]))
                self.assertEqual(self.store.commit_import(plan)["created_items"], 1)
                item = next(item for item in self.store.list_items()["items"] if item["title"] == raw["title"])
                exported = json.loads(self.store.export_item(item["id"], "csljson")[0])[0]
                self.assertEqual(exported["type"], csl_type)
                self.assertEqual(exported["title"], raw["title"])
                # Simplified export remains explicit: unmapped fields are retained in sourcejson.
                self.assertNotIn("container-title", exported)
                source = json.loads(self.store.export_item(item["id"], "sourcejson")[0])
                self.assertEqual(source["source_records"]["items"][0]["raw_source"], raw)
                self.assertTrue(self.store.export_item(item["id"], "bibtex")[0].startswith("@" + bibtex_type + "{"))
                reimported = build_import_plan({"format": "csl-json", "source_id": "roundtrip:" + csl_type,
                                                "data": [exported]})
                self.assertEqual(reimported["items"][0]["item_type"], csl_type)

    def test_zotero_and_csl_names_export_to_equivalent_bibliographic_types(self):
        for zotero_type, csl_type, bibtex_type in (
                ("conferencePaper", "paper-conference", "inproceedings"),
                ("journalArticle", "article-journal", "article"),
                ("bookSection", "chapter", "incollection"),
                ("book", "book", "book"), ("report", "report", "techreport")):
            with self.subTest(zotero_type=zotero_type):
                item = self.store.create_item({"title": "Synthetic type example", "item_type": zotero_type})
                exported = json.loads(self.store.export_item(item["id"], "csljson")[0])[0]
                self.assertEqual(exported["type"], csl_type)
                self.assertTrue(self.store.export_item(item["id"], "bibtex")[0].startswith("@" + bibtex_type + "{"))
        for csl_type in ("dataset", "software", "legal_case", "thesis", "document", "speech", "standard"):
            with self.subTest(csl_type=csl_type):
                item = self.store.create_item({"title": "Other standard CSL type", "item_type": csl_type})
                self.assertEqual(json.loads(self.store.export_item(item["id"], "csljson")[0])[0]["type"], csl_type)


if __name__ == "__main__":
    unittest.main()
