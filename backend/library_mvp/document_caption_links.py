"""Caption ownership uses column overlap and conventional figure/table placement."""
import pymupdf as fitz
from .paper_blocks_model import CAPTION


def region_caption(region, rows):
    box = fitz.Rect(region["bbox"])
    choices = []
    for row in rows:
        if row["type"] != "caption":
            continue
        match = CAPTION.match(row.get("text", ""))
        if match and ("table" if match[1].casefold() in {"table", "表"} else "figure") != region["type"]:
            continue
        caption = fitz.Rect(row["bbox"])
        overlap = min(box.x1, caption.x1) - max(box.x0, caption.x0)
        if overlap < min(box.width, caption.width) * 0.5:
            continue
        below, above = caption.y0 - box.y1, box.y0 - caption.y1
        preferred = above if region["type"] == "table" else below
        distance = min(abs(above), abs(below))
        if distance > 45:
            continue
        choices.append((0 if -5 <= preferred <= 45 else 1, distance, row))
    return min(choices, key=lambda c: c[:2])[2] if choices else None


def bounded_evidence(image, region, regions, rows, caption):
    """A vector cluster covering separately captioned regions is not one spanning figure."""
    native, box = fitz.Rect(image["bbox"]), fitz.Rect(region["bbox"])
    if caption is None:
        return native
    for other in regions:
        if other is region or other["type"] not in {"figure", "table"} or other["confidence"] < 0.7:
            continue
        area = fitz.Rect(other["bbox"])
        if area.intersects(box) or not area.intersects(native):
            continue
        owner = region_caption(other, rows)
        if owner is not None and owner is not caption:
            return native & box
    return native
