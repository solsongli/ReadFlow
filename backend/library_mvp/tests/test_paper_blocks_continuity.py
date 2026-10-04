"""Geometry-based continuity rules; no model, frontend or corpus-specific strings."""
import unittest
from types import SimpleNamespace
import pymupdf
from backend.library_mvp.paper_blocks_lines import lines
from backend.library_mvp.paper_blocks_paragraphs import join_paragraphs, continuation
from backend.library_mvp.paper_blocks_typography import heading_evidence


def block(text, page, box, **extra):
    return {
        "type": "text",
        "text": text,
        "bbox": box,
        "anchors": [{"page": page, "bbox": box}],
        "source_lines": [{"text": text, "bbox": box}],
        "math_parts": [],
        **extra,
    }


class ContinuityTests(unittest.TestCase):
    def test_hanging_indent_carried_to_next_column_is_not_a_new_paragraph(self):
        a = block("The indented list allows", 1, [60, 600, 270, 730])
        a["source_lines"][-1]["indent_offset"] = 20
        b = block("continued reading.", 1, [330, 50, 550, 100], first_indent=True, indent_offset=20, size=10)
        self.assertTrue(continuation(a, b))
        b["indent_offset"] = 32
        self.assertFalse(continuation(a, b))

    def test_hyphen_forces_join_despite_indent_spacing_and_font_switch(self):
        a = block("A longer para- ", 1, [40, 700, 280, 730])
        # PDF line text is trimmed before the flow pass.
        a["text"] = a["text"].strip()
        b = block("graph continues.", 2, [55, 100, 280, 120], first_indent=True, paragraph_gap=True)
        self.assertTrue(continuation(a, b))
        merged = join_paragraphs([a, b], {"plain": {"paragraph": 2}, "hyphen": {}})
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["text"], "A longer paragraph continues.")
        self.assertEqual(merged[0]["anchors"][1]["continuation_reason"], "hyphen")

    def test_floating_region_is_after_whole_sentence_and_does_not_swallow_new_paragraph(self):
        a = block("The method depends on", 1, [40, 600, 270, 730])
        figure = {"type": "figure", "text": "", "bbox": [40, 40, 270, 250]}
        caption = {"type": "caption", "text": "Figure 1. Synthetic evidence."}
        b = block("reproducible evidence.", 2, [40, 300, 270, 340], paragraph_gap=True)
        c = block("A new paragraph.", 2, [50, 360, 270, 400], first_indent=True)
        rows = join_paragraphs([a, figure, caption, b, c], None)
        self.assertEqual([r["type"] for r in rows], ["text", "figure", "caption", "text"])
        self.assertEqual(rows[0]["text"], "The method depends on reproducible evidence.")
        self.assertEqual(rows[-1]["text"], "A new paragraph.")

    def test_wide_justification_gaps_do_not_split_a_line_or_mix_columns(self):
        def span(text, x, width, font="Body-Regular"):
            return {
                "text": text,
                "bbox": [x, 100, x + width, 110],
                "origin": [x, 108],
                "size": 10,
                "font": font,
                "flags": 0,
            }

        left = {
            "type": 0,
            "bbox": [40, 100, 270, 110],
            "lines": [{"dir": [1, 0], "spans": [span("Left column", 40, 230)]}],
        }
        right = {
            "type": 0,
            "bbox": [310, 100, 550, 110],
            "lines": [
                {"dir": [1, 0], "spans": [span("A phrase", 310, 50)]},
                {"dir": [1, 0], "spans": [span("of", 400, 10)]},
                {"dir": [1, 0], "spans": [span("evidence", 460, 90, "Body-Italic")]},
            ],
        }
        page = SimpleNamespace(
            rect=pymupdf.Rect(0, 0, 600, 800), get_text=lambda *args, **kwargs: {"blocks": [left, right]}
        )
        rows = lines(page)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1]["text"], "A phrase of evidence")

    def test_weight_change_without_following_gap_is_not_a_heading(self):
        base = {
            "bbox": [40, 100, 220, 110],
            "size": 10,
            "bold": True,
            "text": "Run-in title",
            "type": "text",
            "sideways": False,
        }
        after = {**base, "bbox": [40, 113, 270, 123], "bold": False, "text": "A normal prose continuation."}
        self.assertIsNone(heading_evidence(base, [base, after], 3))
        after["bbox"] = [40, 123, 270, 133]
        self.assertTrue(heading_evidence(base, [base, after], 3)["weight_change"])
