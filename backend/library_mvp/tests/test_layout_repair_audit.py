"""The corpus accepts exactly declared removals, never an unexplained vector loss."""
from copy import deepcopy
import unittest
import pymupdf as fitz
from backend.library_mvp.layout_decorations import drawing_signature
from ops.development.layout_repair_audit import drawing_mismatch


class DrawingIntegrityAudit(unittest.TestCase):
    def test_only_the_declared_decoration_is_allowed_to_disappear(self):
        with fitz.open() as pdf:
            page = pdf.new_page()
            page.draw_line((30, 50), (60, 50), width=0.4)
            page.draw_line((30, 100), (300, 100), width=0.4)
            drawings = page.get_drawings()
            record = {"decorations": [{"signature": drawing_signature(drawings[0])}]}
            self.assertFalse(drawing_mismatch(drawings, drawings[1:], record))
            self.assertTrue(drawing_mismatch(drawings, [], record))
            self.assertTrue(drawing_mismatch(drawings, drawings[1:], {}))

    def test_rounding_boundary_is_tolerated_but_shape_and_color_changes_are_not(self):
        with fitz.open() as pdf:
            page = pdf.new_page()
            page.draw_line((30, 100.425), (300, 100.425), width=0.4)
            original = page.get_drawings()
            close = deepcopy(original)
            a, b = close[0]["items"][0][1:]
            close[0]["items"][0] = ("l", fitz.Point(a.x, a.y + 0.00003), fitz.Point(b.x, b.y + 0.00003))
            close[0]["rect"] += (0, 0.00003, 0, 0.00003)
            self.assertFalse(drawing_mismatch(original, close, {}))
            moved = deepcopy(close)
            moved[0]["rect"] += (0, 1, 0, 1)
            self.assertTrue(drawing_mismatch(original, moved, {}))
            recolored = deepcopy(original)
            recolored[0]["color"] = (0, 1, 0)
            self.assertTrue(drawing_mismatch(original, recolored, {}))
