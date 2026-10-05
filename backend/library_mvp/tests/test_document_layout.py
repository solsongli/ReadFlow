from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import pymupdf as fitz
from backend.library_mvp.document_models import DocumentModels, available
from backend.library_mvp.document_layout import page_layout, fuse_layout
from backend.library_mvp.paper_blocks_extract import extract

FIXTURE = Path(__file__).resolve().parents[3] / "frontend/web/tests/fixtures/blocks/paper.pdf"


class LayoutFusionTests(unittest.TestCase):
    def test_scanned_formula_and_heading_use_model_types_without_native_font_claims(self):
        with fitz.open() as doc:
            page = doc.new_page()
            for kind in ("formula", "heading", "caption", "abstract"):
                row = {
                    "type": "text",
                    "bbox": [50, 200, 150, 215],
                    "text": "OCR evidence",
                    "source": "ocr",
                    "confidence": 0.92,
                }
                if kind == "formula":
                    row["display_evidence"] = {"centered": True, "above_gap": 6, "below_gap": 6}
                fuse_layout([row], [], [{"type": kind, "bbox": row["bbox"], "confidence": 0.96}], page)
                self.assertEqual(row["type"], kind)
                self.assertEqual(row["source"], "ocr")
                self.assertEqual(row["confidence"], 0.92)
                self.assertEqual(row["layout_confidence"], 0.96)

    def test_high_confidence_regions_extend_evidence_low_confidence_does_not(self):
        with fitz.open() as doc:
            page = doc.new_page()
            image = {"type": "figure", "bbox": [40, 100, 200, 200], "text": "", "math_parts": []}
            regions = [
                {"type": "figure", "bbox": [30, 90, 210, 210], "confidence": 0.96},
                {"type": "table", "bbox": [20, 300, 300, 400], "confidence": 0.3},
            ]
            _, images = fuse_layout([], [image], regions, page)
            self.assertEqual(len(images), 1)
            self.assertEqual(images[0]["bbox"], [30, 90, 210, 210])
            self.assertEqual(images[0]["source"], "layout")

    def test_missing_models_preserves_heuristic_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            doc = extract(FIXTURE, Path(directory), "test", enrich=False)
            self.assertEqual(doc["capabilities"]["layout"], "heuristic")
            self.assertTrue(all(b["source"] == "heuristic" for b in doc["blocks"]))

    @unittest.skipUnless(available(), "Pinned layout model absent; see ops/models/fetch.py")
    def test_inference_cache_and_coordinate_frame(self):
        models = DocumentModels()
        with tempfile.TemporaryDirectory() as directory, fitz.open(FIXTURE) as doc:
            page = doc[0]
            first = page_layout(page, models, directory)
            self.assertGreater(len(first), 0)
            with patch.object(models, "run", side_effect=AssertionError("Cached page must not infer again")):
                self.assertEqual(page_layout(page, models, directory), first)
            self.assertTrue(all(page.rect.contains(fitz.Rect(r["bbox"])) for r in first))
            document = extract(FIXTURE, Path(directory), "test", models=models)
            self.assertFalse(document["warnings"])
            self.assertTrue(any(b["source"] == "layout" for b in document["blocks"]))
