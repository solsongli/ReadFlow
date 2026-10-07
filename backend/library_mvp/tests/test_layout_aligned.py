import unittest
from backend.library_mvp.layout_aligned import (
    legal_break,
    partitions,
    plan_lines,
    source_line_slots,
    tokens_from_runs,
)


def measure(text, size, run):
    factor = 0.6 if text.isascii() else 1
    return len(text) * size * factor * (0.66 if run.get("kind") in {"super", "sub"} else 1)


def lines(widths):
    return [
        {"x0": 10, "x1": 10 + width, "y0": index * 12, "y1": index * 12 + 10, "baseline": index * 12 + 8}
        for index, width in enumerate(widths)
    ]


class AlignedPlanningTests(unittest.TestCase):
    def test_breaks_spread_short_chinese_over_the_original_line_count(self):
        plan = plan_lines([{"kind": "text", "text": "这是较短的中文译文内容"}], lines([100, 80, 50]), 10, measure)
        self.assertEqual(len(plan["lines"]), 3)
        self.assertEqual("".join(p["text"] for row in plan["lines"] for p in row["pieces"]), "这是较短的中文译文内容")
        self.assertEqual([row["baseline"] for row in plan["lines"]], [8, 20, 32])

    def test_western_words_numbers_references_and_hyphens_are_indivisible(self):
        tokens = tokens_from_runs([{"kind": "text", "text": "方法 OpenVLA-7B 在 95.2% 任务上优于 [20, 19, 50]。"}])
        values = [token.text for token in tokens]
        self.assertIn("OpenVLA-7B", values)
        self.assertIn("95.2", values)
        self.assertIn("[20, 19, 50]", values)
        self.assertNotIn("OpenVLA", values)

    def test_line_start_and_end_punctuation_rules_reject_bad_boundaries(self):
        tokens = tokens_from_runs([{"kind": "text", "text": "研究（方法），结果。"}])
        opening = next(index for index, token in enumerate(tokens) if token.text == "（")
        closing = next(index for index, token in enumerate(tokens) if token.text == "）")
        self.assertFalse(legal_break(tokens, opening + 1))
        self.assertFalse(legal_break(tokens, closing))

    def test_justified_nonfinal_lines_touch_both_source_edges(self):
        plan = plan_lines([{"kind": "text", "text": "逐行对齐让每行填充原来的视觉宽度"}], lines([90, 55]), 10, measure)
        first = plan["lines"][0]
        end = max(piece["x"] + piece["width"] for piece in first["pieces"])
        self.assertAlmostEqual(end, first["x1"], places=5)

    def test_one_font_scale_is_used_and_extra_line_records_overflow(self):
        plan = plan_lines([{"kind": "text", "text": "这是一段远远超过原始单行容量的中文译文"}], lines([20]), 10, measure)
        self.assertTrue(plan["overflow"])
        self.assertEqual(plan["scale"], 0.7)
        self.assertEqual(len(plan["lines"]), 2)
        self.assertEqual({plan["font_size"] for _ in plan["lines"]}, {7})

    def test_super_sub_and_bold_styles_survive_partitioning(self):
        runs = [
            {"kind": "text", "text": "方法", "bold": True},
            {"kind": "text", "text": " x"},
            {"kind": "sub", "text": "i"},
            {"kind": "super", "text": "2"},
            {"kind": "text", "text": " 结果"},
        ]
        plan = plan_lines(runs, lines([45, 45]), 10, measure)
        pieces = [piece for row in plan["lines"] for piece in row["pieces"]]
        self.assertEqual("".join(piece["text"] for piece in pieces if piece.get("bold")), "方法")
        self.assertEqual([piece["kind"] for piece in pieces if piece["kind"] != "text"], ["sub", "super"])

    def test_source_slots_keep_each_native_baseline_and_indentation(self):
        raw = [
            {
                "bbox": [20, 10, 100, 20],
                "spans": [
                    {
                        "bbox": [20, 10, 100, 20],
                        "origin": [20, 18],
                        "chars": [
                            {"c": char, "bbox": [20 + i * 8, 10, 28 + i * 8, 20]}
                            for i, char in enumerate("First line")
                        ],
                    }
                ],
            },
            {
                "bbox": [10, 22, 110, 32],
                "spans": [
                    {
                        "bbox": [10, 22, 110, 32],
                        "origin": [10, 30],
                        "chars": [
                            {"c": char, "bbox": [10 + i * 8, 22, 18 + i * 8, 32]}
                            for i, char in enumerate("Second line")
                        ],
                    }
                ],
            },
        ]
        slots = source_line_slots([0, 0, 120, 40], raw, [])
        self.assertEqual([slot["baseline"] for slot in slots], [18, 30])
        self.assertGreater(slots[0]["x0"], slots[1]["x0"])


if __name__ == "__main__":
    unittest.main()
