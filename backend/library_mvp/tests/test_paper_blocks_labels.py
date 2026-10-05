import hashlib
from pathlib import Path
import tempfile
import unittest
import pymupdf as fitz
from backend.library_mvp.paper_blocks_labels import (
    translatable_label,
    identify_labels,
    translation_units,
    translated_labels,
)
from backend.library_mvp.paper_blocks_model import cache_key
from backend.library_mvp.paper_blocks_render import runtime_paths, render
from backend.library_mvp.document_figure_labels import native_figure_labels


class FigureTranslationTests(unittest.TestCase):
    def test_table_cell_gaps_separate_words_from_numeric_values(self):
        with fitz.open() as pdf:
            page = pdf.new_page(width=300, height=120)
            for x, text in ((10, "Toluene"), (90, "0.5"), (150, "20"), (220, "1.1")):
                page.insert_text((x, 50), text, fontsize=10)
            figure = {
                "id": "figure",
                "page": 1,
                "type": "table",
                "text": "",
                "bbox": [0, 20, 300, 70],
                "figure_text": [{"text": "Toluene 0.5 20 1.1", "bbox": [0, 20, 300, 70], "source": "native_text"}],
            }
            native_figure_labels(page, [figure])
            identify_labels(figure)
            units = translation_units([figure])
            self.assertEqual([r["text"] for r in units[1:]], ["Toluene"])
            self.assertLess(units[1]["bbox"][2], 90)
        self.assertFalse(translatable_label("Toluene 0.5 2 20 1.1 0.4 0.0 1.0"))

    def test_numbers_units_chemistry_and_math_are_not_sent(self):
        for text in (
            "42",
            "0.01%",
            "10 ms",
            "kg",
            "NaCl",
            "C6H12O6",
            "Pd(PPh3)4",
            "nBuLi",
            "(CH3)2SO",
            "x_i",
            "E = mc2",
            "α + β",
        ):
            self.assertFalse(translatable_label(text), text)
        for text in ("Training input", "Accuracy (%)", "Semantic engine", "训练输入"):
            self.assertTrue(translatable_label(text), text)

    def test_labels_are_separate_stable_units(self):
        figure = {
            "id": "image",
            "page": 2,
            "type": "figure",
            "text": "",
            "figure_text": [
                {"text": "Semantic engine", "bbox": [10, 20, 60, 30]},
                {"text": "2.5", "bbox": [60, 20, 80, 30]},
            ],
        }
        identify_labels(figure)
        units = translation_units([figure])
        self.assertEqual(len(units), 2)
        self.assertEqual(units[1]["type"], "figure_text")
        identity = units[1]["id"]
        identify_labels(figure)
        self.assertEqual(translation_units([figure])[1]["id"], identity)
        tick = figure["figure_text"][1]
        obsolete = {cache_key(tick, "zh-CN", "test"): "obsolete translation"}
        self.assertEqual(translated_labels(figure, obsolete, "zh-CN", "test")[1]["translation"], "")

    def test_overlay_preserves_source_and_does_not_execute_text(self):
        try:
            _, fonts, _ = runtime_paths()
        except Exception:
            self.skipTest("Bundled Typst/fonts absent in CI")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with fitz.open() as pdf:
                page = pdf.new_page(width=250, height=100)
                page.insert_text((10, 24), "Training input")
                pdf.save(root / "crop.pdf")
            original = hashlib.sha256((root / "crop.pdf").read_bytes()).hexdigest()
            figure = {
                "id": "figure",
                "page": 1,
                "asset": "crop.pdf",
                "type": "figure",
                "text": "",
                "bbox": [0, 0, 250, 100],
                "figure_text": [
                    {
                        "id": "label",
                        "text": "Training input",
                        "bbox": [10, 10, 245, 45],
                        "size": 12,
                        "translatable": True,
                    }
                ],
            }
            text = '#import "$danger" [训练输入]'
            cache = {cache_key(figure["figure_text"][0], "zh-CN", "test"): text}
            skipped = render(root, {"blocks": [figure]}, cache, "zh-CN", "test")
            self.assertEqual(skipped, {"render_fallback": [], "label_fallback": []})
            self.assertEqual(hashlib.sha256((root / "crop.pdf").read_bytes()).hexdigest(), original)
            self.assertLess((root / "translated.pdf").stat().st_size, 1_000_000)
            with fitz.open(root / "translated.pdf") as output:
                self.assertIn("训练输入", output[0].get_text())
                self.assertIn("#import", output[0].get_text())
