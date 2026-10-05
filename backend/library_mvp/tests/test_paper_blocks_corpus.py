"""Optional public-corpus regressions. CI still exercises synthetic cases without these PDFs."""
import json
import os
import re
from pathlib import Path
import tempfile
import unittest
import pymupdf as fitz
from backend.library_mvp.document_models import DocumentModels, available
from backend.library_mvp.paper_blocks_extract import extract
from backend.library_mvp.paper_blocks_labels import translation_units
from backend.library_mvp.paper_blocks_model import SKIP
from ops.development.corpus_metrics import measure


class CorpusRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        directory = os.environ.get("READFLOW_CORPUS_DIR")
        if not directory or not Path(directory).is_dir():
            raise unittest.SkipTest(
                "Public corpus absent; set READFLOW_CORPUS_DIR (PDFs are intentionally not committed)"
            )
        if not available():
            raise unittest.SkipTest("Corpus fusion assertions require the bundled CPU layout/OCR assets")
        cls.temporary = tempfile.TemporaryDirectory(prefix="readflow-corpus-tests-")
        cls.samples = []
        models = DocumentModels()
        for source in sorted(Path(directory).glob("*.pdf")):
            if any(p.is_symlink() for p in [source, *source.parents]):
                raise ValueError("Corpus PDFs must be regular files without symlink ancestors")
            output = Path(cls.temporary.name) / source.stem
            output.mkdir()
            document = extract(source, output, source.stem, models=models)
            with fitz.open(source) as pdf:
                metrics = measure(pdf, document)
            cls.samples.append((source.stem, document, metrics))
        if not cls.samples:
            cls.temporary.cleanup()
            raise unittest.SkipTest("READFLOW_CORPUS_DIR contains no PDF files")

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_every_document_extracts_with_high_native_coverage(self):
        for name, document, metrics in self.samples:
            with self.subTest(paper=name):
                self.assertTrue(document["blocks"])
                self.assertEqual(document["capabilities"]["layout"], "PP-DocLayout-S")
                self.assertTrue(document["capabilities"]["ocr"])
                self.assertGreater(metrics["native_coverage_ratio"], 0.98)

    def test_reference_boundaries_preserve_appendix_prose(self):
        for name, _, metrics in self.samples:
            with self.subTest(paper=name):
                self.assertEqual(metrics["post_reference_untranslated_characters"], 0)

    def test_pseudocode_is_cropped_and_never_in_the_translation_queue(self):
        for name, document, metrics in self.samples:
            with self.subTest(paper=name):
                self.assertEqual(metrics["program_leak_characters"], 0)
                for block in document["blocks"]:
                    if block["type"] in {"algorithm", "code"}:
                        self.assertTrue(block.get("asset"))
                        self.assertTrue(block.get("program_evidence"))
                        self.assertFalse(any(r.get("translatable") for r in block.get("figure_text", [])))
                selected = translation_units(document["blocks"])
                self.assertFalse(
                    any(b["type"] in {"algorithm", "code"} for b in selected if b["type"] not in SKIP)
                )

    def test_abstract_paragraphs_are_not_authors(self):
        for name, _, metrics in self.samples:
            with self.subTest(paper=name):
                self.assertEqual(metrics["author_prose_characters"], 0)

    def test_graphics_do_not_absorb_model_confirmed_prose(self):
        for name, _, metrics in self.samples:
            with self.subTest(paper=name):
                self.assertEqual(metrics["cropped_prose_characters"], 0)

    def test_explicit_roman_table_titles_are_captions(self):
        for name, document, _ in self.samples:
            with self.subTest(paper=name):
                for block in document["blocks"]:
                    if re.match(r"^TABLE\s+[IVX]+[.:]", block["text"]):
                        self.assertEqual(block["type"], "caption")

    def test_caption_links_are_same_page_and_own_the_actual_caption(self):
        for name, document, _ in self.samples:
            blocks = {b["id"]: b for b in document["blocks"]}
            with self.subTest(paper=name):
                for block in document["blocks"]:
                    if not block.get("caption_id"):
                        continue
                    caption = blocks[block["caption_id"]]
                    self.assertEqual(caption["type"], "caption")
                    self.assertEqual(caption["page"], block["page"])
                    self.assertTrue(block.get("asset"))

    def test_reading_order_and_heading_fallback_without_bookmarks(self):
        for name, document, metrics in self.samples:
            with self.subTest(paper=name):
                self.assertEqual(metrics["reading_order_jumps"], 0)
                if metrics["outline_items"] == 0:
                    headings = [b for b in document["blocks"] if b["type"] == "heading"]
                    self.assertGreater(len(headings), 3)
