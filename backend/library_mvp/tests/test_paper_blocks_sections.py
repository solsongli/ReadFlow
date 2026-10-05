"""Synthetic bibliography/endmatter, hanging-list and caption/footnote regressions for CI."""
from pathlib import Path
import tempfile
import unittest
import pymupdf as fitz
from backend.library_mvp.paper_blocks_sections import classify_sections, reference_entry
from backend.library_mvp.paper_blocks_extract import extract
from backend.library_mvp.paper_blocks_model import reading_order
from backend.library_mvp.paper_blocks_text import text_blocks
from backend.library_mvp.paper_blocks_special import (
    mark_caption_continuations,
    join_captions,
    include_small_figure_labels,
)
from backend.library_mvp.paper_blocks_paragraphs import join_paragraphs


def row(text, kind="text", **values):
    return {"text": text, "type": kind, "font": "Fixture-Regular", "size": 10, "bold": False, **values}


def line(text, x, y, width=230, font="Fixture-Regular", size=10, **values):
    box = [x, y, x + width, y + size]
    return row(
        text,
        bbox=box,
        font=font,
        size=size,
        baseline=y + size * 0.8,
        sideways=False,
        math_ratio=0,
        math_parts=[],
        **values,
    )


class SectionTests(unittest.TestCase):
    def test_outline_or_lettered_heading_ends_references_and_keeps_hierarchy(self):
        for heading in (
            row("A Additional evidence", "heading", bold=True),
            row("Further results", "heading", outline_title="Further results", heading_level=2),
        ):
            rows = [
                row("References", "heading"),
                row("[1] A. Author. Evidence. 2025."),
                heading,
                row("Independent appendix prose is translated."),
            ]
            classify_sections(rows)
            self.assertEqual([r["type"] for r in rows], ["reference", "reference", "heading", "text"])
            self.assertIn(heading["reference_end_reason"], ("outline", "appendix"))
            self.assertEqual(heading["heading_level"], 2 if heading.get("outline_title") else 1)

    def test_typographic_heading_without_appendix_keyword_ends_references(self):
        style = {"font": "Fixture-Bold", "size": 14, "bold": True}
        rows = [
            row("1 Methods", "heading", **style),
            row("References", "heading", **style),
            row("[1] A. Author. 2025."),
            row("Further experiments", "heading", **style),
            row("New evidence."),
        ]
        classify_sections(rows)
        self.assertEqual(rows[3]["reference_end_reason"], "heading_style")
        self.assertEqual(rows[4]["type"], "text")

    def test_non_entry_run_rolls_back_pending_blocks_and_uses_model_votes(self):
        for count, predictions in [(3, {}), (2, {"layout_type": "text", "layout_confidence": 0.96})]:
            rows = [row("References", "heading"), row("[1] A. Author. 2025.", **predictions)]
            rows += [row(f"New evidence paragraph number {i}.", **predictions) for i in range(count)]
            classify_sections(rows)
            self.assertEqual(rows[1]["type"], "reference")
            self.assertTrue(all(r["type"] == "text" for r in rows[2:]))
        rows = [row("References"), row("[1] Source. 2025.")] + [
            row("Journal continuation.", layout_type="reference", layout_confidence=0.97) for _ in range(4)
        ]
        classify_sections(rows)
        self.assertTrue(all(r["type"] == "reference" for r in rows))
        styled = [
            row("References", "heading"),
            row("[1] Source. 2025."),
            row("Bibliographic title fragment", "heading", layout_type="reference", layout_confidence=0.99),
        ]
        classify_sections(styled)
        self.assertEqual(styled[-1]["type"], "reference")

    def test_author_year_entries_are_not_treated_as_appendix(self):
        for value in (
            "Smith, A. and Doe, B. Evidence. 2025.",
            "A. Smith. Evidence. 2024.",
            "张三，李四. 科学证据. 2023.",
            "[17] Source without a date",
        ):
            self.assertTrue(reference_entry(value))
        self.assertFalse(reference_entry("We studied the result in 2025, with independent trials."))

    def test_synthetic_pdf_references_then_appendix_with_and_without_outline(self):
        for toc in (False, True):
            with self.subTest(outline=toc), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                with fitz.open() as pdf:
                    page = pdf.new_page()
                    page.insert_text((40, 70), "1 Main study", fontsize=14, fontname="hebo")
                    page.insert_text(
                        (40, 105), "A sufficiently long paragraph describes the evidence and source.", fontsize=10
                    )
                    page.insert_text((40, 150), "References", fontsize=14, fontname="hebo")
                    page.insert_text((40, 182), "[1] Smith, A. Independent evaluation. 2025.", fontsize=10)
                    page = pdf.new_page()
                    page.insert_text((40, 70), "A Additional evidence", fontsize=14, fontname="hebo")
                    page.insert_text(
                        (40, 105),
                        "The appendix contains a sufficiently long paragraph of new evidence.",
                        fontsize=10,
                    )
                    page.insert_text((40, 150), "A.1 Detailed method", fontsize=12, fontname="hebo")
                    page.insert_text(
                        (40, 180), "Further prose after the subsection must also remain translatable.", fontsize=10
                    )
                    if toc:
                        # References is intentionally absent, as in the local real-world paper.
                        pdf.set_toc(
                            [[1, "Main study", 1], [1, "Additional evidence", 2], [2, "Detailed method", 2]]
                        )
                    source = root / "source.pdf"
                    pdf.save(source)
                doc = extract(source, root, "fixture", enrich=False)
                self.assertFalse(any(b["type"] == "reference" and b["page"] == 2 for b in doc["blocks"]))
                self.assertTrue(any(b["type"] == "text" and b["page"] == 2 for b in doc["blocks"]))
                if toc:
                    sub = next(b for b in doc["blocks"] if b.get("outline_title") == "Detailed method")
                    self.assertEqual(sub["heading_level"], 2)


