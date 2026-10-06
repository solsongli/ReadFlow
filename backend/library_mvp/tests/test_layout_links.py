"""Link geometry changes preserve destinations, hide ambiguity and survive page reuse."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import pymupdf as fitz
from backend.library_mvp.layout_links import apply_links
from backend.library_mvp.layout_link_text import anchor
from backend.library_mvp.paper_blocks_layout import render_layout
from backend.library_mvp.paper_blocks_model import cache_key, protect, restore


def fixture(
    root,
    source_text="Original evidence [20, 19, 50] mentions Fig. 3 and (4).",
    translated="Reliable methods and additional context confirm [20, 19, 50], Fig. 3 and (4).",
):
    source, blocks, cache = root / "source.pdf", [], {}
    with fitz.open() as pdf:
        for number in range(2):
            page = pdf.new_page(width=600, height=800)
            page.insert_text((40, 100), source_text, fontsize=11)
            page.insert_text((40, 700), "https://example.test/unchanged", fontsize=10)
            for label in ("20", "3", "(4)"):
                matches = page.search_for(label)
                for box in matches:
                    page.insert_link(
                        {"kind": fitz.LINK_URI, "from": box, "uri": "https://example.test/" + label}
                    )
            footer = page.search_for("https://example.test/unchanged")[0]
            page.insert_link({"kind": fitz.LINK_URI, "from": footer, "uri": "https://example.test/unchanged"})
            page = pdf.reload_page(page)
            for link in page.get_links():
                pdf.xref_set_key(link["xref"], "Border", "[0 0 1]")
                pdf.xref_set_key(link["xref"], "C", "[0 1 0]")
            block = {
                "id": str(number),
                "type": "text",
                "text": source_text,
                "page": number + 1,
                "size": 11,
                "anchors": [{"page": number + 1, "bbox": [40, 84, 550, 150]}],
            }
            blocks.append(block)
            cache[cache_key(block, "zh-CN", "fixture")] = {"text": translated}
        pdf.save(source)
    return source, {"blocks": blocks}, cache


def render(root, source, document, cache):
    with patch("backend.library_mvp.paper_blocks_layout.prepare_fonts", return_value=(None, "", root)):
        return render_layout(source, root, document, cache, "zh-CN", "fixture")


class LinkAnchoring(unittest.TestCase):
    def test_new_and_cached_protection_preserves_reference_tokens_and_math_runs(self):
        text = "See Fig. 3, Table 2, Eq. (4), (5), and [20, 19, 50]; x2."
        block = {
            "id": "fixture",
            "text": text,
            "protected": [
                {
                    "start": text.index("x2"),
                    "end": text.index("x2") + 2,
                    "text": "x2",
                    "runs": [{"text": "x"}, {"kind": "super", "text": "2"}],
                }
            ],
        }
        value, mapping = protect(block)
        self.assertNotIn("Fig. 3", value)
        self.assertNotIn("Table 2", value)
        self.assertEqual(restore(value, mapping), text)
        self.assertTrue(
            any(any(r.get("kind") == "super" for r in v.get("runs", [])) for v in mapping.values())
        )
        self.assertEqual(len(block["protected"]), 1)  # No cache/ID mutation.

    def test_reanchors_group_members_figure_and_equation_and_retains_unaffected_url(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, document, cache = fixture(root)
            outcome = render(root, source, document, cache)
            self.assertEqual(outcome["links_reanchored"], 6)
            self.assertEqual(outcome["link_borders_hidden"], 0)
            self.assertEqual(outcome["links_unaffected"], 2)
            with fitz.open(source) as original, fitz.open(root / "translated-layout.pdf") as translated:
                before, after = original[0].get_links(), translated[0].get_links()
                self.assertEqual([l["uri"] for l in before], [l["uri"] for l in after])
                self.assertEqual(after[-1]["from"], before[-1]["from"])
                self.assertNotEqual(after[0]["from"], before[0]["from"])
                target = translated[0].search_for("20")[0]
                self.assertTrue(target.intersects(after[0]["from"]))
                self.assertEqual(translated.xref_get_key(after[0]["xref"], "C")[1], "[0 1 0]")

    def test_missing_and_ambiguous_text_keeps_original_area_and_hides_border(self):
        for translated in ("There is no surviving citation.", "Results [20] and repeated results [20]."):
            with self.subTest(translated=translated), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                source, document, cache = fixture(root, "Original evidence [20].", translated)
                outcome = render(root, source, document, cache)
                self.assertEqual(outcome["link_borders_hidden"], 2)
                with fitz.open(source) as original, fitz.open(root / "translated-layout.pdf") as result:
                    left, right = original[0].get_links()[0], result[0].get_links()[0]
                    self.assertEqual(left["from"], right["from"])
                    self.assertEqual(left["uri"], right["uri"])
                    self.assertEqual(result.xref_get_key(right["xref"], "Border")[1], "[0 0 0]")
                    self.assertEqual(result.xref_get_key(right["xref"], "BS/W")[1], "0")

    def test_reused_page_reapplies_reanchored_annotations_not_only_content(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, document, cache = fixture(root)
            render(root, source, document, cache)
            with fitz.open(root / "translated-layout.pdf") as pdf:
                first = [l["from"] for l in pdf[0].get_links()]
            cache[cache_key(document["blocks"][1], "zh-CN", "fixture")] = {"text": "No surviving citation."}
            outcome = render(root, source, document, cache)
            self.assertEqual(outcome["reused_pages"], [1])
            self.assertEqual(outcome["links_reanchored"], 3)
            self.assertEqual(outcome["link_borders_hidden"], 3)
            with fitz.open(root / "translated-layout.pdf") as pdf:
                self.assertEqual([l["from"] for l in pdf[0].get_links()], first)

    def test_cropbox_and_all_rotations_reanchor_in_native_coordinates_preserving_action(self):
        for rotation in (0, 90, 180, 270):
            with self.subTest(rotation=rotation), fitz.open() as pdf:
                page = pdf.new_page(width=600, height=800)
                page.set_cropbox(fitz.Rect(20, 30, 560, 770))
                page.insert_link(
                    {
                        "kind": fitz.LINK_URI,
                        "from": fitz.Rect(40, 50, 60, 70),
                        "uri": "https://example.test/reference",
                    }
                )
                page = pdf.reload_page(page)
                xref = page.get_links()[0]["xref"]
                original_action = pdf.xref_get_key(xref, "A")
                page.set_rotation(rotation)
                target = fitz.Rect(100, 200, 130, 220)
                page = apply_links(page, [{"xref": xref, "status": "reanchored", "rect": list(target)}])
                self.assertEqual(page.rotation, rotation)
                self.assertEqual(page.get_links()[0]["from"] * page.derotation_matrix, target)
                self.assertEqual(pdf.xref_get_key(xref, "A"), original_action)

    def test_figure_alias_does_not_match_a_different_number_or_ambiguous_context(self):
        boxes = [fitz.Rect(i, 0, i + 1, 10) for i in range(12)]
        self.assertIsNone(anchor(("图30", boxes), {"label": "3", "context": "fig.3"}))
        self.assertIsNotNone(anchor(("图3", boxes), {"label": "3", "context": "fig.3"}))
        self.assertIsNone(anchor(("图3图3", boxes), {"label": "3", "context": "fig.3"}))
