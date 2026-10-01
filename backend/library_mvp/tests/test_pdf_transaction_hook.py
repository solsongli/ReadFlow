"""Synthetic PDF saves and connector metadata share one Store transaction."""
from pathlib import Path
import hashlib
import tempfile
import unittest

import pymupdf

from backend.library_mvp.store import Store, StoreError


class PdfTransactionHookTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="retain-pdf-save-hook-")
        self.root = Path(self.temporary.name)
        self.store = Store(self.root)
        with pymupdf.open() as document:
            document.set_metadata({"title": "Synthetic original title"})
            page = document.new_page()
            page.insert_text((60, 60), "Synthetic transaction evidence.")
            self.pdf = document.tobytes()

    def tearDown(self):
        self.store.close()
        self.temporary.cleanup()

    def write_metadata_and_link(self, result, title="Connector title"):
        self.assertTrue(self.store.db.in_transaction, "hook must run before the PDF transaction commits")
        identity = result["item"]["id"]
        self.assertEqual(self.store.get_attachment(result["attachment"]["id"])["item_id"], identity)
        self.store._write_item(identity, self.store._metadata({"title": title}, partial=True))
        self.store.db.execute("INSERT INTO source_links VALUES(?,?,?,?,?,?,?,?)",
                              ("synthetic-connector", "connector-attachment", "synthetic-key", result["attachment"]["id"],
                               None, "source-fingerprint", "target-fingerprint", "{}"))

    def reject_metadata_after_related_writes(self, result):
        self.write_metadata_and_link(result, "Uncommitted title")
        self.store._metadata({"url": "javascript:invalid-connector-url"}, partial=True)

    def test_default_save_and_duplicate_semantics_are_unchanged(self):
        first = self.store.add_pdf(self.pdf, filename="first.pdf")
        repeated = self.store.add_pdf(self.pdf, filename="renamed.pdf", item_id=first["item"]["id"])
        second_paper = self.store.add_pdf(self.pdf, filename="shared-bytes.pdf", on_saved=None)
        self.assertEqual(set(first), {"item", "attachment", "duplicate"})
        self.assertFalse(first["duplicate"])
        self.assertTrue(repeated["duplicate"])
        self.assertEqual(repeated["attachment"]["id"], first["attachment"]["id"])
        self.assertEqual(repeated["attachment"]["filename"], "first.pdf")
        self.assertNotEqual(second_paper["item"]["id"], first["item"]["id"])
        self.assertEqual(first["attachment"]["sha256"], hashlib.sha256(self.pdf).hexdigest())
        self.assertEqual(len(list(self.store.blobs.rglob("*.pdf"))), 1)
        self.assertFalse(self.store.db.in_transaction)

    def test_successful_new_hook_commits_metadata_link_and_refreshed_result(self):
        calls = []
        def save_related(result):
            calls.append(result["attachment"]["id"])
            self.write_metadata_and_link(result)
        result = self.store.add_pdf(self.pdf, on_saved=save_related)
        self.assertEqual(calls, [result["attachment"]["id"]])
        self.assertEqual(result["item"]["title"], "Connector title")
        self.assertFalse(self.store.db.in_transaction)
        self.store.close()
        self.store = Store(self.root)
        self.assertEqual(self.store.get_item(result["item"]["id"])["title"], "Connector title")
        self.assertEqual(self.store.db.execute("SELECT entity_id FROM source_links").fetchone()[0], result["attachment"]["id"])
        self.assertEqual(self.store.attachment_path(result["attachment"]["id"]).read_bytes(), self.pdf)

    def test_failed_standalone_hook_leaves_no_partial_item_attachment_or_source_link(self):
        with self.assertRaises(StoreError) as rejected:
            self.store.add_pdf(self.pdf, on_saved=self.reject_metadata_after_related_writes)
        self.assertEqual(rejected.exception.code, "INVALID_URL")
        for table in ("items", "attachments", "source_links", "item_collections"):
            self.assertEqual(self.store.db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0)
        self.assertFalse(self.store.db.in_transaction)
        retry = self.store.add_pdf(self.pdf)
        self.assertFalse(retry["duplicate"])
        self.assertEqual(len(self.store.list_items()["items"]), 1)

    def test_failed_new_attachment_hook_preserves_preexisting_item(self):
        original = self.store.create_item({"title": "Preexisting paper", "tags": ["preserve"]})
        with self.assertRaises(StoreError):
            self.store.add_pdf(self.pdf, item_id=original["id"], on_saved=self.reject_metadata_after_related_writes)
        self.assertEqual(self.store.get_item(original["id"]), original)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM attachments").fetchone()[0], 0)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM source_links").fetchone()[0], 0)
        self.assertFalse(self.store.db.in_transaction)

    def test_duplicate_hook_runs_and_failure_preserves_existing_pdf_and_notes_raw(self):
        first = self.store.add_pdf(self.pdf)
        annotation = {"id": "synthetic-native-before-hook", "page": 1, "pane": "source",
            "quote": "Synthetic transaction evidence.", "note": "Preserve saved thought.",
            "createdAt": "2026-09-30T12:00:00+00:00", "itemId": first["item"]["id"],
            "attachmentId": first["attachment"]["id"], "documentId": first["attachment"]["sha256"],
            "selection": {"origin": "reader-selection", "rects": [{"x": 0.1, "y": 0.2}]}}
        self.store.create_note(first["item"]["id"], {"attachment_id": first["attachment"]["id"],
            "page_idx": 0, "quote": annotation["quote"], "body": annotation["note"], "reader_annotation": annotation})
        original = self.store.get_item(first["item"]["id"])
        calls = []
        def reject_duplicate(result):
            self.assertTrue(result["duplicate"])
            calls.append(result["attachment"]["id"])
            self.reject_metadata_after_related_writes(result)
        with self.assertRaises(StoreError):
            self.store.add_pdf(self.pdf, item_id=first["item"]["id"], on_saved=reject_duplicate)
        self.assertEqual(calls, [first["attachment"]["id"]])
        self.assertEqual(self.store.get_item(first["item"]["id"]), original)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM source_links").fetchone()[0], 0)
        self.assertEqual(self.store.attachment_path(first["attachment"]["id"]).read_bytes(), self.pdf)
        self.assertFalse(self.store.db.in_transaction)
        committed = self.store.add_pdf(self.pdf, item_id=first["item"]["id"], on_saved=self.write_metadata_and_link)
        self.assertTrue(committed["duplicate"])
        self.assertEqual(committed["item"]["title"], "Connector title")
        self.assertEqual(committed["item"]["notes"], original["notes"])
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM attachments").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
