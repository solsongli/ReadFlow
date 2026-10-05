"""Generic regressions for run-in font changes, plot plates and caption ownership."""
import unittest
import pymupdf as fitz
from backend.library_mvp.paper_blocks_typography import prose_font, continuous_lines
from backend.library_mvp.paper_blocks_plates import consolidate_plate
from backend.library_mvp.paper_blocks_model import CAPTION
from backend.library_mvp.document_caption_links import region_caption, bounded_evidence


class FragmentTests(unittest.TestCase):
    def test_run_in_bold_uses_last_prose_font_not_first_word(self):
        a = {
            "size": 10,
            "font": "BoldHeading",
            "source_lines": [{"size": 10, "font": "BoldHeading", "end_font": "ABCDEF+Body-Regular"}],
        }
        b = {"size": 10, "font": "GHIJKL+Body-Regular"}
        self.assertTrue(prose_font(a, b))
        self.assertFalse(prose_font(a, {**b, "size": 14}))
        self.assertFalse(prose_font(a, {**b, "font": "UnrelatedFont"}))

    def test_superscript_bbox_uses_regular_baseline_to_join(self):
        a = {"size": 10, "bbox": [20, 90, 200, 99], "baseline": 100}
        b = {"size": 10, "bbox": [20, 105, 200, 115], "baseline": 112}
        self.assertTrue(continuous_lines(a, b, 3))
        self.assertFalse(continuous_lines(a, {**b, "bbox": [20, 130, 200, 140], "baseline": 140}, 3))

    def test_plural_citations_are_not_new_captions(self):
        for text in ("Figs. 6–8, Supplementary Video 2", "Figures 3 and 4 demonstrate"):
            self.assertIsNone(CAPTION.match(text))
        for text in ("Fig. S4.", "Figure 12. Evidence", "TABLE IV: Results"):
            self.assertIsNotNone(CAPTION.match(text))

    def test_figure_below_and_table_above_outweigh_previous_caption(self):
        rows = [
            {"type": "caption", "text": "Table 1", "bbox": [40, 80, 250, 110]},
            {"type": "caption", "text": "Figure 2", "bbox": [40, 230, 250, 260]},
        ]
        region = {"type": "figure", "bbox": [40, 105, 250, 215]}
        self.assertIs(region_caption(region, rows), rows[1])
        self.assertIs(region_caption({**region, "type": "table"}, rows), rows[0])
        self.assertIsNone(region_caption({**region, "bbox": [300, 105, 550, 215]}, rows))

    def test_separate_captioned_columns_do_not_union_into_one_figure(self):
        rows = [
            {"type": "caption", "bbox": [40, 230, 250, 260]},
            {"type": "caption", "bbox": [300, 230, 550, 260]},
        ]
        regions = [
            {"type": "figure", "bbox": [40, 100, 250, 215], "confidence": 0.9},
            {"type": "figure", "bbox": [300, 100, 550, 215], "confidence": 0.9},
        ]
        result = bounded_evidence({"bbox": [40, 100, 550, 215]}, regions[0], regions, rows, rows[0])
        self.assertEqual(list(result), regions[0]["bbox"])

    def test_plot_plate_retains_ticks_but_never_absorbs_prose(self):
        with fitz.open() as pdf:
            page = pdf.new_page(width=600, height=800)
            images = [
                {"type": "figure", "bbox": [40, 100, 280, 550]},
                {"type": "figure", "bbox": [320, 100, 560, 550]},
            ]
            rows = [
                {"type": "text", "text": str(i), "bbox": [42, 105 + i * 18, 90, 115 + i * 18]} for i in range(22)
            ]
            rows.append({"type": "caption", "text": "Figure 1: A plot plate", "bbox": [40, 570, 560, 590]})
            result = consolidate_plate(page, rows, images)
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["source"], "plot_plate")
            self.assertEqual(result[0]["caption_text"], rows[-1]["text"])
            prose = {
                "type": "text",
                "text": "This is a long genuine paragraph that must stay in the text flow for translation.",
                "bbox": [40, 300, 560, 320],
            }
            self.assertEqual(consolidate_plate(page, rows + [prose], images), images)
