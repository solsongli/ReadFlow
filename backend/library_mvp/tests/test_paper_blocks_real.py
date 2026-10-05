"""Real PDF structural regressions. No assertions depend on article-specific prose."""
from pathlib import Path
import tempfile
import unittest
import re
import pymupdf
from backend.library_mvp.paper_blocks_extract import extract, lines, geometry
from backend.library_mvp.paper_blocks_text import normalized, band
from backend.library_mvp.paper_blocks_graphics import area
from backend.library_mvp.paper_blocks_paragraphs import sentence_end
from backend.library_mvp.paper_blocks_typography import family

ROOT = Path(__file__).resolve().parents[3]
NAMES = ("babeldoc-10p", "yakubenko-halogen-lithium-10p", "s41524-tibetan-plateau-21p")


class RealBlockStructures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.samples = {}
        for name in NAMES:
            path = ROOT / "tests/fixtures/pdfs" / (name + ".pdf")
            if not path.is_file():
                raise FileNotFoundError("Required existing real-PDF fixture is absent")
            assert not any(p.is_symlink() for p in [path, *path.parents])
            output = Path(cls.temp.name) / name
            output.mkdir()
            doc = extract(path, output, name)
            with pymupdf.open(path) as pdf:
                raw = []
                for page in pdf:
                    geometry(page)
                    raw.append((page.rect.width, page.rect.height, lines(page)))
            cls.samples[name] = (doc, raw)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def verify(self, name):
        doc, raw = self.samples[name]
        titles = [b for b in doc["blocks"] if b["page"] == 1 and b["type"] == "title"]
        self.assertEqual(len(titles), 1)
        self.assertGreaterEqual(len(titles[0]["source_lines"]), 2)
        self.assertEqual(len({r["font"] for r in titles[0]["source_lines"]}), 1)
        captions = [b for b in doc["blocks"] if b["type"] == "caption"]
        self.assertTrue(any(len(c["source_lines"]) > 1 for c in captions))
        for caption in captions:
            for a, b in zip(caption["source_lines"], caption["source_lines"][1:]):
                # A bold caption lead-in and its regular continuation are one font family.
                self.assertEqual(family(a["font"]), family(b["font"]))
                self.assertLess(abs(a["size"] - b["size"]), max(a["size"], b["size"]) * 0.12)
                self.assertLess(b["bbox"][1] - a["bbox"][3], b["size"] * 0.7)
        images = [b for b in doc["blocks"] if b["type"] in ("figure", "table")]
        self.assertTrue(images)
        self.assertTrue(any(i.get("figure_text") for i in images))
        flow = {
            (b["page"], tuple(r["bbox"]))
            for b in doc["blocks"]
            if b["type"] not in ("figure", "table")
            for r in b.get("source_lines", [])
        }
        for image in images:
            for label in image["figure_text"]:
                self.assertNotIn((image["page"], tuple(label["bbox"])), flow)
                self.assertGreaterEqual(
                    area(pymupdf.Rect(image["bbox"]) & pymupdf.Rect(label["bbox"])),
                    area(pymupdf.Rect(label["bbox"])) * 0.65,
                )
        learned = {normalized(b["text"]) for b in doc["blocks"] if b["type"] in ("header", "footer")}
        self.assertTrue(learned)
        for b in doc["blocks"]:
            for r in b.get("source_lines", []):
                w, h, _ = raw[b["page"] - 1]
                if normalized(r["text"]) in learned and band(r, w, h):
                    self.assertIn(b["type"], ("header", "footer"))
        # A continuation across a column/page cannot start an indented paragraph.
        for block in doc["blocks"]:
            if len(block["anchors"]) > 1:
                for part in block["anchors"][1:]:
                    if part.get("continuation_reason") not in ("hyphen", "floating", "list"):
                        self.assertFalse(part.get("paragraph_gap"))
                    if part.get("continuation_reason") != "hyphen" and not part.get("inherited_indent"):
                        self.assertFalse(part.get("first_indent"))

    def region(self, name, page, kind, expected):
        rows = [b for b in self.samples[name][0]["blocks"] if b["page"] == page and b["type"] == kind]
        box = pymupdf.Rect(expected)
        match = next((r for r in rows if area(pymupdf.Rect(r["bbox"]) & box) >= area(box) * 0.96), None)
        self.assertIsNotNone(match, "The figure/table must include the complete structural region")
        self.assertTrue(match["figure_text"])

    def test_babeldoc_structure(self):
        self.verify(NAMES[0])
        self.region(NAMES[0], 3, "figure", [78, 75, 283, 328])

    def test_yakubenko_structure(self):
        self.verify(NAMES[1])
        self.region(NAMES[1], 4, "table", [50, 406, 545, 579])

    def test_s41524_structure(self):
        self.verify(NAMES[2])
        self.region(NAMES[2], 6, "table", [101, 345, 501, 524])

    def text_owner(self, name, page, point):
        return next(
            b
            for b in self.samples[name][0]["blocks"]
            if b["type"] == "text"
            and any(a["page"] == page and pymupdf.Rect(a["bbox"]).contains(pymupdf.Point(*point)) for a in b["anchors"])
        )

    def test_babeldoc_word_break_and_float_continuation_share_one_paragraph(self):
        first = self.text_owner(NAMES[0], 2, (330, 607))
        self.assertIs(first, self.text_owner(NAMES[0], 2, (330, 620)))
        self.assertIs(first, self.text_owner(NAMES[0], 3, (110, 438)))
        rows = self.samples[NAMES[0]][0]["blocks"]
        figure = next(
            b for b in rows if b["type"] == "figure" and b["page"] == 3 and b["bbox"][1] < 80 and b["bbox"][3] > 328
        )
        self.assertLess(rows.index(first), rows.index(figure))
        self.assertTrue(sentence_end(first["text"]))
        self.assertTrue(any(c["reason"] == "floating" for c in first["continuations"]))

    def test_yakubenko_justified_line_and_column_continuation_remain_in_source_order(self):
        paragraph = self.text_owner(NAMES[1], 2, (100, 609))
        self.assertIs(paragraph, self.text_owner(NAMES[1], 2, (330, 539)))
        self.assertIs(paragraph, self.text_owner(NAMES[1], 2, (400, 550)))
        whole_line = [
            r
            for r in paragraph["source_lines"]
            if 545 < r["bbox"][1] < 547 and r["bbox"][0] > 300 and r["bbox"][2] > 548
        ]
        self.assertEqual(len(whole_line), 1)
        self.assertGreaterEqual(len(whole_line[0]["text"].split()), 4)
        self.assertEqual([a["page"] for a in paragraph["anchors"][:2]], [2, 2])
        self.assertLess(paragraph["anchors"][0]["bbox"][0], paragraph["anchors"][1]["bbox"][0])

    def test_real_samples_leave_no_split_word_or_unjustified_short_prose_block(self):
        for name, (doc, raw) in self.samples.items():
            with self.subTest(sample=name):
                previous = None
                for row in doc["blocks"]:
                    if row["type"] in ("header", "footer", "figure", "table", "caption", "footnote"):
                        continue
                    if previous and row["type"] == "text" and re.match(r"^[a-z]", row["text"]):
                        self.assertIsNone(re.search(r"[A-Za-z]-$", previous["text"]))
                    previous = row if row["type"] in ("text", "list") else None
                    if (
                        row["type"] not in ("text", "heading")
                        or len(row["text"].split()) > 3
                        or sentence_end(row["text"])
                    ):
                        continue
                    self.assertEqual(row["type"], "heading", row["text"])
                    proof = row.get("heading_evidence")
                    self.assertIsNotNone(proof, row["text"])
                    self.assertTrue(proof["size_ratio"] > 1.08 or proof["weight_change"])
                    self.assertGreater(proof["after_gap"], proof["normal_gap"])
                    after = next(r for r in raw[row["page"] - 1][2] if r["bbox"] == proof["next_bbox"])
                    last = row["source_lines"][-1]
                    self.assertAlmostEqual(after["bbox"][1] - last["bbox"][3], proof["after_gap"], places=4)
