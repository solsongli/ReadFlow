import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import pymupdf as fitz
import httpx
from backend.library_mvp.paper_blocks_render import render, runtime_paths
from backend.library_mvp.paper_blocks_transport import token_usage, run_batch
from backend.library_mvp.paper_blocks_model import cache_key
from ops.development.readflow_fake_openai import completion_response


class ResultSemanticsTests(unittest.TestCase):
    def test_reasoning_details_are_preserved_without_double_counting(self):
        for additional in (
            {"completion_tokens_details": {"reasoning_tokens": 70}},
            {"output_tokens_details": {"reasoning_tokens": 70}},
            {"reasoning_tokens": 70},
        ):
            usage = token_usage({"prompt_tokens": 20, "completion_tokens": 100, **additional})
            self.assertEqual(usage["total_tokens"], 120)
            self.assertEqual(usage["reasoning_tokens"], 70)
            self.assertEqual(token_usage(usage), usage)
        for value in (-1, "80", float("nan"), True):
            self.assertEqual(token_usage({"reasoning_tokens": value})["reasoning_tokens"], 0)

    def test_fake_reasoning_response_and_no_unverified_thinking_parameter(self):
        requests = []

        def handle(request):
            body = json.loads(request.content)
            requests.append(body)
            status, response = completion_response(body)
            return httpx.Response(status, json=response)

        result = run_batch(
            {"base_url": "http://127.0.0.1:9/v1", "model": "readflow-reasoning", "api_key": "fixture"},
            [{"role": "user", "content": "Synthetic paragraph"}],
            transport=httpx.MockTransport(handle),
        )
        self.assertEqual(
            result["usage"],
            {"prompt_tokens": 11, "completion_tokens": 17, "total_tokens": 28, "reasoning_tokens": 10},
        )
        self.assertFalse(any(key in requests[0] for key in ("thinking", "enable_thinking", "reasoning_effort")))

    def test_label_space_or_font_failure_does_not_mean_the_figure_failed_to_render(self):
        try:
            runtime_paths()
        except Exception:
            self.skipTest("CI has no bundled Typst")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with fitz.open() as pdf:
                page = pdf.new_page(width=200, height=100)
                page.draw_rect(fitz.Rect(10, 10, 190, 90))
                page.insert_text((20, 35), "Original figure")
                pdf.save(root / "crop.pdf")
            label = {
                "id": "label",
                "text": "Small label",
                "translation": "",
                "translatable": True,
                "bbox": [20, 50, 22, 52],
                "size": 5,
            }
            block = {
                "id": "image",
                "type": "figure",
                "text": "",
                "asset": "crop.pdf",
                "bbox": [0, 0, 200, 100],
                "figure_text": [label],
            }
            cache = {cache_key(label, "zh-CN", "test"): "这是放不下的译文"}
            result = render(root, {"blocks": [block]}, cache, "zh-CN", "test")
            self.assertEqual(result, {"render_fallback": [], "label_fallback": ["image"]})
            with patch(
                "backend.library_mvp.paper_blocks_render.label_layout", side_effect=ValueError("font unavailable")
            ):
                self.assertEqual(render(root, {"blocks": [block]}, cache, "zh-CN", "test"), result)
            with fitz.open(root / "translated.pdf") as pdf:
                self.assertIn("Original figure", "".join(p.get_text() for p in pdf))
