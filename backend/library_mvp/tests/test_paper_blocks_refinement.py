"""Inline data roundtrip and conservative paragraph boundaries, independent of model output."""
import io
import json
from pathlib import Path
import tempfile
import unittest
import pymupdf
from backend.library_mvp.paper_blocks_extract import extract
from backend.library_mvp.paper_blocks_model import protect, restore, joined
from backend.library_mvp.paper_blocks_inline import restore_rich
from backend.library_mvp.paper_blocks_text import continuation, mark_margins, text_blocks
from backend.library_mvp.paper_blocks_render import render, runtime_paths

FIXTURE = Path(__file__).resolve().parents[3] / "frontend/web/tests/fixtures/blocks/paper.pdf"


class RefinementTests(unittest.TestCase):
    def test_first_line_indent_starts_new_paragraph_even_without_sentence_punctuation(self):
        def row(text, x, y):
            return {
                "text": text,
                "bbox": [x, y, 270, y + 10],
                "size": 10,
                "font": "Fixture",
                "baseline": y + 8,
                "type": "text",
                "bold": False,
                "sideways": False,
                "math_ratio": 0,
                "math_parts": [],
            }

        rows = [
            row("A sufficiently long first line of the first paragraph", 40, 100),
            row("continuing evidence without terminal punctuation", 40, 113),
            row("A new paragraph begins with an indented first line", 50, 126),
            row("and continues at the usual column margin with evidence", 40, 139),
        ]
        blocks = text_blocks(rows, 10, 2, 600, 800)
        self.assertEqual(len(blocks), 2)
        self.assertEqual([len(b["source_lines"]) for b in blocks], [2, 2])

    def test_placeholder_whitespace_survives_model_concatenation(self):
        block = {
            "id": "a",
            "text": "value is x2 then",
            "protected": [
                {
                    "start": 9,
                    "end": 11,
                    "text": "x2",
                    "runs": [{"kind": "text", "text": "x"}, {"kind": "super", "text": "2"}],
                }
            ],
        }
        masked, mapping = protect(block)
        self.assertEqual(restore(masked, mapping), block["text"])
        marker = next(iter(mapping))
        result = restore_rich("value is" + marker + "then", mapping)
        self.assertEqual(result["text"], block["text"])
        self.assertEqual(result["runs"][2], {"kind": "super", "text": "2"})
        self.assertNotIn("super", masked)
        self.assertNotIn("x2", masked)
        self.assertIsNone(restore_rich(marker + marker, mapping))

    def test_document_lexicon_preserves_compounds_and_only_joins_attested_plain_words(self):
        words = {
            "hyphen": {"layout-preserving": 2, "cross-platform": 1, "llm-as-a-judge": 1},
            "plain": {"translation": 3},
        }
        for left, right in [("layout-", "preserving"), ("cross-", "platform"), ("LLM-as-a-", "judge")]:
            self.assertEqual(joined(left, right, words), left + right)
        self.assertEqual(joined("trans-", "lation", words), "translation")
        self.assertEqual(joined("unknown-", "suffix", words), "unknown-suffix")

    def test_cross_column_continuation_requires_no_indentation_or_paragraph_gap(self):
        a = {"type": "text", "text": "continues here", "bbox": [10, 600, 250, 650], "anchors": [{"page": 1}]}
        b = {"type": "text", "text": "continuation", "bbox": [300, 50, 540, 70], "anchors": [{"page": 1}]}
        self.assertTrue(continuation(a, b))
        for change in [{"first_indent": True}, {"paragraph_gap": True}]:
            self.assertFalse(continuation(a, {**b, **change}))
        for stop in [".", "?", "!", "。", "。”"]:
            self.assertFalse(continuation({**a, "text": a["text"] + stop}, b))

    def test_margin_normalization_ignores_case_numbers_spaces_and_even_odd_position(self):
        stats = []
        for n in range(6):
            row = {
                "text": f"  JOURNAL   {n} " if n % 2 else f"journal {n}",
                "bbox": [20 if n % 2 else 400, 15, 520, 28],
                "sideways": False,
                "type": "text",
            }
            stats.append(({"cropbox": [0, 0, 600, 800]}, [row], 10))
        mark_margins(stats)
        self.assertTrue(all(rows[0]["type"] == "header" for _, rows, _ in stats))

    def test_real_span_sizes_and_baselines_produce_local_super_sub_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            doc = extract(FIXTURE, Path(tmp), "synthetic")
            blocks = [
                b
                for b in doc["blocks"]
                if b["type"] == "text" and any(r["kind"] == "sub" for p in b["protected"] for r in p.get("runs", []))
            ]
            self.assertTrue(blocks)
            block = blocks[0]
            masked, mapping = protect(block)
            result = restore_rich("【译】" + masked, mapping)
            kinds = {r["kind"] for r in result["runs"]}
            self.assertTrue({"super", "sub"} <= kinds)
            # Prose and normal-size operators must never inherit a neighboring superscript flag.
            self.assertTrue(all(len(r["text"]) < 5 for r in result["runs"] if r["kind"] != "text"))
            try:
                runtime_paths()
            except Exception:
                return  # Pure extraction assertions still run in CI without Typst.
            from backend.library_mvp.paper_blocks_model import cache_key

            root = Path(tmp)
            render(root, {"blocks": [block]}, {cache_key(block, "zh-CN", "fake"): result}, "zh-CN", "fake")
            data = json.loads((root / "render-data.json").read_text())
            self.assertEqual(data["blocks"][0]["runs"], result["runs"])
            with pymupdf.open(root / "translated.pdf") as pdf:
                spans = [s for b in pdf[0].get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"]]
                self.assertTrue(any(s["size"] < 9 for s in spans))
