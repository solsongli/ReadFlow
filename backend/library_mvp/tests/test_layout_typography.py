"""Coordinated type, natural wrapping and strict geometry; no models or downloads."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import pymupdf as fitz
from backend.library_mvp.layout_balanced import plan_page, close_plans
from backend.library_mvp.layout_fit import fit, legacy_fit
from backend.library_mvp.layout_flow import CLOSING, OPENING, groups, rich_html, title_lines
from backend.library_mvp.layout_geometry import native_lines
from backend.library_mvp.layout_metrics import typography_metrics
from backend.library_mvp.layout_text import plain
from backend.library_mvp.layout_typography import allocate_leading, page_groups, uniform_sizes, source_style
from backend.library_mvp.paper_blocks_layout import render_layout, tasks_for
from backend.library_mvp.paper_blocks_model import cache_key


class TypePlanning(unittest.TestCase):
    def test_long_outlier_does_not_lower_the_surrounding_column(self):
        samples = [{"source": 10, "capacity": 10, "group": ("left", "body")} for _ in range(6)]
        samples.append({"source": 10, "capacity": 5.5, "group": ("left", "body")})
        samples += [{"source": 8, "capacity": 8, "group": ("left", "caption")}]
        result = uniform_sizes(samples)
        self.assertEqual(result[("left", "body")], 10)
        self.assertEqual(result[("left", "caption")], 8)

    def test_a_tiny_misclassified_span_does_not_lower_the_page(self):
        samples = [{"source": 10, "capacity": 10, "group": "body"} for _ in range(5)]
        samples.append({"source": 5, "capacity": 5, "group": "body"})
        self.assertEqual(uniform_sizes(samples)["body"], 10)

    def test_dense_regular_blocks_coordinate_instead_of_scaling_independently(self):
        samples = [{"source": 10, "capacity": c, "group": "body"} for c in (8.6, 9.1, 9.5, 10)]
        self.assertEqual(uniform_sizes(samples)["body"], 8.6)

    def test_columns_and_title_hierarchy_remain_separate(self):
        tasks = [
            {"type": "text", "size": 10, "box": [40, 50, 290, 150], "label": False},
            {"type": "text", "size": 10, "box": [310, 50, 560, 150], "label": False},
            {"type": "title", "size": 18, "box": [40, 10, 560, 40], "label": False},
            {"type": "heading", "size": 12, "box": [40, 180, 220, 200], "label": False},
        ]
        values = page_groups(tasks, 600)
        self.assertEqual(values[id(tasks[0])], ("left", "body"))
        self.assertEqual(values[id(tasks[1])], ("right", "body"))
        self.assertNotEqual(values[id(tasks[2])][1], values[id(tasks[3])][1])

    def test_leading_allocates_height_without_blank_lines_or_extreme_spacing(self):
        leading = allocate_leading(65, 10, 5, 54)
        self.assertGreater(leading, 1.2)
        self.assertLess(leading, 1.4)
        self.assertEqual(allocate_leading(200, 10, 5, 54), 1.7)
        self.assertEqual(allocate_leading(20, 10, 5, 54), 1.05)
        self.assertEqual(allocate_leading(200, 10, 1, 14), 1.05)

    def test_source_alignment_and_first_line_indent_are_inferred(self):
        with fitz.open() as pdf:
            page = pdf.new_page(width=400, height=200)
            for y, x, text in [
                (50, 45, "An indented paragraph"),
                (65, 30, "A longer second line with words"),
                (80, 30, "A longer second line with words"),
                (95, 30, "Short ending."),
            ]:
                page.insert_text((x, y), text, fontsize=10)
            lines = native_lines(page)
            box = fitz.Rect(lines[0]["bbox"])
            for line in lines[1:]:
                box |= fitz.Rect(line["bbox"])
            style = source_style({"box": list(box), "type": "text", "size": 10}, lines)
            self.assertEqual(style["align"], "justify")
            self.assertEqual(style["indent"], 15)
            title = source_style({"box": [150, 10, 450, 40], "type": "title", "size": 20}, [], center=300)
            left = source_style({"box": [40, 10, 180, 40], "type": "title", "size": 20}, [], center=300)
            self.assertEqual(title["align"], "center")
            self.assertEqual(title["indent"], 0)
            self.assertEqual(left["align"], "left")


class NaturalWrapping(unittest.TestCase):
    def test_punctuation_clusters_preserve_text_and_protect_styled_boundaries(self):
        text = "方法（VLA），结果20%。"
        clusters = [text[a:b] for a, b in groups(text)]
        self.assertEqual("".join(clusters), text)
        self.assertFalse(any(c[0] in CLOSING or c[-1] in OPENING for c in clusters))
        markup = rich_html([{"text": "测试20", "bold": True}, {"text": "%<script>&"}])
        self.assertIn("white-space:nowrap", markup)
        self.assertIn("&lt;script&gt;&amp;", markup)
        self.assertNotIn("<script>", markup)

    def test_mupdf_story_obeys_actual_cjk_line_end_rules(self):
        text = "研究方法（结果），实验。准确！分析？总结：有效；引用」题名』" * 4
        for width in (61, 87, 113):
            result = fit(fitz.Rect(0, 0, width, 550), [{"text": text}], "", None, 10)
            try:
                lines = [
                    "".join(s["text"] for s in line["spans"]).strip()
                    for b in result["doc"][0].get_text("dict")["blocks"]
                    for line in b["lines"]
                ]
                self.assertTrue(lines)
                for line in lines:
                    self.assertNotIn(line[0], CLOSING)
                    self.assertNotIn(line[-1], OPENING)
            finally:
                result["doc"].close()

    def test_title_breaks_preserve_word_integrity_and_rich_runs(self):
        runs = [{"text": "机器人学习：可靠的跨领域推理方法", "bold": True}, {"kind": "super", "text": "2"}]
        result = title_lines(runs, 2)
        self.assertEqual(plain(result).replace("\n", ""), plain(runs))
        self.assertIn("\n", plain(result))
        self.assertEqual(result[-1]["kind"], "super")
        english = title_lines([{"text": "Reproducible Scientific Evidence and Reliable Methods"}], 2)
        self.assertNotIn("Scien\ntific", plain(english))

    def test_compact_path_matches_the_previous_renderer_exactly(self):
        args = (fitz.Rect(0, 0, 160, 90), [{"text": "Reliable evidence. " * 8}], "", None, 10)
        old = legacy_fit(*args, density="compact")
        new = fit(*args, density="compact")
        try:
            for key in ("scale", "boxes", "text", "leading"):
                self.assertEqual(new[key], old[key])
        finally:
            old["doc"].close()
            new["doc"].close()


class PageTypography(unittest.TestCase):
    def test_run_in_bold_does_not_make_an_entire_paragraph_or_caption_bold(self):
        blocks = [
            {
                "id": str(i),
                "type": kind,
                "text": "Task. Reliable evidence.",
                "bold": True,
                "page": 1,
                "size": 10,
                "anchors": [{"page": 1, "bbox": [0, 0, 200, 90]}],
            }
            for i, kind in enumerate(("text", "caption", "heading"))
        ]
        cache = {
            cache_key(b, "zh-CN", "test"): {
                "text": "Task. Reliable evidence.",
                "runs": [{"text": "Task.", "bold": True}, {"text": " Reliable evidence."}],
            }
            for b in blocks
        }
        tasks, _ = tasks_for({"blocks": blocks}, cache, "zh-CN", "test", False)
        self.assertFalse(tasks[1][0]["bold"])
        self.assertFalse(tasks[1][1]["bold"])
        self.assertTrue(tasks[1][2]["bold"])
        self.assertTrue(tasks[1][0]["runs"][0]["bold"])
        blocks[2]["bold"] = False
        balanced, _ = tasks_for({"blocks": blocks}, cache, "zh-CN", "test", False)
        compact, _ = tasks_for({"blocks": blocks}, cache, "zh-CN", "test", False, "compact")
        self.assertFalse(balanced[1][2]["bold"])
        self.assertTrue(compact[1][2]["bold"])

    def test_metrics_exclude_figure_whitespace_and_measure_per_column_type(self):
        blocks = [
            {
                "id": str(i),
                "type": "text",
                "size": 10,
                "page": 1,
                "anchors": [{"page": 1, "bbox": [10, i * 110, 210, i * 110 + 100]}],
            }
            for i in range(2)
        ]
        audit = {
            "pages": [
                {
                    "page": 1,
                    "records": [
                        {
                            "id": b["id"],
                            "status": "placed",
                            "bbox": b["anchors"][0]["bbox"],
                            "placements": [
                                {
                                    "bbox": b["anchors"][0]["bbox"],
                                    "scale": 1,
                                    "glyph_boxes": [[0, 0, 180, 50]],
                                }
                            ],
                        }
                        for b in blocks
                    ],
                }
            ]
        }
        metrics = typography_metrics({"blocks": blocks}, audit)
        self.assertEqual(metrics["paragraph_occupancy"], {"p10": 0.5, "p50": 0.5, "p90": 0.5})
        self.assertEqual(metrics["added_body_blank_ratio"], 0.5)
        self.assertEqual(metrics["body_font_sd_pt"], 0)

    def test_column_font_is_shared_and_a_long_block_is_reported_as_exceptional(self):
        tasks = [
            {
                "id": str(i),
                "box": [0, i * 100, 180, i * 100 + 80],
                "type": "text",
                "size": 10,
                "color": "rgb(0,0,0)",
                "bold": False,
                "label": False,
                "runs": [{"text": "Reliable evidence and reproducible methods. " * (3 if i < 3 else 60)}],
            }
            for i in range(4)
        ]
        plans = plan_page(tasks, 400, [], "", None, lambda: None)
        results = []
        try:
            for task in tasks:
                results.append(fit(fitz.Rect(task["box"]), task["runs"], "", None, 10, plan=plans[id(task)]))
            self.assertEqual({round(r["font_size"], 3) for r in results[:3]}, {10})
            self.assertTrue(results[-1]["outlier"])
            self.assertTrue(all(r["font_size"] >= 5.5 for r in results))
        finally:
            close_plans(plans)
            for result in results:
                if result:
                    result["doc"].close()

    def test_shortening_a_paragraph_never_moves_the_next_paragraph(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source.pdf"
            blocks, cache = [], {}
            with fitz.open() as pdf:
                page = pdf.new_page()
                for i, y in enumerate((90, 230)):
                    page.insert_textbox(
                        fitz.Rect(50, y, 250, y + 110), "Original scientific evidence. " * 5, fontsize=10
                    )
                    block = {
                        "id": str(i),
                        "type": "text",
                        "size": 10,
                        "text": "Original scientific evidence.",
                        "page": 1,
                        "anchors": [{"page": 1, "bbox": [50, y, 250, y + 110]}],
                    }
                    blocks.append(block)
                    cache[cache_key(block, "zh-CN", "test")] = {
                        "text": "Short evidence." if i == 0 else "Next paragraph keeps its exact location."
                    }
                pdf.save(source)
            with patch(
                "backend.library_mvp.paper_blocks_layout.prepare_fonts", return_value=(None, "", root)
            ):
                render_layout(source, root, {"blocks": blocks}, cache, "zh-CN", "test")
            with fitz.open(root / "translated-layout.pdf") as pdf:
                self.assertGreaterEqual(pdf[0].search_for("Next paragraph")[0].y0, 229)
