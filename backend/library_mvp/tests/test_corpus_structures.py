"""Synthetic CI regressions for corpus-wide classes, independent of any paper identity."""
from pathlib import Path
import tempfile
import unittest
import pymupdf as fitz
from backend.library_mvp.paper_blocks_extract import extract
from backend.library_mvp.paper_blocks_graphics import graphics
from backend.library_mvp.paper_blocks_regions import refine_regions
from backend.library_mvp.paper_blocks_sections import classify_sections, reference_entry, canonical
from backend.library_mvp.paper_blocks_model import SKIP, REFERENCE
from backend.library_mvp.paper_blocks_labels import translation_units
from backend.library_mvp.paper_blocks_text import text_blocks
from backend.library_mvp.tests.test_paper_blocks_sections import row, line


class CorpusStructures(unittest.TestCase):
    def test_caption_continuation_without_prefix_is_not_a_new_graphic(self):
        with fitz.open() as pdf:
            page = pdf.new_page()
            caption = line("continuing the original caption", 50, 150, kind="caption")
            self.assertEqual(graphics(page, [caption]), [])

    def test_roman_and_supplementary_caption_prefixes_at_body_size(self):
        from backend.library_mvp.paper_blocks_model import CAPTION

        for text in ("TABLE II: Comparison of methods.", "TABLE IV", "Extended Data Fig. 3: Results."):
            rows = text_blocks([line(text, 50, 150)], 10, 2, 600, 800)
            self.assertEqual(rows[0]["type"], "caption")
        self.assertIsNone(CAPTION.match("Figure illustrates the method"))

    def test_reference_heading_without_typographic_proof_does_not_merge_into_prose(self):
        raw = [
            line("The preceding paragraph has no final punctuation", 50, 100),
            line("References", 50, 112),
            line("[1] Source. 2025.", 50, 140),
        ]
        values = text_blocks(raw, 10, 2, 600, 800)
        self.assertTrue(any(r["text"] == "References" for r in values))

    def test_bibliography_formats_and_small_font_continuations_stay_in_bibliography(self):
        for value in (
            "Ajay A, Du Y, Gupta A and Smith B",
            "F. Hill, S. Mokra, N. Wong, and T. Harley.",
            "(17) Author, A. Study.",
            "18. Author, A. Study.",
            "Maria Researcher. 2025. Independent evidence.",
            "1 F. Example, Journal, 2025, 1, 2-3.",
        ):
            self.assertTrue(reference_entry(value))
        self.assertTrue(REFERENCE.match("Notes and references"))
        entries = [
            row("References", "heading"),
            row("[1] Author. Evidence."),
            row("Continuation of the same citation.", "footnote"),
            row("Appendix", "heading"),
            row("Independent body prose remains translatable."),
        ]
        classify_sections(entries)
        self.assertEqual([r["type"] for r in entries], ["reference", "reference", "reference", "heading", "text"])

    def test_padding_cannot_cover_caption_and_next_paragraph(self):
        with fitz.open() as pdf:
            page = pdf.new_page()
            caption = line("Figure 1: A spanning image.", 50, 260, width=480, kind="caption")
            paragraph = line("A real paragraph below the image must remain translatable.", 50, 300, width=230)
            images = [{"type": "figure", "bbox": [50, 100, 530, 400], "text": ""}]
            result = refine_regions(page, [caption, paragraph], images, [])
            self.assertLess(result[0]["bbox"][3], caption["bbox"][1])
            self.assertEqual(result[0]["caption_bbox"], caption["bbox"])

    def test_bitmap_padding_over_abstract_is_clipped_instead_of_dropping_the_figure(self):
        with fitz.open() as pdf:
            page = pdf.new_page(width=600, height=800)
            pix = fitz.Pixmap(fitz.csRGB, (0, 0, 30, 30), False)
            pix.clear_with(160)
            page.insert_image(fitz.Rect(50, 100, 550, 500), pixmap=pix)
            caption = line("Figure 1: A photograph.", 50, 260, width=480, kind="caption")
            abstract = line("Abstract introduces the scientific contribution.", 60, 300, kind="abstract")
            images = graphics(page, [caption, abstract])
            self.assertTrue(images)
            self.assertTrue(any(r["bbox"][3] <= caption["bbox"][1] for r in images))

    def test_white_page_backing_does_not_absorb_author_or_margin_text(self):
        with fitz.open() as pdf:
            page = pdf.new_page(width=600, height=800)
            page.draw_rect((0, 100, 600, 400), fill=(1, 1, 1), color=None)
            page.draw_rect((100, 200, 300, 300), color=(0, 0, 0))
            caption = line("Figure 1: A bounded drawing.", 90, 320, width=250, kind="caption")
            images = graphics(page, [caption])
            self.assertTrue(images)
            self.assertTrue(all(r["bbox"][0] > 50 and r["bbox"][1] > 150 for r in images))

    def test_page_top_spanning_table_rules_and_table_note(self):
        with fitz.open() as pdf:
            page = pdf.new_page()
            for y in (100, 125, 175):
                page.draw_line((50, y), (545, y))
            caption = line("Table 1: A table across two columns.", 50, 70, width=260, kind="caption")
            note = line("Note: the units are normalized.", 50, 178, width=260, size=8)
            result = refine_regions(page, [caption, note], [], [])
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["type"], "table")
            self.assertGreater(result[0]["bbox"][2], 500)
            self.assertEqual(note["type"], "footnote")
            self.assertTrue(note["table_note"])
            self.assertNotIn(note["type"], SKIP)

    def test_form_padding_in_other_column_cannot_swallow_model_confirmed_prose(self):
        with fitz.open() as pdf:
            page = pdf.new_page(width=600, height=800)
            caption = line("Figure 1: A single-column plot.", 50, 260, width=230, kind="caption")
            region = {"type": "text", "bbox": [310, 80, 550, 240], "confidence": 0.95}
            images = [{"type": "figure", "bbox": [50, 60, 550, 250], "text": ""}]
            result = refine_regions(page, [caption], images, [region])
            self.assertLess(result[0]["bbox"][2], 310)

    def test_short_boxed_definition_with_math_remains_translatable(self):
        with fitz.open() as pdf:
            page = pdf.new_page()
            definition = line("Definition 1. x = y", 50, 100, width=240, kind="formula")
            image = {"type": "figure", "bbox": [45, 90, 300, 160], "text": ""}
            self.assertEqual(refine_regions(page, [definition], [image], []), [])
            self.assertEqual(definition["type"], "text")
            self.assertTrue(definition["inline_math"])

    def test_nearby_axis_words_join_figure_but_same_size_prose_does_not(self):
        from backend.library_mvp.paper_blocks_special import include_small_figure_labels

        image = {"type": "figure", "bbox": [100, 100, 200, 200], "caption_bbox": [80, 230, 240, 250]}
        label = line("Accuracy (%)", 80, 180, width=35, size=9)
        prose = line("Ordinary prose", 70, 90, width=150, size=10)
        include_small_figure_labels([label, prose], [image], 10)
        self.assertEqual(image["bbox"][0], 80)
        self.assertEqual(image["bbox"][1], 100)

    def test_algorithm_code_and_boxed_theorem_have_distinct_ownership(self):
        with tempfile.TemporaryDirectory() as temp, fitz.open() as pdf:
            root = Path(temp)
            page = pdf.new_page()
            page.draw_rect((45, 90, 545, 225))
            page.insert_text((50, 110), "Algorithm 1 General planning procedure", fontname="hebo", fontsize=11)
            for i, text in enumerate(
                (
                    "Require: observations and a horizon",
                    "1: for each observation do",
                    "2: update the estimate",
                    "3: return the estimate",
                )
            ):
                page.insert_text((55, 135 + i * 20), text, fontsize=10)
            for i, text in enumerate(("def evaluate(input):", "    result = model(input)", "    return result")):
                page.insert_text((50, 270 + i * 16), text, fontname="cour", fontsize=10)
            page.draw_rect((45, 390, 545, 490))
            page.insert_text(
                (50, 410),
                "Theorem 1. A bounded estimate remains stable under the following assumptions.",
                fontsize=10,
            )
            page.insert_text(
                (50, 430),
                "The independent native prose provides the proof and remains available for translation.",
                fontsize=10,
            )
            page.insert_text(
                (50, 450),
                "This statement is a mathematical environment rather than a pseudocode listing.",
                fontsize=10,
            )
            source = root / "synthetic.pdf"
            pdf.save(source)
            document = extract(source, root, "fixture", enrich=False)
            programs = [b for b in document["blocks"] if b["type"] in {"algorithm", "code"}]
            self.assertEqual({b["type"] for b in programs}, {"algorithm", "code"})
            for program in programs:
                self.assertTrue((root / program["asset"]).is_file())
                self.assertFalse(any(r.get("translatable") for r in program["figure_text"]))
                with fitz.open(root / program["asset"]) as crop:
                    self.assertTrue("Algorithm" in crop[0].get_text() or "def evaluate" in crop[0].get_text())
            values = [b["text"] for b in translation_units(document["blocks"]) if b["type"] not in SKIP]
            self.assertTrue(any("Theorem" in value for value in values))
            self.assertFalse(any("Require:" in value or "def evaluate" in value for value in values))

    def test_outline_roman_prefix_and_inline_heading_preserve_following_text(self):
        self.assertEqual(canonical("IV-A Modeling human data"), canonical("A. Modeling human data"))
        with tempfile.TemporaryDirectory() as temp, fitz.open() as pdf:
            root = Path(temp)
            page = pdf.new_page()
            page.insert_text(
                (50, 100), "A. Experiments. Following prose must remain in a normal paragraph.", fontsize=10
            )
            pdf.set_toc([[1, "IV-A Experiments", 1]])
            source = root / "outline.pdf"
            pdf.save(source)
            document = extract(source, root, "fixture", enrich=False)
            heading = next(b for b in document["blocks"] if b.get("outline_title"))
            self.assertEqual(heading["type"], "heading")
            self.assertNotIn("Following", heading["text"])
            self.assertTrue(
                any(b["type"] == "text" and "Following prose" in b["text"] for b in document["blocks"])
            )

    def test_sideways_arxiv_mark_is_not_sent_to_translation(self):
        with tempfile.TemporaryDirectory() as temp, fitz.open() as pdf:
            root = Path(temp)
            page = pdf.new_page()
            page.insert_text((25, 650), "arXiv:0000.00000v1 [cs.RO] 1 Jan 2026", rotate=90, fontsize=10)
            page.insert_text(
                (60, 100), "Independent native text is retained as normal readable content.", fontsize=10
            )
            source = root / "watermark.pdf"
            pdf.save(source)
            document = extract(source, root, "fixture", enrich=False)
            mark = next(b for b in document["blocks"] if "arXiv:" in b["text"])
            self.assertIn(mark["type"], {"header", "footer"})

    def test_newly_classified_reference_ignores_old_prose_translation_cache(self):
        import io
        import json
        import zipfile
        from backend.library_mvp.paper_blocks_model import cache_key
        from backend.library_mvp.paper_blocks_render import render, latex_zip, runtime_paths

        try:
            runtime_paths()
        except Exception:
            self.skipTest("Bundled Typst absent; source-only CI does not render PDFs")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            block = {"id": "fixture", "type": "reference", "text": "[1] Original bibliography. 2025."}
            document = {"blocks": [block]}
            cache = {cache_key(block, "zh-CN", "fixture"): "obsolete incorrectly translated reference"}
            render(root, document, cache, "zh-CN", "fixture")
            data = json.loads((root / "render-data.json").read_text())
            self.assertEqual(data["blocks"][0]["text"], block["text"])
            with zipfile.ZipFile(io.BytesIO(latex_zip(root, document, cache, "zh-CN", "fixture"))) as archive:
                self.assertNotIn(b"obsolete", archive.read("main.tex"))
