"""Explicit metadata adoption is previewed, field-limited and protected against concurrent edits."""
from pathlib import Path
import tempfile
import unittest
import httpx
from backend.library_mvp.api import create_app
from backend.library_mvp.tests.test_pdf_identity import paper
from backend.library_mvp.pdf_title_tex import normalize_title, prefer_clean_title


class TexTitleTests(unittest.TestCase):
    def test_greek_scripts_formatting_and_literal_fallback(self):
        cases = {
            r"$\pi_0$: A \textbf{Vision-Language} Model": "π₀: A Vision-Language Model",
            r"$x^2 + x_{12} + y_{abc} + z^{cat}$": "x² + x₁₂ + yₐbc + zcat",
            r"\textbf{A \emph{nested} title} and $\Delta \times \alpha$": "A nested title and Δ × α",
            r"A\&B and x\_0": "A&B and x_0",
            "An ordinary title": "An ordinary title",
        }
        for source, expected in cases.items():
            self.assertEqual(normalize_title(source), expected)

    def test_similar_first_page_is_used_only_if_cleaner_and_confident(self):
        self.assertEqual(
            prefer_clean_title(r"A scientific method{for} robots", "A scientific method for robots", 0.95),
            "A scientific method for robots",
        )
        self.assertEqual(
            prefer_clean_title(r"$\pi_0$: A Robot Model", "π0: A Robot Model", 0.95), "π₀: A Robot Model"
        )
        self.assertEqual(
            prefer_clean_title("A distinct metadata title", "A different paper title", 0.95),
            "A distinct metadata title",
        )
        self.assertEqual(
            prefer_clean_title("A scientific method{for} robots", "A scientific method for robots", 0.4),
            "A scientific method{for} robots",
        )


class MetadataApplyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.temp.name))
        self.store = self.app.state.store
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://localhost")

    async def asyncTearDown(self):
        await self.client.aclose()
        self.store.close()
        self.temp.cleanup()

    def legacy_item(self):
        item = self.store.add_pdf(paper(), filename="2406.09246.pdf")["item"]
        self.store.update_item(
            item["id"],
            {"title": "2406.09246", "authors": ["Anonymous Submission"], "date": "", "doi": "", "url": ""},
        )
        self.app.state.workbench.update_state(item["id"], {"venue": ""})
        return item["id"], "/api/research/workbench/items/" + item["id"] + "/pdf-metadata"

    async def test_all_six_fields_are_previewed_then_atomically_applied(self):
        identity, url = self.legacy_item()
        before = self.store.get_item(identity)
        suggestion = (await self.client.get(url)).json()
        self.assertEqual(self.store.get_item(identity), before)
        self.assertEqual(
            {c["field"] for c in suggestion["changes"]}, {"title", "authors", "doi", "url", "date", "venue"}
        )
        applied = await self.client.post(url, json={"token": suggestion["token"]})
        self.assertEqual(applied.status_code, 200)
        for field, expected in {
            "title": "Reliable Local Metadata for Scientific Papers",
            "authors": ["Alice Example", "Bob Researcher"],
            "date": "2024",
            "doi": "10.48550/arXiv.2406.09246",
            "url": "https://arxiv.org/abs/2406.09246",
        }.items():
            self.assertEqual(applied.json()[field], expected)
        self.assertEqual(self.app.state.workbench.row(identity)["venue"], "arXiv")
        self.assertFalse((await self.client.get(url)).json()["eligible"])

    async def test_every_user_field_is_protected_against_stale_suggestions(self):
        for field, value in {
            "title": "My title",
            "authors": ["My Author"],
            "date": "2019",
            "doi": "10.1234/manual",
            "url": "https://example.test/paper",
            "venue": "My Journal",
        }.items():
            with self.subTest(field=field):
                identity, url = self.legacy_item()
                suggestion = (await self.client.get(url)).json()
                if field == "venue":
                    self.app.state.workbench.update_state(identity, {field: value})
                else:
                    self.store.update_item(identity, {field: value})
                before = self.store.get_item(identity)
                rejected = await self.client.post(url, json={"token": suggestion["token"]})
                self.assertEqual(rejected.status_code, 409)
                self.assertEqual(self.store.get_item(identity), before)
                self.assertEqual(self.app.state.workbench.row(identity)[field], value)

    async def test_missing_fields_only_and_mixed_real_authors_are_not_replaced(self):
        identity, url = self.legacy_item()
        self.store.update_item(
            identity,
            {"title": "My title", "authors": ["Real Author", "Unknown"], "doi": "10.1234/manual", "date": "2018"},
        )
        self.app.state.workbench.update_state(identity, {"venue": "My Journal"})
        suggestion = (await self.client.get(url)).json()
        self.assertEqual([c["field"] for c in suggestion["changes"]], ["url"])
        self.assertEqual((await self.client.post(url, json={"token": suggestion["token"]})).status_code, 200)
        row = self.app.state.workbench.row(identity)
        self.assertEqual(row["title"], "My title")
        self.assertEqual(row["authors"], ["Real Author", "Unknown"])
        self.assertEqual(row["doi"], "10.1234/manual")
        self.assertEqual(row["date"], "2018")
        self.assertEqual(row["venue"], "My Journal")
