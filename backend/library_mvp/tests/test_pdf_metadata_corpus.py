"""Read-only public arXiv corpus. Metadata is cleared only in in-memory documents."""
import os
from pathlib import Path
import unittest
import pymupdf as fitz
from backend.library_mvp.pdf_metadata import suggest_pdf_metadata


class PdfMetadataCorpusTests(unittest.TestCase):
    def test_seven_first_pages_without_embedded_metadata(self):
        root = os.environ.get("READFLOW_CORPUS_DIR")
        if not root or not Path(root).is_dir():
            self.skipTest("Set READFLOW_CORPUS_DIR to the read-only public arXiv corpus")
        cases = {
            "1706.03762": ("Attention Is All You Need", "Ashish Vaswani", 8),
            "2303.04137": ("Diffusion Policy: Visuomotor Policy Learning via Action Diffusion", "Cheng Chi", 8),
            "2304.02643": ("Segment Anything", "Alexander Kirillov", 12),
            "2304.13705": (
                "Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware",
                "Tony Z. Zhao",
                4,
            ),
            "2307.15818": (
                "RT-2: Vision-Language-Action Models Transfer Web Knowledge to Robotic Control",
                "Anthony Brohan",
                54,
            ),
            "2406.09246": ("OpenVLA: An Open-Source Vision-Language-Action Model", "Moo Jin Kim", 18),
            "2410.24164": ("π0: A Vision-Language-Action Flow Model for General Robot Control", "Kevin Black", 24),
        }
        for name, (title, first, count) in cases.items():
            with self.subTest(paper=name):
                path = Path(root) / (name + ".pdf")
                self.assertFalse(any(p.is_symlink() for p in [path, *path.parents]))
                with fitz.open(path) as pdf:
                    pdf.set_metadata({})
                    result = suggest_pdf_metadata(pdf, path.name)
                self.assertEqual(result["fields"]["title"], title)
                self.assertEqual(result["fields"]["authors"][0], first)
                self.assertEqual(len(result["fields"]["authors"]), count)
                self.assertEqual(result["fields"]["doi"], "10.48550/arXiv." + name)
                self.assertEqual(result["fields"]["date"], "20" + name[:2])
                self.assertGreaterEqual(result["title"]["confidence"], 0.85)
                self.assertGreaterEqual(result["authors"]["confidence"], 0.85)

    def test_pi_title_from_actual_embedded_metadata_is_unicode(self):
        root = os.environ.get("READFLOW_CORPUS_DIR")
        if not root or not Path(root).is_dir():
            self.skipTest("Set READFLOW_CORPUS_DIR to the read-only public arXiv corpus")
        path = Path(root) / "2410.24164.pdf"
        self.assertFalse(any(p.is_symlink() for p in [path, *path.parents]))
        with fitz.open(path) as pdf:
            result = suggest_pdf_metadata(pdf, path.name)
        self.assertTrue(result["fields"]["title"].startswith("π₀:"))
        self.assertNotIn("$", result["fields"]["title"])
        self.assertNotIn("\\", result["fields"]["title"])
        self.assertEqual(result["fields"]["date"], "2024")
