from pathlib import Path
import re
import tempfile
import unittest
import pymupdf as fitz
from backend.library_mvp.document_models import DocumentModels, available
from backend.library_mvp.document_ocr import components, decode_ctc
from backend.library_mvp.document_ocr_pages import scan_lines
from backend.library_mvp.paper_blocks_extract import extract

FIXTURE = Path(__file__).resolve().parents[3] / "frontend/web/tests/fixtures/blocks/paper.pdf"


@unittest.skipUnless(available(), "Pinned OCR model absent; see ops/models/fetch.py")
class OcrTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.models = DocumentModels()

    def test_run_length_unions_join_branches_without_connecting_nearby_lines(self):
        import numpy as np

        data = np.zeros((40, 80), np.float32)
        data[2:6, 3:15] = 0.9
        data[2:6, 18:32] = 0.9
        data[5:9, 3:32] = 0.9
        data[20:25, 3:32] = 0.9
        boxes = components(data)
        self.assertEqual([b["bbox"] for b in boxes], [[3, 2, 32, 9], [3, 20, 32, 25]])

    def test_ctc_blank_and_duplicate_decode(self):
        import numpy as np

        scores = np.eye(4, dtype=np.float32)[[0, 1, 1, 0, 2, 2, 3]]
        self.assertEqual(decode_ctc(scores, ["", "文", "字", " "])[0], "文字")

    def test_scanned_page_recovers_words_and_bounds(self):
        with tempfile.TemporaryDirectory() as directory, fitz.open() as pdf:
            page = pdf.new_page(width=600, height=800)
            sentences = [
                "ReadFlow local OCR preserves scientific evidence.",
                "Methods and results are linked to the source page.",
                "Translation runs only after the reader requests it.",
            ]
            for i, text in enumerate(sentences):
                page.insert_text((40, 80 + i * 30), text, fontsize=14)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            with fitz.open() as scanned:
                target = scanned.new_page(width=600, height=800)
                target.insert_image(target.rect, pixmap=pix)
                rows = scan_lines(target, self.models, directory, lambda: None)
                actual = set(re.findall(r"[a-z]+", " ".join(r["text"] for r in rows).lower()))
                expected = set(re.findall(r"[a-z]+", " ".join(sentences).lower()))
                self.assertGreater(len(actual & expected) / len(expected), 0.85)
                self.assertTrue(all(target.rect.contains(fitz.Rect(r["bbox"])) for r in rows))
                self.assertTrue(all(r["source"] == "ocr" for r in rows))

    def test_raster_paper_has_ocr_blocks_not_a_single_giant_figure(self):
        with tempfile.TemporaryDirectory() as directory:
            doc = extract(FIXTURE.with_name("paper-scan.pdf"), Path(directory), "scan", models=self.models)
            self.assertTrue(all(p["text_status"] == "ocr" for p in doc["pages"]))
            text = [b for b in doc["blocks"] if b["source"] == "ocr" and b["text"].strip()]
            self.assertGreater(len(text), 10)
            self.assertTrue(list(Path(directory).glob("ocr-page-*.json")))
            self.assertTrue(list(Path(directory).glob("layout-*.json")))
