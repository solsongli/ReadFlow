"""Local-only real-paper regression; the PDF is never copied into the repository or loaded from a profile implicitly."""
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
import pymupdf as fitz
from backend.library_mvp.paper_blocks_extract import extract
from backend.library_mvp.paper_blocks_sections import canonical
from backend.library_mvp.paper_blocks_model import SKIP, cache_key
from backend.library_mvp.paper_blocks_labels import translation_units
from backend.library_mvp.paper_blocks_translate import translate_blocks
from backend.library_mvp.paper_blocks_render import render, runtime_paths
from ops.development.readflow_fake_openai import completion_content
from backend.library_mvp.tests.block_math_assertions import broken_paragraphs


@unittest.skipUnless(
    os.environ.get("READFLOW_SAFE_VLA_PDF"), "Local SafeVLA PDF absent; synthetic appendix tests always run"
)
class SafeVlaStructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(os.environ["READFLOW_SAFE_VLA_PDF"])
        if any(p.is_symlink() for p in [path, *path.parents]):
            raise ValueError("Local paper cannot be a symlink")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != "91d8a7eeadc5841ef2328c242e9eb1197eecd9ab769c94c4bd9e2eaceaa68d13":
            raise ValueError("This regression requires the reviewed public 32-page paper")
        cls.temporary = tempfile.TemporaryDirectory(prefix="readflow-safevla-")
        cls.root = Path(cls.temporary.name)
        cls.doc = extract(path, cls.root, digest)
        cls.blocks = cls.doc["blocks"]
        with fitz.open(path) as pdf:
            cls.outline = pdf.get_toc()

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def owner(self, page, point):
        return next(
            b
            for b in self.blocks
            if b["type"] not in ("figure", "table", "header", "footer")
            and any(a["page"] == page and fitz.Rect(a["bbox"]).contains(fitz.Point(*point)) for a in b["anchors"])
        )

    def test_references_end_before_appendix_and_all_outline_entries_survive(self):
        references = [b for b in self.blocks if b["type"] == "reference"]
        self.assertTrue(references)
        self.assertLess(max(b["page"] for b in references), 18)
        appendix = [b for b in self.blocks if b["page"] >= 18]
        # X2b contained 294 physical prose lines; consolidation must retain them,
        # rather than preserve the old (fragmented) count of 91 blocks.
        self.assertGreaterEqual(sum(len(b.get("source_lines", [])) for b in appendix if b["type"] == "text"), 294)
        headings = {b.get("outline_title"): b for b in self.blocks if b.get("outline_title")}
        for level, title, page in self.outline:
            self.assertIn(title, headings)
            # Repeated headings on different pages are resolved by both page and title.
            matching = [b for b in self.blocks if b.get("outline_title") == title and b["page"] == page]
            self.assertEqual(len(matching), 1)
            self.assertEqual(matching[0]["heading_level"], level)
        boundary = self.owner(18, (140, 78))
        self.assertEqual(boundary["reference_end_reason"], "outline")

    def test_hanging_bullets_and_next_page_continuation_have_one_owner(self):
        for first, continuation in [((130, 605), (130, 615)), ((130, 525), (130, 545))]:
            item = self.owner(2, first)
            self.assertEqual(item["type"], "list")
            self.assertIs(item, self.owner(2, continuation))
        item = self.owner(2, (130, 674))
        self.assertEqual(item["type"], "list")
        self.assertIs(item, self.owner(3, (130, 80)))
        self.assertEqual({a["page"] for a in item["anchors"]}, {2, 3})

    def test_mathematical_prose_in_pages_three_and_four_remains_continuous(self):
        paragraph = self.owner(3, (130, 628))
        self.assertEqual(paragraph["type"], "text")
        self.assertIs(paragraph, self.owner(3, (130, 717)))
        for first, last in [((130, 80), (130, 180)), ((130, 403), (130, 455))]:
            block = self.owner(4, first)
            self.assertEqual(block["type"], "text")
            self.assertIs(block, self.owner(4, last))
            self.assertTrue(block["protected"])
        self.assertEqual(broken_paragraphs([b for b in self.blocks if b["page"] in (3, 4)]), [])
        self.assertFalse(any(b["type"] == "formula" and len(b["text"].strip()) == 1 for b in self.blocks))
        for block in self.blocks:
            for part in block["protected"]:
                self.assertEqual(block["text"][part["start"] : part["end"]], part["text"])
                if part.get("runs"):
                    self.assertEqual("".join(r["text"] for r in part["runs"]), part["text"])
        numbered = self.owner(4, (280, 252))
        self.assertEqual(numbered["type"], "formula")
        self.assertIn("∗", numbered["text"])
        self.assertIn("(2)", numbered["text"])
        self.assertLessEqual(numbered["bbox"][1], 241.1)

    def test_caption_font_variant_merges_and_figure_does_not_swallow_prose(self):
        caption = self.owner(2, (130, 280))
        self.assertEqual(caption["type"], "caption")
        self.assertIs(caption, self.owner(2, (130, 290)))
        self.assertGreaterEqual(len(caption["source_lines"]), 2)
        self.assertFalse(caption["text"].endswith("-"))
        figures = [b for b in self.blocks if b.get("caption_id") == caption["id"]]
        self.assertTrue(figures)
        self.assertTrue(all(b["bbox"][3] < caption["bbox"][1] for b in figures))
        self.assertEqual(self.owner(2, (130, 318))["type"], "text")
        self.assertIs(self.owner(1, (130, 670)), self.owner(2, (130, 318)))

    def test_affiliation_footnote_keeps_its_three_lines(self):
        note = self.owner(1, (130, 690))
        self.assertEqual(note["type"], "footnote")
        self.assertIs(note, self.owner(1, (130, 699)))
        self.assertIs(note, self.owner(1, (130, 709)))
        self.assertEqual(len(note["source_lines"]), 3)

    def test_appendix_axis_labels_stay_with_their_figure(self):
        plot = next(b for b in self.blocks if b["page"] == 18 and b["type"] == "figure")
        self.assertLessEqual(plot["bbox"][0], 116)
        self.assertGreaterEqual(plot["bbox"][3], 268)
        self.assertTrue(plot["figure_text"])
        self.assertFalse(
            any(b["page"] == 18 and b["type"] == "text" and b.get("size", 10) < 6 for b in self.blocks)
        )

    def test_appendix_fake_translation_and_pdf_bookmarks(self):
        appendix = [b for b in self.blocks if b["page"] >= 18]
        units = translation_units(appendix)
        cache, submitted = {}, []

        def fake(messages):
            submitted.extend(r["id"] for r in json.loads(messages[-1]["content"])["blocks"])
            return completion_content({"messages": messages})

        failures = translate_blocks(
            units, cache, "zh-CN", "fixture", fake, [], lambda: None, lambda *_: None, cache.update
        )
        expected = {b["id"] for b in units if b["type"] not in SKIP and b["text"].strip()}
        self.assertEqual(failures, [])
        self.assertEqual(set(submitted), expected)
        self.assertTrue(all(cache_key(b, "zh-CN", "fixture") in cache for b in appendix if b["type"] == "text"))
        try:
            runtime_paths()
        except Exception:
            self.skipTest("Typst unavailable; fake translation assertions passed")
        render(self.root, {"blocks": appendix}, cache, "zh-CN", "fixture", image_text=False)
        with fitz.open(self.root / "translated.pdf") as pdf:
            actual = {(level, canonical(title.removeprefix("【译】"))) for level, title, _ in pdf.get_toc()}
        for level, title, page in self.outline:
            if page >= 18:
                self.assertIn((level, canonical(title)), actual)
