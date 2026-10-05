import unittest
from pathlib import Path
import tempfile
from backend.library_mvp.paper_blocks_text import text_blocks
from backend.library_mvp.paper_blocks_equations import equation_parts
from backend.library_mvp.paper_blocks_math import classify_display_math
from backend.library_mvp.paper_blocks_inline import span_content, line_math_parts, source_runs
from backend.library_mvp.paper_blocks_model import MATH_FONT, protected_ranges, joined
from backend.library_mvp.paper_blocks_extract import extract
from backend.library_mvp.tests.block_math_assertions import broken_paragraphs


def row(text, y, *, x=40, width=240, baseline=None, math=0, size=10, font="Fixture-Regular", **extra):
    return {
        "text": text,
        "bbox": [x, y, x + width, y + size],
        "baseline": baseline or y + 8,
        "size": size,
        "font": font,
        "bold": False,
        "type": "text",
        "sideways": False,
        "math_ratio": math,
        "math_parts": [],
        **extra,
    }


class MathematicalParagraphTests(unittest.TestCase):
    def test_equation_numbers_stay_in_their_column(self):
        rows = []
        for x, number in [(40, "1"), (330, "2")]:
            rows += [
                row("Ordinary prose establishes the extent of this column.", 40, x=x, width=230),
                row("A distinct explanation follows the independent equation.", 170, x=x, width=230),
                row("x + y = z", 100, x=x + 90, width=90, math=0.9),
                row(f"({number})", 100, x=x + 220, width=10),
            ]
        formulas = [b for b in equation_parts(text_blocks(rows, 10, 2, 600, 800), None) if b["type"] == "formula"]
        self.assertEqual(len(formulas), 2)
        left, right = sorted(formulas, key=lambda b: b["bbox"][0])
        self.assertIn("(1)", left["text"])
        self.assertNotIn("(2)", left["text"])
        self.assertIn("(2)", right["text"])
        self.assertLess(left["bbox"][2], 300)

    def test_owned_mathematical_pdf_preserves_paragraphs_and_independent_formulas(self):
        fixture = Path(__file__).resolve().parents[3] / "frontend/web/tests/fixtures/blocks/math-paper.pdf"
        with tempfile.TemporaryDirectory() as directory:
            doc = extract(fixture, Path(directory), "math-fixture", enrich=False)
        self.assertEqual(broken_paragraphs(doc["blocks"]), [])
        formulas = [b for b in doc["blocks"] if b["type"] == "formula"]
        self.assertGreaterEqual(len(formulas), 2)
        self.assertTrue(all(len(b["text"].strip()) > 1 for b in formulas))
        paragraph = next(b for b in doc["blocks"] if b["text"].startswith("The observation history"))
        self.assertEqual(paragraph["type"], "text")
        self.assertIn("continuous paragraph.", paragraph["text"])
        self.assertTrue(
            any(run["kind"] == "sub" for part in paragraph["protected"] for run in part.get("runs", []))
        )

    def test_overlapping_inline_boxes_follow_baseline_and_keep_prose_as_text(self):
        rows = [
            row("A sentence describes the full observation history", 40),
            row("observation history h = (a, b, c) maps to an action where H > 1 is", 48, baseline=59, math=0.62),
            row("the temporal horizon for subsequent observations.", 60, baseline=70),
        ]
        rows[1]["bbox"][3] = 64
        blocks = text_blocks(rows, 10, 2, 320, 400)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["type"], "text")
        self.assertEqual(len(blocks[0]["source_lines"]), 3)

    def test_inline_math_font_switch_does_not_break_a_paragraph(self):
        rows = [
            row("A mathematical condition continues with", 40),
            row("x+y=z", 48, baseline=59, math=1, font="CMMI10"),
            row("the rest of this paragraph.", 60, baseline=70),
        ]
        rows[1]["bbox"][3] = 62
        self.assertEqual(len(text_blocks(rows, 10, 2, 320, 400)), 1)

    def test_display_needs_position_and_spacing_not_only_math_font_ratio(self):
        inline = row("possible trajectories (s0, a0, st) of length t.", 100, math=0.7)
        formula = row("x + y = z (2)", 145, x=100, width=180, math=0.65)
        rows = [
            row("This surrounding prose introduces an independent equation.", 80),
            inline,
            formula,
            row("where the result is explained in ordinary prose.", 180),
        ]
        classify_display_math(rows, 10, 320)
        self.assertNotIn("display_group", inline)
        self.assertIn("display_group", formula)
        self.assertTrue(formula["display_evidence"]["numbered"])

    def test_scripts_and_number_become_one_display_region(self):
        rows = [
            row("Formally we aim to solve", 80, width=105),
            row("*", 105, x=154, width=4, math=1, size=7, math_parts=[{"text": "*"}]),
            row("p = arg max f(p) (2)", 111, x=145, width=135, math=0.45),
            row("The following independent paragraph remains distinct.", 145),
        ]
        blocks = equation_parts(text_blocks(rows, 10, 2, 320, 400), None)
        formulas = [b for b in blocks if b["type"] == "formula"]
        self.assertEqual(len(formulas), 1)
        self.assertIn("*", formulas[0]["text"])
        self.assertIn("(2)", formulas[0]["text"])
        self.assertGreater(len(formulas[0]["text"].strip()), 1)

    def test_math_offsets_do_not_match_letters_inside_ordinary_words(self):
        def span(text, x, font="Body", size=10, y=100):
            return {
                "text": text,
                "bbox": [x, y - 8, x + len(text) * 5, y + 2],
                "size": size,
                "origin": [x, y],
                "font": font,
                "flags": 0,
            }

        text, parts = span_content(
            [span("investigation ", 0), span("t", 70, "CMMI10"), span("i", 75, "CMMI7", 7, 102)], 10, MATH_FONT
        )
        source = [{"text": "Prior line of ordinary prose", "math_parts": []}, {"text": text, "math_parts": parts}]
        full = joined(source[0]["text"], text)
        protected = protected_ranges(full, line_math_parts(source, full, joined))
        self.assertEqual(len(protected), 1)
        self.assertGreater(protected[0]["start"], full.index("investigation") + len("investigation"))
        self.assertEqual(full[protected[0]["start"] : protected[0]["end"]], "ti")
        runs = source_runs({"text": full, "protected": protected})
        self.assertIn("investigation", runs[0]["text"])
        self.assertEqual("".join(r["text"] for r in runs), full)
