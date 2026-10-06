"""Shared-line ownership and clipped images must not squeeze a paragraph into its last line."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import pymupdf as fitz
from backend.library_mvp.layout_geometry import visible_images
from backend.library_mvp.layout_ownership import bounded_tables
from backend.library_mvp.layout_squeeze import suspected_squeeze
from backend.library_mvp.paper_blocks_layout import render_layout
from backend.library_mvp.paper_blocks_model import cache_key
from backend.library_mvp.paper_context import protected_fields
from backend.library_mvp.layout_glyphs import display_runs
from backend.library_mvp.layout_text import plain


def row(page, text, origin, size=10):
    page.insert_text(origin, text, fontsize=size)
    box = list(page.search_for(text)[-1])
    return {"text": text, "bbox": box, "size": size, "font": "Helvetica"}


def block(identity, box, rows, kind="text"):
    return {
        "id": identity,
        "type": kind,
        "text": " ".join(r["text"] for r in rows),
        "size": 10,
        "page": 1,
        "anchors": [{"page": 1, "bbox": box}],
        "source_lines": rows,
    }


class OccupancyRegression(unittest.TestCase):
    def test_clipped_form_image_with_direct_icon_respects_each_individual_clip(self):
        with fitz.open() as figure, fitz.open() as pdf:
            source = figure.new_page(width=300, height=300)
            pixels = fitz.Pixmap(fitz.csRGB, (0, 0, 30, 30), False)
            pixels.clear_with(140)
            source.insert_image(source.rect, pixmap=pixels)
            page = pdf.new_page(width=600, height=800)
            page.show_pdf_page(fitz.Rect(40, 40, 340, 100), figure, 0, clip=fitz.Rect(0, 0, 300, 60))
            page.insert_image(fitz.Rect(400, 70, 410, 80), pixmap=pixels)
            self.assertGreater(page.get_image_info()[0]["bbox"][3], 300)
            boxes = visible_images(page)
            self.assertEqual(len(boxes), 2)
            self.assertLessEqual(boxes[0].y1, 100.01)
            self.assertTrue((fitz.Rect(400, 70, 410, 80) + (-0.01, -0.01, 0.01, 0.01)).contains(boxes[1]))
            for rotation in (0, 90, 180, 270):
                page.set_rotation(rotation)
                self.assertTrue(
                    (fitz.Rect(40, 40, 340, 100) + (-0.01, -0.01, 0.01, 0.01)).contains(
                        visible_images(page)[0]
                    )
                )

    def test_clipped_image_does_not_block_abstract_or_leave_only_the_bottom_row(self):
        with tempfile.TemporaryDirectory() as temporary, fitz.open() as figure, fitz.open() as pdf:
            root = Path(temporary)
            source = figure.new_page(width=300, height=300)
            pixels = fitz.Pixmap(fitz.csRGB, (0, 0, 30, 30), False)
            pixels.clear_with(140)
            source.insert_image(source.rect, pixmap=pixels)
            page = pdf.new_page(width=600, height=800)
            page.show_pdf_page(fitz.Rect(40, 40, 340, 100), figure, 0, clip=fitz.Rect(0, 0, 300, 60))
            page.insert_image(fitz.Rect(400, 70, 410, 80), pixmap=pixels)
            lines = [row(page, "Original abstract evidence.", (40, 130 + i * 14)) for i in range(6)]
            entry = block("abstract", [40, 117, 340, 203], lines, "abstract")
            pdf.save(root / "source.pdf")
            cache = {cache_key(entry, "zh-CN", "test"): {"text": "Translated abstract evidence. " * 10}}
            with patch(
                "backend.library_mvp.paper_blocks_layout.prepare_fonts", return_value=(None, "", root)
            ):
                result = render_layout(root / "source.pdf", root, {"blocks": [entry]}, cache, "zh-CN", "test")
            self.assertEqual(result["suspected_squeeze"], [])
            self.assertEqual(result["layout_truncated"], [])
            with fitz.open(root / "translated-layout.pdf") as after:
                self.assertNotIn("Original abstract", after[0].get_text())
                self.assertIn("Translated abstract", after[0].get_text())
                self.assertEqual(len(after[0].get_image_info()), 2)

    def test_partial_first_and_last_line_use_row_ownership_instead_of_whole_paragraph_box(self):
        with tempfile.TemporaryDirectory() as temporary, fitz.open() as pdf:
            root = Path(temporary)
            page = pdf.new_page(width=600, height=800)
            previous = [
                row(page, "Earlier full width paragraph text.", (40, 70)),
                row(page, "Previous ends here.", (40, 100)),
            ]
            current = [
                row(page, "Current starts mid-line.", (240, 100)),
                row(page, "Current next line spans the whole column.", (40, 120)),
                row(page, "Current final line spans the whole column.", (40, 140)),
            ]
            a = block("previous", [40, 57, 520, 104], previous)
            b = block("current", [40, 87, 520, 150], current)
            pdf.save(root / "source.pdf")
            cache = {
                cache_key(b, "zh-CN", "test"): {
                    "text": "Translated continuation with complete evidence. " * 6
                }
            }
            with patch(
                "backend.library_mvp.paper_blocks_layout.prepare_fonts", return_value=(None, "", root)
            ):
                result = render_layout(root / "source.pdf", root, {"blocks": [a, b]}, cache, "zh-CN", "test")
            self.assertEqual(result["layout_truncated"], [])
            self.assertEqual(result["suspected_squeeze"], [])
            with fitz.open(root / "translated-layout.pdf") as after:
                self.assertIn("Previous ends here.", after[0].get_text())
                self.assertNotIn("Current starts mid-line.", after[0].get_text())
                self.assertIn("Translated continuation", after[0].get_text())

    def test_cached_table_padding_cannot_swallow_intervening_captions(self):
        with fitz.open() as pdf:
            page = pdf.new_page()
            for x0, x1, top, bottom in ((100, 400, 100, 180), (120, 380, 220, 290)):
                page.draw_line((x0, top), (x1, top))
                page.draw_line((x0, bottom), (x1, bottom))
            regions = [
                {"id": "c1", "type": "caption", "bbox": [150, 188, 350, 199]},
                {"id": "c2", "type": "caption", "bbox": [150, 298, 350, 309]},
                {"id": "table", "type": "table", "bbox": [98, 98, 402, 292], "caption_id": "c2"},
            ]
            fixed = bounded_tables(page, regions)[2]
            self.assertGreater(fixed["bbox"][1], 200)
            self.assertLess(fixed["bbox"][3], 298)
            self.assertFalse(fitz.Rect(fixed["bbox"]).intersects(fitz.Rect(regions[0]["bbox"])))

    def test_bold_abstract_prefix_is_a_head_and_never_consumes_the_entire_body(self):
        entry = {
            "id": "abstract",
            "type": "abstract",
            "text": "Abstract—Reliable fine manipulation evidence.",
            "protected": [],
            "source_lines": [{"lead": "", "start_font": "NimbusRomNo9L-Medi"}],
        }
        body, head, mapping = protected_fields(entry)
        self.assertEqual(head, "Abstract—")
        self.assertEqual(body, "Reliable fine manipulation evidence.")
        self.assertEqual(mapping, {})

    def test_squeeze_warning_catches_slivers_and_ellipsis_without_font_resources(self):
        records = [
            {
                "id": "sliver",
                "status": "placed",
                "type": "abstract",
                "bbox": [0, 0, 250, 120],
                "placements": [{"bbox": [0, 108, 250, 120], "text": "Evidence…", "font_size": 5.5}],
            }
        ]
        warnings = suspected_squeeze([{"page": 1, "records": records}])
        self.assertEqual(warnings[0]["placements"][0]["reasons"], ["small_placement", "ellipsis"])
        records[0]["placements"] = [{"bbox": [0, 0, 250, 120], "text": "Full evidence", "font_size": 10}]
        self.assertEqual(suspected_squeeze([{"page": 1, "records": records}]), [])
        records[0]["placements"] = [
            {"bbox": [0, a, 250, b], "text": "Evidence", "font_size": 10}
            for a, b in ((0, 30), (30, 60), (60, 120))
        ]
        self.assertEqual(suspected_squeeze([{"page": 1, "records": records}]), [])

    def test_combining_circle_is_a_local_equivalent_glyph_and_retains_rich_styles(self):
        runs = [{"text": "步骤 1", "bold": True}, {"text": "\u20dd 和 2\u20dd"}, {"kind": "super", "text": "x"}]
        displayed = display_runs(runs)
        self.assertEqual(plain(displayed), "步骤 ① 和 ②x")
        self.assertTrue(next(r for r in displayed if "①" in r["text"])["bold"])
        self.assertEqual(displayed[-1]["kind"], "super")
        self.assertEqual(plain(runs), "步骤 1\u20dd 和 2\u20ddx")
