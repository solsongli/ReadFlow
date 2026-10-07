import unittest
from backend.library_mvp.layout_aligned import (
    legal_break,
    partitions,
    plan_lines,
    source_line_slots,
    tokens_from_runs,
)
from backend.library_mvp.paper_blocks_inline import normalize_render_runs, restore_lead_bold
from backend.library_mvp.layout_ownership import region_obstacles


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
        tokens = tokens_from_runs([{"kind": "text", "text": "研究（方法），”结果。"}])
        opening = next(index for index, token in enumerate(tokens) if token.text == "（")
        closing = next(index for index, token in enumerate(tokens) if token.text == "）")
        quote = next(index for index, token in enumerate(tokens) if token.text == "”")
        self.assertFalse(legal_break(tokens, opening + 1))
        self.assertFalse(legal_break(tokens, closing))
        self.assertFalse(legal_break(tokens, quote))

    def test_justified_nonfinal_lines_touch_both_source_edges(self):
        plan = plan_lines([{"kind": "text", "text": "逐行对齐让每行填充原来的视觉宽度"}], lines([90, 55]), 10, measure)
        first = plan["lines"][0]
        end = max(piece["x"] + piece["width"] for piece in first["pieces"])
        self.assertAlmostEqual(end, first["x1"], places=5)

    def test_one_font_scale_is_used_and_extra_line_records_overflow(self):
        plan = plan_lines([{"kind": "text", "text": "这是一段远远超过原始单行容量的中文译文"}], lines([20]), 10, measure)
        self.assertTrue(plan["overflow"])
        self.assertEqual(plan["scale"], 0.75)
        self.assertEqual(len(plan["lines"]), 2)
        self.assertEqual({plan["font_size"] for _ in plan["lines"]}, {7.5})

    def test_extra_overflow_line_uses_paragraph_width_not_short_last_line(self):
        plan = plan_lines(
            [{"kind": "text", "text": "中文译文需要连续排入完整的物理行而不是末行碎片"}],
            lines([100, 8]),
            10,
            measure,
        )
        self.assertTrue(plan["overflow"])
        self.assertEqual(len(plan["lines"]), 3)
        self.assertEqual(plan["lines"][-1]["x1"] - plan["lines"][-1]["x0"], 100)
        self.assertGreaterEqual(plan["scale"], 0.75)

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

    def test_source_slots_ignore_word_gaps_and_merge_overlapping_math_fragments(self):
        raw = [
            {
                "spans": [
                    {
                        "origin": [10, 28],
                        "chars": [
                            {"c": "A", "bbox": [10, 20, 18, 30]},
                            {"c": " ", "bbox": [0, 0, 0, 0]},
                            {"c": "B", "bbox": [30, 20, 38, 30]},
                        ],
                    }
                ]
            },
            {
                "spans": [
                    {
                        "origin": [20, 22],
                        "chars": [{"c": "(", "bbox": [20, 21, 24, 31]}],
                    }
                ]
            },
        ]
        slots = source_line_slots([5, 15, 45, 35], raw, [])
        self.assertEqual(len(slots), 1)
        self.assertEqual(slots[0]["baseline"], 28)
        self.assertEqual((slots[0]["x0"], slots[0]["x1"]), (10, 38))

    def test_detected_table_cannot_erase_its_caption_source_rows(self):
        region = {
            "id": "caption",
            "type": "caption",
            "bbox": [10, 20, 110, 40],
            "line_boxes": [[10, 20, 110, 30], [10, 30, 80, 40]],
        }
        task = {"id": "caption", "box": region["bbox"]}
        obstacles = region_obstacles(region["bbox"], task, [region], [[5, 5, 115, 80]])
        self.assertEqual(obstacles, [])

    def test_sparse_chinese_uses_larger_type_and_caps_added_spacing(self):
        plan = plan_lines(
            [{"kind": "text", "text": "视觉条件语言模型用于机器人研究与实验验证"}],
            lines([100, 100, 100, 100]),
            10,
            measure,
        )
        self.assertEqual(len(plan["lines"]), 4)
        self.assertGreater(plan["scale"], 1)
        self.assertLessEqual(plan["scale"], 1.12)
        self.assertLessEqual(plan["spacing_em"], 0.12001)
        self.assertGreater(plan["before_spacing_em"], 0.12)
        self.assertLess(plan["fill_ratio"], plan["before_fill_ratio"])

    def test_old_cache_run_in_heads_recover_until_chinese_punctuation_without_internal_gap(self):
        block = {
            "type": "text",
            "start_font": "NimbusRomNo9L-Medi",
            "text_font": "NimbusRomNo9L-Regu",
        }
        runs = restore_lead_bold(
            block,
            [{"kind": "text", "text": "视觉条件语言模型。随后介绍训练方法。"}],
        )
        self.assertEqual(runs[0], {"kind": "text", "text": "视觉条件语言模型。", "bold": True})
        self.assertEqual("".join(run["text"] for run in runs), "视觉条件语言模型。随后介绍训练方法。")

    def test_old_cache_math_controls_and_modifier_quote_are_printable(self):
        runs = normalize_render_runs(
            [
                {"kind": "text", "text": "N\x000,σ2I\x01 通用˝\x07"},
                {"kind": "sub", "text": "Strategy"},
                {"kind": "sub", "text": "θ"},
            ]
        )
        self.assertEqual(
            runs,
            [
                {"kind": "text", "text": "N(0,σ2I) 通用”"},
                {"kind": "text", "text": "Strategy"},
                {"kind": "sub", "text": "θ"},
            ],
        )

    def test_audit_summary_of_a_document_without_aligned_blocks(self):
        from backend.library_mvp.paper_blocks_aligned import _audit, _summary
        summary = _summary(_audit())
        self.assertEqual((summary["mean_fill_ratio"], summary["before_mean_fill_ratio"]), (0, 0))
        self.assertEqual(summary["spacing_em_max"], 0)


    def test_finished_layouts_from_older_aligned_renderers_are_repaired_once(self):
        from backend.library_mvp.paper_blocks_aligned import ALIGNED_REVISION
        from backend.library_mvp.paper_cache_repair import aligned_stale
        current = {"layout_ready": True, "aligned_ready": True, "aligned_revision": ALIGNED_REVISION}
        self.assertFalse(aligned_stale(current))
        self.assertTrue(aligned_stale({**current, "aligned_ready": False}))
        # 0.9.21 / 0.9.22 results carry no revision; an older number is stale too.
        self.assertTrue(aligned_stale({"layout_ready": True, "aligned_ready": True}))
        self.assertTrue(aligned_stale({**current, "aligned_revision": ALIGNED_REVISION - 1}))
        # Nothing to repair before the original layout exists.
        self.assertFalse(aligned_stale({"layout_ready": False}))
        self.assertFalse(aligned_stale(None))


if __name__ == "__main__":
    unittest.main()
