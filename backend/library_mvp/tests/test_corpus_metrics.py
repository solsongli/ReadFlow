"""Keep diagnostics independent of large bounding boxes and extra OCR text."""
from pathlib import Path
import tempfile
import unittest
import pymupdf as fitz
from backend.library_mvp.paper_blocks_extract import extract
from ops.development.corpus_metrics import measure, characters


class CorpusMetricTests(unittest.TestCase):
    def test_rotated_watermark_box_does_not_subtract_underlying_prose(self):
        with tempfile.TemporaryDirectory() as temp, fitz.open() as pdf:
            root = Path(temp)
            page = pdf.new_page()
            watermark = "ARTICLE IN PRESS"
            body = "Native evidence remains readable in the scientific body."
            page.insert_text((30, 600), watermark, rotate=90, fontsize=20)
            page.insert_text((60, 120), body, fontsize=10)
            source = root / "source.pdf"
            pdf.save(source)
            doc = extract(source, root, "fixture", enrich=False)
            mark = next(b for b in doc["blocks"] if b["type"] == "header")
            mark["bbox"] = [0, 0, 595, 800]
            mark["anchors"][0]["bbox"] = mark["bbox"]
            with fitz.open(source) as original:
                metrics = measure(original, doc)
            self.assertEqual(metrics["excluded_reference_margin_characters"], characters(watermark))
            self.assertEqual(metrics["translation_denominator"], characters(body))
            self.assertEqual(metrics["translatable_ratio"], 1)

    def test_extra_ocr_labels_do_not_inflate_native_translation_ratio(self):
        with tempfile.TemporaryDirectory() as temp, fitz.open() as pdf:
            root = Path(temp)
            page = pdf.new_page()
            page.insert_text((60, 120), "Native evidence remains readable.", fontsize=10)
            source = root / "source.pdf"
            pdf.save(source)
            doc = extract(source, root, "fixture", enrich=False)
            doc["blocks"].append(
                {
                    "id": "figure",
                    "page": 1,
                    "type": "figure",
                    "bbox": [60, 200, 300, 250],
                    "anchors": [{"page": 1, "bbox": [60, 200, 300, 250]}],
                    "text": "",
                    "figure_text": [
                        {
                            "id": "ocr",
                            "text": "Extra recognized labels",
                            "source": "ocr",
                            "translatable": True,
                            "bbox": [70, 210, 280, 240],
                        }
                    ],
                }
            )
            with fitz.open(source) as original:
                metrics = measure(original, doc)
            self.assertEqual(metrics["translatable_ratio"], 1)
            self.assertEqual(metrics["ocr_translatable_characters"], characters("Extra recognized labels"))

    def test_bibliography_end_uses_column_order_not_y_alone(self):
        from ops.development.corpus_boundaries import position

        with fitz.open() as pdf:
            page = pdf.new_page(width=600, height=800)
            raw = {
                1: [{"bbox": [50, y, 280, y + 10]} for y in (100, 150)]
                + [{"bbox": [320, y, 550, y + 10]} for y in (60, 110)]
            }
            self.assertGreater(position(pdf, raw, 1, 320, 60), position(pdf, raw, 1, 50, 200))
