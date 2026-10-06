"""Cached geometric padding must not turn a neighbouring caption or shared line into an obstacle."""
import pymupdf as fitz
from .layout_geometry import area, overlap, free_rects
from .layout_text import TRANSLATABLE


def source_boxes(block, anchor):
    box = fitz.Rect(anchor["bbox"])
    return [
        list(fitz.Rect(r["bbox"]) & box)
        for r in block.get("source_lines", [])
        if "bbox" in r
        if area(fitz.Rect(r["bbox"]) & box) > area(fitz.Rect(r["bbox"])) * 0.7
    ]


def bounded_tables(page, regions):
    captions = [r for r in regions if r["type"] == "caption"]
    rules = []
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] != "l":
                continue
            a, b = item[1:3]
            if abs(a.y - b.y) < 0.5 and abs(a.x - b.x) > 50:
                rules.append(
                    fitz.Rect(min(a.x, b.x), min(a.y, b.y) - 0.01, max(a.x, b.x), max(a.y, b.y) + 0.01)
                )
    result = []
    for region in regions:
        box = fitz.Rect(region["bbox"])
        caption = next((r for r in captions if r["id"] == region.get("caption_id")), None)
        if region["type"] != "table" or caption is None:
            result.append(region)
            continue
        cap = fitz.Rect(caption["bbox"])
        band = fitz.Rect(box)
        peers = [
            fitz.Rect(r["bbox"])
            for r in captions
            if r is not caption
            and overlap(r["bbox"], [box.x0, r["bbox"][1], box.x1, r["bbox"][3]])
            > area(fitz.Rect(r["bbox"])) * 0.5
        ]
        if cap.y0 > (box.y0 + box.y1) / 2:
            band.y1 = min(band.y1, cap.y0 - 0.5)
            band.y0 = max([band.y0] + [r.y1 + 0.5 for r in peers if band.y0 < r.y1 < cap.y0])
        else:
            band.y0 = max(band.y0, cap.y1 + 0.5)
            band.y1 = min([band.y1] + [r.y0 - 0.5 for r in peers if cap.y1 < r.y0 < band.y1])
        grid = [
            r
            for r in rules
            if band.y0 - 1 <= r.y0 <= band.y1 + 1
            and box.x0 - 8 <= r.x0
            and r.x1 <= box.x1 + 8
            and r.width > box.width * 0.5
        ]
        if len(grid) >= 2:
            candidate = fitz.Rect(grid[0])
            for rule in grid[1:]:
                candidate |= rule
            if candidate.height > 12:
                box = (candidate + (-0.4, -0.4, 0.4, 0.4)) & band
        result.append({**region, "bbox": list(box)})
    return result


def region_obstacles(box, task, regions, tables):
    parent = next((r for r in regions if r["id"] == task.get("parent")), None)
    own = next((r for r in regions if r["id"] == task["id"] and r["bbox"] == task["box"]), None)
    obstacles = list(tables)
    for region in regions:
        if region["id"] in {task["id"], task.get("parent")} or not fitz.Rect(region["bbox"]).intersects(box):
            continue
        if parent and fitz.Rect(parent["bbox"]).contains(fitz.Rect(region["bbox"])):
            continue
        # Physical source rows retain partial first/last lines. A paragraph's
        # bounding rectangle also contains whitespace that does not own glyphs.
        if region["type"] in TRANSLATABLE and region.get("line_boxes") and own and shares_row(own, region):
            obstacles.extend(region["line_boxes"])
        else:
            obstacles.append(region["bbox"])
    return obstacles


def shares_row(first, second):
    for a in first.get("line_boxes", []):
        for b in second.get("line_boxes", []):
            ra, rb = fitz.Rect(a), fitz.Rect(b)
            if abs((ra.y0 + ra.y1 - rb.y0 - rb.y1) / 2) < min(ra.height, rb.height) * 0.25:
                gap = max(ra.x0, rb.x0) - min(ra.x1, rb.x1)
                if -1 <= gap < max(ra.height, rb.height) * 15:
                    return True
    return False


def overlap_policy(regions):
    rows = [r for r in regions if r["type"] in TRANSLATABLE and r.get("line_boxes")]
    return any(
        fitz.Rect(a["bbox"]).intersects(fitz.Rect(b["bbox"])) and not shares_row(a, b)
        for i, a in enumerate(rows)
        for b in rows[i + 1 :]
        if a["id"] != b["id"]
    )


def flow_slots(box, obstacles, native, size):
    rectangles = free_rects(box, obstacles)
    changed = True
    while changed:
        changed = False
        for i, first in enumerate(rectangles):
            for j, second in enumerate(rectangles[i + 1 :], i + 1):
                width = min(first.x1, second.x1) - max(first.x0, second.x0)
                if abs(first.y1 - second.y0) < 0.02 and width >= max(first.width, second.width) * 0.95:
                    merged = fitz.Rect(
                        max(first.x0, second.x0), first.y0, min(first.x1, second.x1), second.y1
                    )
                    rectangles = [r for k, r in enumerate(rectangles) if k not in {i, j}] + [merged]
                    rectangles.sort(key=lambda r: (r.y0, r.x0))
                    changed = True
                    break
            if changed:
                break
    slots = [r for r in rectangles if r.width > 4 and r.height >= max(2, size * 0.55 * 1.49)]
    full = [r for r in slots if r.width >= box.width * 0.95 and r.height >= box.height * 0.5]
    if box.height <= size * 2 or not full:
        return slots
    # A narrow shared first/last row is optional; a contiguous full-width
    # body is not. Start on the next complete source row rather than assigning
    # a tiny isolated fragment its own proportional share of the paragraph.
    partial = [
        r
        for r in slots
        if r.width < box.width * 0.95
        and r.height < box.height * 0.35
        and (r.y0 <= box.y0 + size * 1.5 or r.y1 >= box.y1 - size * 1.5)
    ]
    if not partial:
        return slots
    kept = [r for r in slots if r not in partial]
    for slot in kept:
        rows = [r for r in native if r.width > box.width * 0.55 and slot.contains((r.tl + r.br) / 2)]
        if rows and any(p.y1 <= slot.y0 + 0.5 for p in partial):
            slot.y0 = max(slot.y0, min(r.y0 for r in rows))
        if rows and any(p.y0 >= slot.y1 - 0.5 for p in partial):
            slot.y1 = min(slot.y1, max(r.y1 for r in rows))
    return kept