class SpecialFlowTests(unittest.TestCase):
    def test_small_axis_labels_expand_figure_but_not_caption_or_prose(self):
        image = {"type": "figure", "bbox": [100, 100, 200, 200], "caption_bbox": [100, 215, 250, 225]}
        rows = [
            line("Axis", 80, 180, width=18, size=5),
            line("Normal prose", 75, 90),
            line("Figure 1: caption", 100, 215, type="caption"),
        ]
        include_small_figure_labels(rows, [image], 10)
        self.assertEqual(image["bbox"], [80, 100, 200, 200])

    def test_pdf_footnote_rule_and_publication_footer_do_not_break_prose(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with fitz.open() as pdf:
                page = pdf.new_page(width=612, height=792)
                for y in (80, 105, 130):
                    page.insert_text(
                        (40, y),
                        "The body provides enough regular prose to establish the normal type size.",
                        fontsize=10,
                    )
                page.draw_line((40, 680), (175, 680))
                page.insert_text((48, 694), "1Institute for scientific research and continued", fontsize=8.9)
                page.insert_text((40, 706), "laboratory affiliation.", fontsize=8.9)
                page.insert_text((40, 718), "Contact information.", fontsize=8.9)
                page.insert_text((40, 743), "39th Conference on Scientific Research, 2025.", fontsize=8.9)
                source = root / "footnotes.pdf"
                pdf.save(source)
            doc = extract(source, root, "fixture", enrich=False)
            notes = [b for b in doc["blocks"] if b["type"] == "footnote"]
            self.assertEqual(len(notes), 1)
            self.assertEqual(len(notes[0]["source_lines"]), 3)
            self.assertTrue(any(b["type"] == "footer" and b["text"].startswith("39th") for b in doc["blocks"]))

    def test_list_can_continue_after_a_sentence_when_all_next_lines_remain_hanging(self):
        prior = line("• First sentence.", 40, 700, type="list", indent_offset=0)
        prior.update(source_lines=[{**prior}], anchors=[{"page": 1, "bbox": prior["bbox"]}])
        following = line(
            "Another sentence continues on this next page.",
            48,
            50,
            indent_offset=8,
            first_indent=True,
            paragraph_gap=True,
        )
        following.update(
            source_lines=[{**following}, {**following, "bbox": [48, 63, 278, 73]}],
            anchors=[{"page": 2, "bbox": following["bbox"]}],
        )
        joined = join_paragraphs([prior, following], None)
        self.assertEqual(len(joined), 1)
        self.assertEqual(joined[0]["type"], "list")

    def test_bold_hanging_list_can_continue_with_capital_word_and_over_page_or_column(self):
        rows = [
            line("• Environment: the method introduces", 40, 100, font="Fixture-Bold", bold=True),
            line("Safety examples with a continuing clause", 48, 113),
        ]
        blocks = text_blocks(rows, 10, 2, 600, 800)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["type"], "list")
        for page, x, y in [(3, 48, 50), (2, 330, 50)]:
            first = {
                **blocks[0],
                "source_lines": list(blocks[0]["source_lines"]),
                "math_parts": [],
                "anchors": [{"page": 2, "bbox": blocks[0]["bbox"]}],
            }
            after = line("continued evidence.", x, y, indent_offset=8, first_indent=True, paragraph_gap=True)
            after.update(source_lines=[{**after}], anchors=[{"page": page, "bbox": after["bbox"]}])
            result = join_paragraphs([first, after], None)
            self.assertEqual(len(result), 1)
            self.assertEqual(len(result[0]["anchors"]), 2)
            self.assertEqual(result[0]["anchors"][1]["continuation_reason"], "list")

    def test_caption_changes_weight_and_size_but_stops_at_a_paragraph_gap(self):
        rows = [
            line("Figure 1: A multi-", 40, 100, font="Fixture-Bold", bold=True),
            line("faceted view of the model.", 40, 113, size=9.5),
            line("A separate paragraph must stay separate.", 40, 145),
        ]
        blocks = text_blocks(rows, 10, 2, 600, 800)
        self.assertEqual([b["type"] for b in blocks], ["caption", "text"])
        self.assertEqual(len(blocks[0]["source_lines"]), 2)
        self.assertIn("multi-faceted", blocks[0]["text"])

    def test_cross_column_caption_preserves_two_spatial_anchors(self):
        rows = [
            line("Left body evidence remains separate.", 40, 200),
            line("Figure 1: A multi-", 40, 650),
            line("faceted overview.", 330, 50),
            line("Right body evidence remains separate.", 330, 200),
        ]
        blocks = text_blocks(rows, 10, 2, 600, 800)
        blocks = reading_order(blocks, 600)
        mark_caption_continuations(blocks, None)
        for b in blocks:
            b["anchors"] = [{"page": 2, "bbox": b["bbox"]}]
        result = join_captions(blocks, None)
        self.assertEqual(len(result), 3)
        caption = next(b for b in result if b["type"] == "caption")
        self.assertEqual(len(caption["anchors"]), 2)

    def test_same_footnote_area_merges_contiguous_lines_but_not_other_areas(self):
        rows = [
            line(
                "1 First affiliation with a continued", 48, 680, size=9, type="footnote", footnote_area=[40, 677]
            ),
            line("laboratory name and address.", 40, 690, size=9, type="footnote", footnote_area=[40, 677]),
            line("2 Separate note.", 40, 725, size=9, type="footnote", footnote_area=[40, 721]),
        ]
        blocks = text_blocks(rows, 10, 1, 600, 800)
        self.assertEqual([len(b["source_lines"]) for b in blocks], [2, 1])
