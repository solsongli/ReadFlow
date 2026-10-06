"""Underline/strike detection and strict counterexamples; pure local PDFs without Typst."""
from collections import Counter
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
import pymupdf as fitz
from backend.library_mvp.layout_decorations import plan_decorations, erase_decorations, drawing_signature
from backend.library_mvp.layout_geometry import native_lines
from backend.library_mvp.paper_blocks_layout import render_layout
from backend.library_mvp.paper_blocks_model import cache_key


def page_fixture(pdf):
    page = pdf.new_page(width=600, height=800)
    page.insert_text((40, 100), "Original scientific evidence and reliable methods.", fontsize=11)
    box = list(page.search_for("Original scientific evidence and reliable methods.")[0])
    records = [
        {
            "id": "body",
            "type": "heading",
            "status": "placed",
            "label": False,
            "bbox": box,
            "redactions": [box],
        }
    ]
    return page, records


class DecorationDetection(unittest.TestCase):
    def test_partial_underlines_strikes_and_filled_thin_bars_are_removed_without_text_loss(self):
        with fitz.open() as pdf:
            page, records = page_fixture(pdf)
            page.draw_line((65, 101.5), (90, 101.5), width=0.4)
            page.draw_line((115, 95.7), (145, 95.7), width=0.4)
            page.draw_rect(fitz.Rect(165, 101, 190, 101.7), color=None, fill=(0, 0, 0), width=0)
            candidates = plan_decorations(page, native_lines(page), records, [], [], [])
            self.assertEqual(len(candidates), 3)
            page, removed = erase_decorations(page, candidates)
            self.assertEqual(len(removed), 3)
            self.assertEqual(len(page.get_drawings()), 0)
            self.assertIn("Original scientific evidence", page.get_text())

    def test_fraction_in_math_font_and_normal_font_is_not_a_decoration(self):
        for math_font in (False, True):
            with self.subTest(math_font=math_font), fitz.open() as pdf:
                page, records = page_fixture(pdf)
                font = "symb" if math_font else "helv"
                page.insert_text((95, 94), "a", fontname=font, fontsize=10)
                page.insert_text((95, 116), "b", fontname=font, fontsize=10)
                page.draw_line((89, 100.5), (110, 100.5), width=0.4)
                self.assertEqual(plan_decorations(page, native_lines(page), records, [], [], []), [])

    def test_table_axes_formula_header_footer_and_image_areas_are_protected(self):
        for kind in ("table", "figure", "formula", "header", "footer", "algorithm", "code"):
            with self.subTest(kind=kind), fitz.open() as pdf:
                page, records = page_fixture(pdf)
                page.draw_line((65, 101.5), (90, 101.5), width=0.4)
                regions = [{"type": kind, "bbox": [35, 75, 350, 135]}]
                self.assertEqual(plan_decorations(page, native_lines(page), records, regions, [], []), [])
        with fitz.open() as pdf:
            page, records = page_fixture(pdf)
            page.draw_line((65, 101.5), (90, 101.5), width=0.4)
            for tables, images in (([fitz.Rect(35, 75, 350, 135)], []), ([], [fitz.Rect(35, 75, 350, 135)])):
                self.assertEqual(plan_decorations(page, native_lines(page), records, [], tables, images), [])

    def test_boxes_separators_outside_text_and_thick_paths_are_not_decorations(self):
        with fitz.open() as pdf:
            page, records = page_fixture(pdf)
            page.draw_rect(fitz.Rect(35, 78, 350, 130), width=0.4)
            page.draw_line((20, 101.5), (450, 101.5), width=0.4)  # Extends outside the text line.
            page.draw_line((60, 101.5), (95, 101.5), width=2)  # Thick graphic.
            page.draw_line((40, 155), (300, 155), width=0.4)  # Paragraph separator.
            self.assertEqual(plan_decorations(page, native_lines(page), records, [], [], []), [])

    def test_adjacent_tiny_graphics_are_not_deleted_by_the_stroke_envelope(self):
        with fitz.open() as pdf:
            page, records = page_fixture(pdf)
            page.draw_line((65, 101.5), (90, 101.5), width=0.4)
            page.draw_line((77, 101), (77, 102), width=0.4)
            self.assertEqual(plan_decorations(page, native_lines(page), records, [], [], []), [])

    def test_trial_is_discarded_if_redaction_would_remove_an_unrelated_path(self):
        with fitz.open() as pdf:
            page, records = page_fixture(pdf)
            page.draw_line((65, 101.5), (90, 101.5), width=0.4)
            page.draw_line((300, 300), (450, 300), width=0.4)
            expected = Counter(drawing_signature(d) for d in page.get_drawings())
            candidates = plan_decorations(page, native_lines(page), records, [], [], [])
            original = fitz.Page.apply_redactions

            def corrupt_trial(target, **kwargs):
                target.add_redact_annot(fitz.Rect(290, 290, 460, 310), fill=None)
                return original(target, **kwargs)

            with patch.object(fitz.Page, "apply_redactions", corrupt_trial):
                page, removed = erase_decorations(page, candidates)
            self.assertEqual(removed, [])
            self.assertEqual(Counter(drawing_signature(d) for d in page.get_drawings()), expected)

    def test_renderer_removes_only_decoration_and_records_type_and_incremental_counts(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source.pdf"
            with fitz.open() as pdf:
                page, _ = page_fixture(pdf)
                page.draw_line((65, 101.5), (90, 101.5), width=0.4)
                page.draw_line((20, 165), (450, 165), width=0.4)
                page.add_underline_annot(page.search_for("evidence"))  # Original user annotation survives.
                pdf.save(source)
            block = {
                "id": "body",
                "type": "heading",
                "page": 1,
                "size": 11,
                "text": "Original scientific evidence and reliable methods.",
                "anchors": [{"page": 1, "bbox": [40, 85, 350, 125]}],
            }
            document, cache = {"blocks": [block]}, {
                cache_key(block, "zh-CN", "fake"): {"text": "New heading"}
            }
            with patch(
                "backend.library_mvp.paper_blocks_layout.prepare_fonts", return_value=(None, "", root)
            ):
                result = render_layout(source, root, document, cache, "zh-CN", "fake")
                reused = render_layout(source, root, document, cache, "zh-CN", "fake")
            self.assertEqual(result["decorations_removed"], 1)
            self.assertEqual(result["decorations_removed_by_type"], {"heading": 1})
            self.assertEqual(reused["decorations_removed_by_type"], {"heading": 1})
            with fitz.open(root / "translated-layout.pdf") as pdf:
                # The two user-annotation underline strokes are intentionally untouched.
                self.assertTrue(any(abs(d["rect"].y0 - 165) < 0.1 for d in pdf[0].get_drawings()))
                self.assertEqual([a.type[0] for a in pdf[0].annots()], [fitz.PDF_ANNOT_UNDERLINE])
