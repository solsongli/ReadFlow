"""Synthetic native Reader notes, source bindings, and existing source-data protection."""
from pathlib import Path
import json
import tempfile
import unittest

import pymupdf
from backend.library_mvp.store import Store, StoreError, NATIVE_ANNOTATION_KEY
from backend.library_mvp.zotero import build_import_plan


class NativeAnnotationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="retain-native-annotations-")
        self.root = Path(self.temporary.name)
        self.store = Store(self.root)
        with pymupdf.open() as document:
            for line in ("Synthetic source quotation.", "Second physical page."):
                page = document.new_page()
                page.insert_text((60, 60), line)
            self.pdf = document.tobytes()
        upload = self.store.add_pdf(self.pdf, filename="synthetic.pdf")
        self.item, self.attachment = upload["item"], upload["attachment"]

    def tearDown(self):
        self.store.close()
        self.temporary.cleanup()

    def payload(self, identity="synthetic-reader-note", *, item=None, attachment=None):
        item, attachment = item or self.item, attachment or self.attachment
        annotation = {"id": identity, "page": 1, "pane": "source", "quote": "Synthetic source quotation.",
                      "note": "My synthetic observation.", "createdAt": "2026-09-30T12:00:00+00:00",
                      "itemId": item["id"], "attachmentId": attachment["id"], "documentId": attachment["sha256"],
                      "selection": {"type": "text", "coordinateSpace": "reader-viewport",
                                    "rect": {"left": 30, "top": 40, "width": 100, "height": 12}}}
        return {"attachment_id": attachment["id"], "page_idx": 0, "quote": annotation["quote"],
                "translated_quote": "", "body": annotation["note"], "reader_annotation": annotation}

    def test_original_annotation_and_source_bindings_survive_reopen_and_export(self):
        value = self.payload()
        note = self.store.create_note(self.item["id"], value)
        self.assertEqual(note["id"], value["reader_annotation"]["id"])
        self.assertEqual(note["reader_annotation"], value["reader_annotation"])
        self.store.close()
        self.store = Store(self.root)
        saved = self.store.get_item(self.item["id"])["notes"][0]
        self.assertEqual(saved["reader_annotation"], value["reader_annotation"])
        export = json.loads(self.store.export_item(self.item["id"], "sourcejson")[0])
        self.assertEqual(export["source_records"]["notes"][0]["raw_source"][NATIVE_ANNOTATION_KEY],
                         value["reader_annotation"])

    def test_create_retry_is_idempotent_but_same_id_other_paper_is_refused(self):
        value = self.payload()
        first = self.store.create_note(self.item["id"], value)
        again = self.store.create_note(self.item["id"], value)
        self.assertEqual(first, again)
        self.assertEqual(len(self.store.get_item(self.item["id"])["notes"]), 1)
        second_item = self.store.create_item({"title": "Another bibliography for same PDF"})
        second_attachment = self.store.add_pdf(self.pdf, item_id=second_item["id"])["attachment"]
        with self.assertRaises(StoreError) as rejected:
            self.store.create_note(second_item["id"], self.payload(item=second_item, attachment=second_attachment))
        self.assertEqual(rejected.exception.code, "ANNOTATION_ID_CONFLICT")
        separate = self.store.create_note(second_item["id"], self.payload("separate-reader-note", item=second_item, attachment=second_attachment))
        self.assertEqual(separate["reader_annotation"]["documentId"], first["reader_annotation"]["documentId"])
        self.assertNotEqual(separate["reader_annotation"]["itemId"], first["reader_annotation"]["itemId"])
        self.assertNotEqual(separate["attachment_id"], first["attachment_id"])

    def test_mismatched_identity_hash_page_and_translated_anchor_are_rejected(self):
        for field, changed, expected_code in [
            ("itemId", "another-paper", "ANNOTATION_SCOPE_MISMATCH"),
            ("attachmentId", "another-attachment", "ANNOTATION_SCOPE_MISMATCH"),
            ("documentId", "0" * 64, "ANNOTATION_SCOPE_MISMATCH"),
            ("page", 2, "ANNOTATION_PAGE_MISMATCH"),
            ("page", True, "ANNOTATION_PAGE_MISMATCH"),
            ("pane", "translated", "UNVERIFIED_TRANSLATION_ANCHOR"),
            ("quote", "Invented quotation.", "ANNOTATION_TEXT_MISMATCH"),
        ]:
            with self.subTest(field=field):
                value = self.payload()
                value["reader_annotation"][field] = changed
                with self.assertRaises(StoreError) as rejected:
                    self.store.create_note(self.item["id"], value)
                self.assertEqual(rejected.exception.code, expected_code)
        self.assertEqual(self.store.get_item(self.item["id"])["notes"], [])

    def test_patch_identity_must_equal_saved_note_and_body_only_updates_raw_structure(self):
        value = self.payload()
        saved = self.store.create_note(self.item["id"], value)
        bad = {**value, "reader_annotation": {**value["reader_annotation"], "id": "different-id"}}
        with self.assertRaises(StoreError) as rejected:
            self.store.update_note(saved["id"], bad)
        self.assertEqual(rejected.exception.code, "ANNOTATION_SCOPE_MISMATCH")
        updated = self.store.update_note(saved["id"], {"body": "Updated in the library."})
        self.assertEqual(updated["reader_annotation"]["note"], updated["body"])
        self.assertEqual(updated["reader_annotation"]["selection"], value["reader_annotation"]["selection"])

    def test_zotero_raw_data_cannot_be_replaced_by_native_annotation(self):
        report = self.store.commit_import(build_import_plan({
            "format": "zotero-api", "source_id": "synthetic-zotero",
            "data": [{"key": "PAPER001", "version": 1, "itemType": "journalArticle", "title": "Imported source"},
                     {"key": "NOTE0001", "version": 1, "itemType": "note", "parentItem": "PAPER001", "note": "<p>Source note</p>"}],
        }))
        self.assertEqual(report["created_items"], 1)
        item = next(item for item in self.store.list_items()["items"] if item["title"] == "Imported source")
        attachment = self.store.add_pdf(self.pdf, item_id=item["id"])["attachment"]
        note = self.store.get_item(item["id"])["notes"][0]
        before = self.store.source_records(item["id"])["notes"][0]["raw_source"]
        with self.assertRaises(StoreError) as rejected:
            self.store.update_note(note["id"], self.payload(note["id"], item=item, attachment=attachment))
        self.assertEqual(rejected.exception.code, "SOURCE_NOTE_PROTECTED")
        self.store.update_note(note["id"], {"body": "Edited body without replacing source."})
        self.assertEqual(self.store.source_records(item["id"])["notes"][0]["raw_source"], before)

    def test_extension_limits_and_nonfinite_geometry_are_rejected(self):
        value = self.payload()
        value["reader_annotation"]["selection"]["rect"]["top"] = float("nan")
        with self.assertRaises(StoreError):
            self.store.create_note(self.item["id"], value)
        value = self.payload()
        value["reader_annotation"]["createdAt"] = "2026-09-30T12:00:00"
        with self.assertRaises(StoreError):
            self.store.create_note(self.item["id"], value)

    def test_changed_original_pdf_rejects_annotation_write(self):
        self.store.attachment_path(self.attachment["id"]).write_bytes(b"synthetic-corrupted-by-test")
        with self.assertRaises(StoreError) as rejected:
            self.store.create_note(self.item["id"], self.payload())
        self.assertEqual(rejected.exception.code, "BLOB_INTEGRITY_FAILURE")
        self.assertEqual(self.store.get_item(self.item["id"])["notes"], [])


if __name__ == "__main__":
    unittest.main()
