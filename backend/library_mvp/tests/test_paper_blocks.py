"""ReadFlow-only block extraction, data-only rendering and fake translation tests."""
import io
import json
from pathlib import Path
import tempfile
import time
import unittest
import zipfile
import pymupdf as fitz
from backend.library_mvp.paper_blocks_model import (
    protect,
    restore,
    cache_key,
    service_fingerprint,
    reading_order,
    joined,
    protected_ranges,
)
from backend.library_mvp.paper_blocks_extract import extract, geometry, anchor
from backend.library_mvp.paper_blocks_translate import translate_blocks
from backend.library_mvp.paper_blocks_render import render, runtime_paths, latex_zip
from backend.library_mvp.api import create_app
from backend.library_mvp.data_layout import OWNED_DIRECTORIES

FIXTURE = Path(__file__).resolve().parents[3] / "frontend/web/tests/fixtures/blocks/paper.pdf"


class BlockTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_extraction_checks_cancellation_between_pages(self):
        from backend.library_mvp.store import StoreError

        calls = 0

        def check():
            nonlocal calls
            calls += 1
            if calls == 2:
                raise StoreError("cancelled", "Cancelled synthetic extraction")

        with self.assertRaises(StoreError):
            extract(FIXTURE, self.root, "test", check)
        self.assertEqual(calls, 2)
        self.assertFalse(list(self.root.glob("*.pdf")))

    def test_reading_order_and_hyphen_continuation(self):
        def row(name, box):
            return {"text": name, "type": "text", "bbox": box}

        rows = [
            row("r2", [320, 80, 550, 100]),
            row("l2", [40, 90, 270, 110]),
            row("r1", [320, 40, 550, 60]),
            row("l1", [40, 40, 270, 60]),
            row("wide", [40, 15, 550, 30]),
        ]
        self.assertEqual([r["text"] for r in reading_order(rows, 600)], ["wide", "l1", "l2", "r1", "r2"])
        self.assertEqual(joined("trans-", "lation", {"plain": {"translation": 2}, "hyphen": {}}), "translation")

    def test_synthetic_types_assets_headers_and_captions(self):
        doc = extract(FIXTURE, self.root, "test")
        types = {b["type"] for b in doc["blocks"]}
        self.assertTrue(
            {
                "title",
                "author",
                "abstract",
                "heading",
                "text",
                "formula",
                "figure",
                "table",
                "caption",
                "reference",
                "header",
                "footer",
            }
            <= types
        )
        figures = [b for b in doc["blocks"] if b["type"] in ("figure", "table")]
        self.assertTrue(all(b.get("caption_id") for b in figures))
        for b in doc["blocks"]:
            if b.get("asset"):
                with fitz.open(self.root / b["asset"]) as crop:
                    self.assertEqual(len(crop), 1)
                    self.assertTrue(crop[0].get_text() or crop[0].get_drawings() or crop[0].get_images())
        self.assertIn("paper-blocks", OWNED_DIRECTORIES)
        self.assertTrue(any(b["protected"] for b in doc["blocks"] if b["type"] == "text"))
        self.assertTrue({"list", "footnote"} <= types)
        again = extract(FIXTURE, self.root, "test")
        self.assertEqual([b["id"] for b in doc["blocks"]], [b["id"] for b in again["blocks"]])

    def test_cross_page_continuation_retains_both_spatial_anchors(self):
        source = self.root / "continuation.pdf"
        with fitz.open() as pdf:
            pdf.new_page(width=600, height=800).insert_text(
                (40, 680), "This paragraph ends in trans-", fontsize=10
            )
            pdf.new_page(width=600, height=800).insert_text(
                (40, 100), "lation with preserved evidence.", fontsize=10
            )
            pdf.save(source)
        doc = extract(source, self.root, "test")
        row = next(b for b in doc["blocks"] if b["type"] == "text")
        self.assertEqual(row["text"], "This paragraph ends in trans-lation with preserved evidence.")
        self.assertEqual([a["page"] for a in row["anchors"]], [1, 2])

    def test_figures_after_references_are_never_dropped_and_appendix_resumes_body(self):
        for heading in (False, True):
            source = self.root / f"appendix-{heading}.pdf"
            with fitz.open() as pdf:
                page = pdf.new_page()
                page.insert_text((40, 80), "References", fontsize=14)
                page.insert_text((40, 110), "[1] A. Zhang. Research method. 2025.", fontsize=10)
                page = pdf.new_page()
                if heading:
                    page.insert_text((40, 80), "Appendix A. Evidence", fontsize=14)
                    page.insert_text((40, 110), "The supplementary result remains readable.", fontsize=10)
                page.draw_rect(fitz.Rect(40, 150, 220, 220))
                page.insert_text((40, 240), "Figure 1: Supplementary evidence.", fontsize=10)
                pdf.save(source)
            document = extract(source, self.root, "test")
            figure = next(b for b in document["blocks"] if b["type"] == "figure")
            self.assertTrue((self.root / figure["asset"]).is_file())
            self.assertTrue(figure["caption_id"])
            if heading:
                row = next(b for b in document["blocks"] if b["text"].startswith("The supplementary"))
                self.assertEqual(row["type"], "text")

    def test_vector_crop_preserves_display_rotation_and_cropbox_offset(self):
        path = self.root / "rotated.pdf"
        with fitz.open() as doc:
            page = doc.new_page(width=600, height=800)
            page.set_mediabox(fitz.Rect(10, 20, 610, 820))
            page.set_cropbox(fitz.Rect(50, 70, 550, 730))
            page.draw_rect(fitz.Rect(60, 100, 200, 160), fill=(0.2, 0.4, 0.6))
            page.set_rotation(90)
            doc.save(path)
        document = extract(path, self.root, "test")
        figure = next(b for b in document["blocks"] if b["type"] == "figure")
        with fitz.open(self.root / figure["asset"]) as crop:
            self.assertEqual(crop[0].rotation, 90)
            self.assertLess(crop[0].rect.width, crop[0].rect.height)
            self.assertTrue(crop[0].get_drawings())
            pixmap = crop[0].get_pixmap()
            self.assertLess(min(pixmap.pixel(pixmap.width // 2, pixmap.height // 2)), 200)

    def test_coordinates_crop_offset_and_all_rotations(self):
        with fitz.open() as doc:
            page = doc.new_page(width=600, height=800)
            page.set_mediabox(fitz.Rect(10, 20, 610, 820))
            page.set_cropbox(fitz.Rect(50, 70, 550, 730))
            for rotation in (0, 90, 180, 270):
                page.set_rotation(rotation)
                meta = geometry(page)
                value = anchor([30, 40, 120, 80], meta)
                pdf = fitz.Rect(value["pdf_bbox"])
                recovered = pdf * fitz.Matrix(meta["pdf_to_page"])
                for a, b in zip(recovered, value["bbox"]):
                    self.assertAlmostEqual(a, b, places=4)
                displayed = fitz.Rect(value["bbox"]) * fitz.Matrix(meta["page_to_display"])
                for actual, expected in zip(
                    value["view_bbox"],
                    [
                        displayed.x0 / meta["width"],
                        displayed.y0 / meta["height"],
                        displayed.x1 / meta["width"],
                        displayed.y1 / meta["height"],
                    ],
                ):
                    self.assertAlmostEqual(actual, expected, places=5)

    def test_placeholder_cache_and_selective_retry(self):
        text = "Let α + β follow [1–3]."
        block = {"id": "a" * 24, "type": "text", "text": text, "protected": protected_ranges(text, ["α + β"])}
        masked, mapping = protect(block)
        self.assertEqual(restore(masked, mapping), text)
        self.assertIsNone(restore(masked + next(iter(mapping)), mapping))
        config = {"base_url": "http://127.0.0.1:9/v1", "model": "fixture", "api_key": "not-a-real-credential"}
        fingerprint = service_fingerprint(config, [])
        self.assertEqual(fingerprint, service_fingerprint({**config, "api_key": "another-synthetic-value"}, []))
        self.assertNotEqual(fingerprint, service_fingerprint({**config, "model": "changed"}, []))
        self.assertNotEqual(fingerprint, service_fingerprint(config, [{"source": "a", "target": "b"}]))
        self.assertNotEqual(cache_key(block, "zh-CN", fingerprint), cache_key(block, "en", fingerprint))
        second = {**block, "id": "b" * 24}
        calls = []

        def call(messages):
            rows = json.loads(messages[-1]["content"])["blocks"]
            calls.append([r["id"] for r in rows])
            if len(rows) > 1:
                rows = rows[:1]
            return json.dumps({"blocks": [{"id": r["id"], "text": "【译】" + r["text"]} for r in rows]})

        cache = {}
        errors = translate_blocks(
            [block, second],
            cache,
            "zh-CN",
            fingerprint,
            call,
            [],
            lambda: None,
            lambda *a: None,
            lambda *a: None,
            plan=lambda rows, *_: [rows] if rows else [],
        )
        self.assertFalse(errors)
        self.assertEqual(calls, [["a" * 24, "b" * 24], ["b" * 24]])
        translate_blocks(
            [block, second],
            cache,
            "zh-CN",
            fingerprint,
            call,
            [],
            lambda: None,
            lambda *a: None,
            lambda *a: None,
            plan=lambda rows, *_: [rows] if rows else [],
        )
        self.assertEqual(len(calls), 2)

    def test_failed_format_retries_only_invalid_block_and_preserves_original(self):
        calls = []
        blocks = [
            {"id": "valid", "type": "text", "text": "Good"},
            {"id": "bad", "type": "text", "text": "Keep original"},
            {"id": "ref", "type": "reference", "text": "Never translate reference"},
            {"id": "formula", "type": "formula", "text": "Never translate formula"},
        ]

        def request(messages):
            rows = json.loads(messages[-1]["content"])["blocks"]
            calls.append([b["id"] for b in rows])
            return json.dumps({"blocks": [{"id": "valid", "text": "Translated"}]})

        cache = {}
        failed = translate_blocks(
            blocks,
            cache,
            "zh-CN",
            "fixture",
            request,
            [],
            lambda: None,
            lambda *a: None,
            lambda *a: None,
            plan=lambda rows, *_: [rows] if rows else [],
        )
        self.assertEqual(calls, [["valid", "bad"], ["bad"]])
        self.assertEqual(failed, ["bad"])
        self.assertEqual(len(cache), 1)

    def test_typst_literal_input_and_latex_escape(self):
        try:
            runtime_paths()
        except Exception:
            self.skipTest("CI has no bundled Typst; renderer is tested on the packaged runtime")
        value = '#import "not-a-package": * $ [ ] \\ literal 中文'
        block = {"id": "c" * 24, "type": "text", "text": value, "anchors": []}
        doc = {"blocks": [block]}
        render(self.root, doc, {}, "zh-CN", "")
        with fitz.open(self.root / "translated.pdf") as pdf:
            text = "".join(p.get_text() for p in pdf)
            self.assertIn("#import", text)
            self.assertIn("not-a-package", text)
            self.assertIn("中文", text)
            for symbol in ("#", "$", "[", "]", "\\"):
                self.assertIn(symbol, text)
        self.assertNotIn(value, (self.root / "main.typ").read_text())
        with zipfile.ZipFile(io.BytesIO(latex_zip(self.root, doc, {}, "zh-CN", ""))) as archive:
            source = archive.read("main.tex").decode()
            self.assertIn(r"\#import", source)
            self.assertIn(r"\$", source)
            self.assertIn(r"\textbackslash{}", source)

    def test_bad_vector_asset_falls_back_without_losing_other_blocks(self):
        try:
            runtime_paths()
        except Exception:
            self.skipTest("CI has no bundled Typst")
        blocks = [
            {"id": "e" * 24, "type": "figure", "text": "Original figure description", "asset": "missing.pdf"},
            {"id": "f" * 24, "type": "text", "text": "Preserved paragraph"},
        ]
        warnings = render(self.root, {"blocks": blocks}, {}, "zh-CN", "")
        self.assertEqual(warnings, {"render_fallback": ["e" * 24], "label_fallback": []})
        with fitz.open(self.root / "translated.pdf") as pdf:
            text = "".join(page.get_text() for page in pdf)
        self.assertIn("Original figure description", text)
        self.assertIn("Preserved paragraph", text)

    def test_worker_credentials_cancel_cache_and_reopen(self):
        app = create_app(self.root, allow_external_models=True)
        service = app.state.paper_blocks
        item = app.state.store.add_pdf(FIXTURE.read_bytes(), filename="fixture.pdf")["item"]["id"]
        secret = "synthetic-secret-never-store"

        def fake(config, messages, **kwargs):
            if "READFLOW_PAPER_TERMS" in messages[0]["content"]:
                return json.dumps({"terms": json.loads(messages[-1]["content"])["terms"]})
            rows = json.loads(messages[-1]["content"])["blocks"]
            return json.dumps({"blocks": [{"id": r["id"], "text": "【译】" + r["text"]} for r in rows]})

        service.assistance.chat = fake
        job = service.start(
            item,
            {
                "translation": {"base_url": "http://127.0.0.1:9/v1", "model": "fake", "api_key": secret},
                "block_id": None,
            },
        )
        deadline = time.monotonic() + 30
        while service.jobs[job["id"]]["status"] in ("queued", "running") and time.monotonic() < deadline:
            time.sleep(0.02)
        status = service.jobs[job["id"]]
        try:
            runtime_paths()
            self.assertEqual(status["status"], "done")
        except Exception as error:
            from backend.library_mvp.store import StoreError

            if not isinstance(error, StoreError):
                raise
            self.assertEqual(status["error"]["code"], "renderer_unavailable")
        self.assertNotIn(job["id"], service.controls)
        for path in self.root.rglob("*"):
            if path.is_file():
                self.assertNotIn(secret.encode(), path.read_bytes())
        service.close()
        app.state.store.close()
        reopened = create_app(self.root)
        self.assertIsNotNone(reopened.state.paper_blocks.status(item)["document"])
        reopened.state.paper_blocks.close()
        reopened.state.store.close()
