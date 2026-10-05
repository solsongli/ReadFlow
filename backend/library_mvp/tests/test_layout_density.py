import unittest
import pymupdf as fitz
from backend.library_mvp.layout_density import balanced_leading
from backend.library_mvp.layout_fit import fit
from backend.library_mvp.layout_save import save_pdf
import tempfile
from pathlib import Path


class LayoutDensityTests(unittest.TestCase):
    def test_font_interning_tolerates_free_xref_slots(self):
        with tempfile.TemporaryDirectory() as temporary, fitz.open() as pdf:
            page = pdf.new_page()
            page.insert_text((30, 50), "Preserved text")
            pdf.get_new_xref()  # Reserved but never assigned: common in revised PDFs.
            output = Path(temporary) / "sparse.pdf"
            save_pdf(pdf, output)
            with fitz.open(output) as result:
                self.assertIn("Preserved text", result[0].get_text())

    def test_leading_is_bounded_and_single_lines_stay_compact(self):
        self.assertEqual(balanced_leading(100, 10, 1), 1.05)
        self.assertEqual(balanced_leading(100, 10, 3), 1.5)
        self.assertEqual(balanced_leading(20, 10, 3), 1.05)

    def test_run_in_heading_is_bold_without_changing_the_rest_of_the_paragraph(self):
        result = fit(
            fitz.Rect(0, 0, 250, 70),
            [
                {"kind": "text", "text": "Task. ", "bold": True},
                {"kind": "text", "text": "Reproducible scientific evidence."},
            ],
            "",
            None,
            11,
        )
        try:
            spans = [
                span
                for b in result["doc"][0].get_text("dict")["blocks"]
                for line in b.get("lines", [])
                for span in line["spans"]
            ]
            self.assertTrue(next(s for s in spans if "Task" in s["text"])["flags"] & 16)
            self.assertFalse(next(s for s in spans if "Reproducible" in s["text"])["flags"] & 16)
        finally:
            result["doc"].close()

    def test_balanced_fills_more_height_without_smaller_font_or_overflow(self):
        rect = fitz.Rect(0, 0, 160, 100)
        runs = [{"kind": "text", "text": "Reproducible evidence and reliable methods. " * 3}]
        compact = fit(rect, runs, "", None, 10, density="compact")
        balanced = fit(rect, runs, "", None, 10, density="balanced")
        try:
            self.assertGreater(balanced["leading"], compact["leading"])
            self.assertGreaterEqual(balanced["scale"], compact["scale"])
            self.assertGreater(max(b[3] for b in balanced["boxes"]), max(b[3] for b in compact["boxes"]))
            self.assertTrue(all((rect + (-1, -1, 1, 1)).contains(fitz.Rect(b)) for b in balanced["boxes"]))
        finally:
            compact["doc"].close()
            balanced["doc"].close()
