"""Offline identifier, placeholder and first-page import contracts; synthetic data only."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import pymupdf as fitz
import httpx
from backend.library_mvp.store import Store
from backend.library_mvp.api import create_app
from backend.library_mvp.pdf_identity import arxiv_identity, filename_title, placeholder_author
from backend.library_mvp.pdf_metadata import pdf_metadata, suggest_pdf_metadata


def paper(metadata=None, clear=False):
    with fitz.open() as pdf:
        page = pdf.new_page()
        page.insert_text((50, 85), "Reliable Local Metadata", fontsize=20, fontname="hebo")
        page.insert_text((50, 110), "for Scientific Papers", fontsize=20, fontname="hebo")
        page.insert_text((70, 140), "Alice Example; Bob Researcher", fontsize=11)
        page.insert_text((70, 156), "Example University", fontsize=10)
        page.insert_text((50, 190), "Abstract", fontsize=12, fontname="hebo")
        for index in range(6):
            page.insert_text(
                (50, 215 + index * 14),
                "We evaluate a sufficiently detailed scientific method with reproducible evidence.",
                fontsize=10,
            )
        page.insert_text((20, 680), "arXiv:2406.09246v3 [cs.RO] 5 Sep 2024", rotate=90, fontsize=9)
        pdf.set_metadata(metadata or {})
        return pdf.tobytes()


class PdfIdentityTests(unittest.TestCase):
    def test_author_placeholders_are_not_people(self):
        for value in (
            "Anonymous",
            "Anonymous Submission",
            "Author",
            "Authors",
            "Unknown",
            "Submission",
            "Paper ID",
            "Paper ID 421",
            "Blind Review",
            "Double-Blind Submission",
        ):
            self.assertTrue(placeholder_author(value), value)
            self.assertEqual(pdf_metadata({"author": value})["authors"], [])
        self.assertFalse(placeholder_author("Alice Authorname"))

    def test_identifiers_versions_dates_and_ambiguity(self):
        result = arxiv_identity("2406.09246v3.pdf", "arXiv:2406.09246v3 [cs.RO] 5 Sep 2025")
        self.assertEqual(result["id"], "2406.09246")
        self.assertEqual(result["date"], "2024")
        self.assertEqual(result["date_source"], "identifier")
        self.assertEqual(arxiv_identity("1706.03762v7.pdf", "arXiv:1706.03762v7 2 Aug 2023")["date"], "2017")
        self.assertEqual(arxiv_identity("2410.24164v4.pdf", "arXiv:2410.24164v4 8 Jan 2026")["date"], "2024")
        self.assertEqual(result["doi"], "10.48550/arXiv.2406.09246")
        self.assertEqual(arxiv_identity("1706.03762.pdf", "")["date"], "2017")
        self.assertEqual(arxiv_identity("renamed.pdf", "arXiv:hep-th/9901001v2 1 Feb 1999")["date"], "1999")
        self.assertIsNone(arxiv_identity("2413.12345.pdf", ""))
        self.assertEqual(arxiv_identity("renamed.pdf", "https://arxiv.org/abs/2406.09246v3")["id"], "2406.09246")
        self.assertEqual(arxiv_identity("renamed.pdf", "10.48550/arXiv.2406.09246")["id"], "2406.09246")
        self.assertIsNone(arxiv_identity("unknown.pdf", "arXiv:2406.09246 arXiv:2303.04137"))

    def test_filename_and_doi_titles_are_candidates_but_human_titles_are_not(self):
        for title in ("2406.09246", "paper.pdf", "Untitled", "10.48550/arXiv.2406.09246", "local_document"):
            self.assertTrue(filename_title(title, "local_document.pdf"))
        self.assertFalse(filename_title("A careful human title", "2406.09246.pdf"))

    def test_first_page_import_populates_identity_without_ocr_or_full_extraction(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = Store(Path(temporary))
            try:
                with patch(
                    "backend.library_mvp.paper_blocks_extract.extract",
                    side_effect=AssertionError("Full extraction forbidden"),
                ):
                    result = store.add_pdf(paper({"author": "Anonymous Submission"}), filename="2406.09246.pdf")
                item = result["item"]
                self.assertEqual(item["title"], "Reliable Local Metadata for Scientific Papers")
                self.assertEqual(item["authors"], ["Alice Example", "Bob Researcher"])
                self.assertEqual(item["doi"], "10.48550/arXiv.2406.09246")
                self.assertEqual(item["url"], "https://arxiv.org/abs/2406.09246")
                self.assertEqual(item["date"], "2024")
            finally:
                store.close()

    def test_existing_metadata_and_attached_item_fields_are_never_overwritten(self):
        with fitz.open(
            stream=paper({"title": "A meaningful metadata title", "author": "Carol Writer"}), filetype="pdf"
        ) as pdf:
            result = suggest_pdf_metadata(pdf, "download.pdf")
            self.assertEqual(result["fields"]["title"], "A meaningful metadata title")
            self.assertEqual(result["fields"]["authors"], ["Carol Writer"])
        with tempfile.TemporaryDirectory() as temporary:
            store = Store(Path(temporary))
            try:
                original = store.create_item(
                    {
                        "title": "User title",
                        "authors": ["User Name"],
                        "date": "2020",
                        "doi": "10.1234/user",
                        "url": "https://example.test/paper",
                    }
                )
                item = store.add_pdf(paper(), filename="2406.09246.pdf", item_id=original["id"])["item"]
                for key in ("title", "authors", "date", "doi", "url"):
                    self.assertEqual(item[key], original[key])
            finally:
                store.close()

    def test_low_confidence_keeps_filename(self):
        with fitz.open() as pdf:
            page = pdf.new_page()
            page.insert_text((50, 100), "Unstructured native words.", fontsize=10)
            result = suggest_pdf_metadata(pdf, "paper.pdf")
            self.assertLess(result["title"]["confidence"], 0.85)
            self.assertEqual(result["fields"]["title"], "paper")
            self.assertEqual(result["fields"]["authors"], [])


class PdfTitleApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_proposal_is_read_only_and_apply_requires_unchanged_title(self):
        with tempfile.TemporaryDirectory() as temporary:
            app = create_app(Path(temporary))
            store = app.state.store
            item = store.add_pdf(paper(), filename="2406.09246.pdf")["item"]
            store.update_item(item["id"], {"title": "2406.09246"})
            root = "/api/research/workbench/items/" + item["id"]
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://localhost"
            ) as client:
                response = await client.get(root + "/pdf-metadata")
                self.assertTrue(response.json()["eligible"])
                self.assertEqual(store.get_item(item["id"])["title"], "2406.09246")
                changed = await client.post(root + "/pdf-title", json={"expected_title": "stale"})
                self.assertEqual(changed.status_code, 409)
                applied = await client.post(root + "/pdf-title", json={"expected_title": "2406.09246"})
                self.assertEqual(applied.status_code, 200)
                self.assertEqual(applied.json()["title"], "Reliable Local Metadata for Scientific Papers")
                self.assertFalse((await client.get(root + "/pdf-metadata")).json()["eligible"])
            store.close()
