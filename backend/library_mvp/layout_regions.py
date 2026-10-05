"""Protect ruled tables even when an older block cache misclassified their cells."""
import re
import pymupdf as fitz
from .layout_geometry import area


def ruled_tables(page, regions):
    captions = [
        fitz.Rect(r["bbox"])
        for r in regions
        if r["type"] == "caption" and re.match(r"\s*(?:Table\b|表\s*\d)", r.get("text", ""), re.I)
    ]
    if not captions:
        return []
    groups = []
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] != "l":
                continue
            a, b = item[1:3]
            if abs(a.y - b.y) > 0.5 or abs(a.x - b.x) < 60:
                continue
            x0, x1 = sorted((a.x, b.x))
            group = next((g for g in groups if abs(g[0] - x0) < 2 and abs(g[1] - x1) < 2), None)
            if group is None:
                group = [x0, x1, []]
                groups.append(group)
            group[2].append((a.y + b.y) / 2)
    found = []
    for x0, x1, values in groups:
        rows = sorted(set(round(y, 2) for y in values))
        for start in range(len(rows) - 2):
            top, separator = rows[start : start + 2]
            if not 4 <= separator - top <= 35:
                continue
            # At most one table for a header: choose the closest matching caption.
            candidates = []
            for bottom in rows[start + 2 :]:
                if not 20 < bottom - top < page.cropbox.height * 0.75:
                    continue
                for caption in captions:
                    distance = min(abs(caption.y0 - bottom), abs(top - caption.y1))
                    if distance < 24 and caption.x0 < x1 and caption.x1 > x0:
                        candidates.append((distance, fitz.Rect(x0, top, x1, bottom)))
            if not candidates:
                continue
            box = min(candidates, key=lambda c: c[0])[1]
            if any(
                r["type"] in {"table", "figure", "algorithm", "code"}
                and area(box & fitz.Rect(r["bbox"])) > area(box) * 0.65
                for r in regions
            ):
                continue
            if not any(area(box & old) > area(box) * 0.65 for old in found):
                found.append(box)
    return found
