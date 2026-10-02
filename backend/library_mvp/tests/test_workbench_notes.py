"""Synthetic notes workspace API, including native annotation consistency; no external services."""
import json
from pathlib import Path
import tempfile
import unittest

import httpx
import pymupdf

from backend.library_mvp.api import create_app
from backend.library_mvp.store import NATIVE_ANNOTATION_KEY

ROOT = "/api/research/workbench"


class WorkbenchNotesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="readflow-notes-test-")
        self.app = create_app(Path(self.temp.name))
        self.store = self.app.state.store
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://localhost")
        with pymupdf.open() as pdf:
            for line in ("Synthetic quote", "Second page"):
                page = pdf.new_page()
                page.insert_text((50, 50), line)
            upload = self.store.add_pdf(pdf.tobytes(), filename="synthetic.pdf")
        self.paper, self.pdf = upload["item"], upload["attachment"]
        self.store.update_item(self.paper["id"], {"title": "Synthetic Research"})
        self.app.state.workbench.update_state(self.paper["id"], {"title_translated": "合成研究"})
        self.other = self.store.create_item({"title": "Other paper"})

    async def asyncTearDown(self):
        await self.client.aclose()
        self.store.close()
        self.temp.cleanup()

    async def ok(self, method, path, **kwargs):
        response = await self.client.request(method, path, **kwargs)
        self.assertLess(response.status_code, 300, response.text)
        return response.json() if response.content else None

    async def free(self, body="A free note", item=None):
        return await self.ok("POST", f"/api/research/items/{(item or self.paper)['id']}/notes", json={"body": body})

    async def annotation(self, *, quote="Synthetic quote", body="Observation"):
        annotation = {"id": "synthetic-annotation", "itemId": self.paper["id"], "attachmentId": self.pdf["id"],
                      "documentId": self.pdf["sha256"], "page": 2, "pane": "source", "quote": quote, "note": body,
                      "createdAt": "2026-10-02T12:00:00Z", "color": "purple",
                      "selection": {"type": "text", "rect": {"left": 10, "top": 20, "width": 40, "height": 12}}}
        return await self.ok("POST", f"/api/research/items/{self.paper['id']}/notes", json={
            "attachment_id": self.pdf["id"], "page_idx": 1, "quote": quote, "body": body, "reader_annotation": annotation})

    async def listing(self, **params):
        return await self.ok("GET", ROOT + "/notes", params=params)

    async def test_filters_counts_and_search_both_paper_titles_body_and_quote(self):
        note = await self.free("Mixed CASE note Straße")
        annotation = await self.annotation()
        await self.free("Unrelated", self.other)
        result = await self.listing(item_id=self.paper["id"])
        self.assertEqual(result["counts"], {"total": 2, "notes": 1, "annotations": 1})
        self.assertEqual({row["id"] for row in result["items"]}, {note["id"], annotation["id"]})
        for query in ("RESEARCH", "合成研究"):
            self.assertEqual((await self.listing(q=query))["total"], 2)
        self.assertEqual((await self.listing(q="case"))["items"][0]["id"], note["id"])
        self.assertEqual((await self.listing(q="STRASSE"))["items"][0]["id"], note["id"])
        self.assertEqual((await self.listing(q="synthetic quote"))["items"][0]["id"], annotation["id"])
        self.assertEqual((await self.listing(kind="annotations"))["total"], 1)
        self.assertEqual((await self.listing(kind="notes"))["total"], 2)
        self.assertEqual((await self.listing(q="%_"))["total"], 0)

    async def test_trashed_paper_is_excluded_even_when_filtered_by_id(self):
        await self.free()
        await self.annotation()
        await self.ok("POST", ROOT + "/items/trash", json={"item_ids": [self.paper["id"]]})
        for params in ({}, {"item_id": self.paper["id"]}, {"q": "Synthetic"}):
            result = await self.listing(**params)
            self.assertEqual(result["items"], [])
            self.assertEqual(result["counts"]["total"], 0)
        await self.ok("POST", ROOT + "/items/restore", json={"item_ids": [self.paper["id"]]})
        self.assertEqual((await self.listing())["total"], 2)

    async def test_body_only_edit_keeps_native_annotation_consistent_and_geometry_unchanged(self):
        original = await self.annotation()
        updated = await self.ok("PATCH", f"/api/research/notes/{original['id']}", json={"body": "**Updated** observation"})
        self.assertEqual(updated["reader_annotation"]["note"], updated["body"])
        self.assertEqual(updated["reader_annotation"]["quote"], updated["quote"])
        for field in ("selection", "page", "documentId", "attachmentId", "itemId", "color", "createdAt"):
            self.assertEqual(updated["reader_annotation"][field], original["reader_annotation"][field])
        persisted = json.loads(self.store.db.execute("SELECT raw_source_json FROM notes WHERE id=?", (original["id"],)).fetchone()[0])
        self.assertEqual(persisted[NATIVE_ANNOTATION_KEY], updated["reader_annotation"])
        row = (await self.listing())["items"][0]
        self.assertEqual(row["body"], updated["body"])
        self.assertEqual(row["kind"], "annotation")
        self.assertEqual(row["color"], "purple")
        self.assertEqual(row["page_idx"], 1)
        self.assertNotIn("raw_source_json", row)
        self.assertNotIn("reader_annotation", row)

    async def test_explicit_mismatched_annotation_still_rejected_without_partial_write(self):
        original = await self.annotation()
        response = await self.client.patch(f"/api/research/notes/{original['id']}", json={"body": "different", "reader_annotation": original["reader_annotation"]})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "ANNOTATION_TEXT_MISMATCH")
        self.assertEqual((await self.listing())["items"][0]["body"], original["body"])

    async def test_free_note_crud_and_text_limit(self):
        note = await self.free("Draft")
        updated = await self.ok("PATCH", f"/api/research/notes/{note['id']}", json={"body": "x" * 100000})
        self.assertEqual(len(updated["body"]), 100000)
        for body in ("", "x" * 100001):
            response = await self.client.patch(f"/api/research/notes/{note['id']}", json={"body": body})
            self.assertEqual(response.status_code, 400)
        self.assertEqual((await self.listing())["items"][0]["kind"], "note")
        await self.ok("DELETE", f"/api/research/notes/{note['id']}")
        self.assertEqual((await self.listing())["total"], 0)

    async def test_pagination_default_limit_sort_and_invalid_queries(self):
        for index in range(205):
            note = self.store.create_note(self.paper["id"], {"body": f"Note {index}"})
            self.store.db.execute("UPDATE notes SET updated_at=? WHERE id=?", (f"2026-10-02T12:{index // 60:02}:{index % 60:02}Z", note["id"]))
        default = await self.listing()
        self.assertEqual(len(default["items"]), 200)
        self.assertEqual(default["total"], 205)
        self.assertEqual(default["items"][0]["body"], "Note 204")
        tail = await self.listing(offset=200)
        self.assertEqual(len(tail["items"]), 5)
        self.assertFalse({r["id"] for r in tail["items"]} & {r["id"] for r in default["items"]})
        for params in ({"limit": 0}, {"limit": 1001}, {"offset": -1}, {"kind": "invalid"}):
            response = await self.client.get(ROOT + "/notes", params=params)
            self.assertEqual(response.status_code, 400)

    async def test_nontext_annotation_counts_match_desk_and_library(self):
        await self.annotation(quote="", body="Image region observation")
        await self.free()
        notes = await self.listing()
        desk = await self.ok("GET", ROOT + "/desk")
        library = await self.ok("GET", ROOT + "/items")
        self.assertEqual(notes["counts"]["notes"], desk["counts"]["notes"])
        self.assertEqual(notes["counts"]["annotations"], desk["counts"]["annotations"])
        self.assertEqual(library["counts"]["notes"], 1)  # Papers, not note records.
        row = next(row for row in library["items"] if row["id"] == self.paper["id"])
        self.assertEqual((row["notes_count"], row["annotations_count"]), (2, 1))


if __name__ == "__main__":
    unittest.main()
