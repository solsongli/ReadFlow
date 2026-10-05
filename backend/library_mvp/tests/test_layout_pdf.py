"""Page-preserving PDF contracts. All text and files are synthetic, never model requests."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import pymupdf as fitz
from backend.library_mvp.layout_text import html_runs, allocate, plain
from backend.library_mvp.layout_fonts import prepare_fonts
from backend.library_mvp.paper_blocks_layout import render_layout
from backend.library_mvp.paper_blocks_model import cache_key
from backend.library_mvp.paper_blocks_render import runtime_paths
from backend.library_mvp.store import StoreError


def sample(path):
    doc = fitz.open()
    for index in range(2):
        page = doc.new_page(width=600, height=800)
        doc.xref_set_key(page.xref, "Group", "<< /S /Transparency /CS /DeviceRGB >>")
        page.insert_text((60, 80), "Section heading", fontsize=14, fontname="hebo")
        page.insert_text((60, 140), "Original body text to replace", fontsize=12)
        page.insert_text((60, 230), "E = mc2", fontsize=12)
        page.insert_text((60, 710), "Keep original footer", fontsize=10)
        page.draw_line((40, 138), (290, 138), color=(0.2, 0.3, 0.8))
        pix = fitz.Pixmap(fitz.csRGB, (0, 0, 25, 25), False)
        pix.clear_with(180)
        page.insert_image(fitz.Rect(320, 90, 390, 160), pixmap=pix)
        page.add_highlight_annot(page.search_for("Original")[0])
        page.add_text_annot((450, 100), "User annotation")
        page.add_redact_annot(fitz.Rect(55, 695, 200, 715))  # User redaction must NOT be applied by export.
        if index:
            page.set_cropbox(fitz.Rect(20, 30, 560, 770))
            page.set_rotation(90)
    doc[0].insert_link(
        {"kind": fitz.LINK_GOTO, "from": fitz.Rect(60, 65, 180, 84), "page": 1, "to": fitz.Point(50, 80)}
    )
    doc[0].insert_link(
        {"kind": fitz.LINK_URI, "from": fitz.Rect(60, 128, 150, 143), "uri": "https://example.test/paper"}
    )
    doc.set_toc([[1, "Section heading", 1], [1, "Second", 2]])
    blocks, cache = [], {}
    for page in doc:
        for text, kind, translated in [
            ("Section heading", "heading", "New heading"),
            ("Original body text to replace", "text", "Translated paragraph"),
            ("E = mc2", "formula", None),
        ]:
            box = list(page.search_for(text)[0])
            block = {
                "id": f"{page.number}-{kind}",
                "type": kind,
                "text": text,
                "page": page.number + 1,
                "size": 12,
                "anchors": [{"page": page.number + 1, "bbox": box}],
            }
            blocks.append(block)
            if translated:
                cache[cache_key(block, "zh-CN", "fake")] = {
                    "text": translated,
                    "runs": [{"kind": "text", "text": translated}],
                }
    doc.save(path)
    doc.close()
    return {"blocks": blocks}, cache


class LayoutTextTests(unittest.TestCase):
    def test_html_escapes_every_text_run_and_never_uses_model_tags(self):
        value = html_runs(
            [
                {"kind": "text", "text": '<script>&<sup>"'},
                {"kind": "super", "text": "<img>"},
                {"kind": "sub", "text": "i"},
                {"kind": "script", "text": "safe"},
            ]
        )
        self.assertNotIn("<script>", value)
        self.assertIn("&lt;script&gt;&amp;&lt;sup&gt;&quot;", value)
        self.assertIn("<sup>&lt;img&gt;</sup>", value)
        self.assertIn("<sub>i</sub>", value)

    def test_allocation_preserves_words_punctuation_and_scripts(self):
        runs = [
            {"kind": "text", "text": "A reinforcement-learning method. 中文结果在这里。 "},
            {"kind": "text", "text": "x"},
            {"kind": "super", "text": "2"},
        ]
        parts = allocate(runs, [100, 60, 90])
        self.assertEqual("".join(map(plain, parts)), plain(runs))
        self.assertTrue(any("reinforcement-learning" in plain(p) for p in parts))
        self.assertTrue(any(r["kind"] == "super" for part in parts for r in part))
        giant = allocate([{"kind": "text", "text": "Unbreakableword"}], [1, 1])
        self.assertTrue(any(plain(p) == "Unbreakableword" for p in giant))


class LayoutPdfTests(unittest.TestCase):
    def test_misclassified_ruled_table_cells_stay_original_while_caption_translates(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "table.pdf"
            with fitz.open() as pdf:
                page = pdf.new_page()
                for y in (80, 100, 200):
                    page.draw_line((100, y), (350, y))
                page.insert_text((110, 95), "Dataset share")
                page.insert_text((110, 120), "Dataset one: 50%")
                page.insert_text((110, 145), "Dataset two: 50%")
                page.insert_text((80, 217), "Table 1: Training mixture")
                blocks = []
                for text, kind, box in [
                    ("Dataset share", "heading", [100, 81, 350, 100]),
                    ("Dataset one: 50% Dataset two: 50%", "text", [100, 102, 350, 198]),
                    (
                        "Table 1: Training mixture",
                        "caption",
                        list(page.search_for("Table 1:")[0])[:2] + [400, 220],
                    ),
                ]:
                    blocks.append(
                        {
                            "id": kind,
                            "type": kind,
                            "text": text,
                            "page": 1,
                            "size": 11,
                            "anchors": [{"page": 1, "bbox": box}],
                        }
                    )
                pdf.save(source)
            cache = {cache_key(b, "zh-CN", "fake"): {"text": "Translated " + b["id"]} for b in blocks}
            with patch("backend.library_mvp.paper_blocks_layout.prepare_fonts", return_value=(None, "", root)):
                outcome = render_layout(source, root, {"blocks": blocks}, cache, "zh-CN", "fake")
            with fitz.open(root / "translated-layout.pdf") as translated:
                text = translated[0].get_text()
                self.assertIn("Dataset one: 50%", text)
                self.assertIn("Dataset share", text)
                self.assertIn("Translated caption", text)
                self.assertNotIn("Table 1: Training mixture", text)
                self.assertEqual(len(translated[0].get_drawings()), 3)
            self.assertEqual(set(outcome["render_fallback"]), {"heading", "text"})

    def test_redactions_preserve_graphics_geometry_annotations_links_and_outline(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source.pdf"
            document, cache = sample(source)
            # Geometry/erasures always run on CI without Typst; archived CJK fonts are tested separately.
            with patch("backend.library_mvp.paper_blocks_layout.prepare_fonts", return_value=(None, "", root)):
                result = render_layout(source, root, document, cache, "zh-CN", "fake")
            self.assertEqual(result["render_fallback"], [])
            with fitz.open(source) as before, fitz.open(root / "translated-layout.pdf") as after:
                self.assertEqual(len(before), len(after))
                for left, right in zip(before, after):
                    self.assertEqual(left.mediabox, right.mediabox)
                    self.assertEqual(left.cropbox, right.cropbox)
                    self.assertEqual(left.rotation, right.rotation)
                    self.assertEqual(len(left.get_image_info()), len(right.get_image_info()))
                    self.assertEqual(len(left.get_drawings()), len(right.get_drawings()))
                    self.assertEqual(left.get_drawings()[0]["rect"], right.get_drawings()[0]["rect"])
                    self.assertEqual(left.get_image_info()[0]["bbox"], right.get_image_info()[0]["bbox"])
                    self.assertEqual([a.type for a in left.annots()], [a.type for a in right.annots()])
                    self.assertEqual(len(left.get_links()), len(right.get_links()))
                    self.assertNotIn("Original body", right.get_text())
                    self.assertIn("Translated paragraph", right.get_text())
                    self.assertIn("Keep original footer", right.get_text())
                    self.assertIn("E = mc2", right.get_text())
                self.assertEqual(after.get_toc()[0][1], "New heading")

    def test_inline_bitmap_inside_text_block_is_not_erased_or_overprinted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "inline.pdf"
            with fitz.open() as pdf:
                page = pdf.new_page()
                page.insert_text((40, 100), "Original text surrounds a small inline image", fontsize=12)
                box = list(page.search_for("Original text surrounds a small inline image")[0])
                image = fitz.Rect(140, box[1] - 1, 160, box[3] + 1)
                pix = fitz.Pixmap(fitz.csRGB, (0, 0, 20, 20), False)
                pix.clear_with(110)
                page.insert_image(image, pixmap=pix)
                pdf.save(source)
            block = {
                "id": "body",
                "type": "text",
                "text": "Original text surrounds a small inline image",
                "page": 1,
                "size": 12,
                "anchors": [{"page": 1, "bbox": box}],
            }
            cache = {cache_key(block, "zh-CN", "fake"): {"text": "Translated paragraph"}}
            with patch("backend.library_mvp.paper_blocks_layout.prepare_fonts", return_value=(None, "", root)):
                outcome = render_layout(source, root, {"blocks": [block]}, cache, "zh-CN", "fake")
            self.assertEqual(outcome["render_fallback"], [])
            with fitz.open(source) as before, fitz.open(root / "translated-layout.pdf") as after:
                self.assertEqual(
                    before[0].get_image_info(hashes=True)[0]["digest"],
                    after[0].get_image_info(hashes=True)[0]["digest"],
                )
                self.assertNotIn("Original", after[0].get_text())
                for b in after[0].get_text("dict")["blocks"]:
                    for line in b.get("lines", []):
                        for span in line["spans"]:
                            self.assertFalse(fitz.Rect(span["bbox"]).intersects(image))

    def test_archived_source_han_subset_is_small_and_unicode_mapped(self):
        try:
            runtime_paths()
        except StoreError:
            self.skipTest("Bundled Typst/font resources absent; pure HTML and geometry tests still run")
        with tempfile.TemporaryDirectory() as temporary:
            archive, css, folder = prepare_fonts(Path(temporary), ["中文απ…"])
            self.assertLess((folder / "normal.otf").stat().st_size, 200_000)
            font = fitz.Font(fontfile=str(folder / "normal.otf"))
            for char in "中文απ…":
                self.assertGreater(font.has_glyph(ord(char)), 0)
            with fitz.open() as pdf:
                page = pdf.new_page()
                result = page.insert_htmlbox(
                    fitz.Rect(30, 30, 200, 80), "中文απ…", css=css + "body{font-family:RF}", archive=archive
                )
                self.assertGreaterEqual(result[0], 0)
                self.assertIn("中文απ…", page.get_text())
                self.assertRegex(page.get_fonts()[0][3], r"^[A-Z]{6}\+SourceHanSerif")
