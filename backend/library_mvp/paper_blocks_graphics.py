"""Caption-bounded vector/bitmap regions and locally retained, untranslated figure labels."""
import pymupdf as fitz
from . import paper_blocks_model as model


def area(rect):
    return max(0, rect.width) * max(0, rect.height)


def union_components(rectangles):
    groups = []
    for box in rectangles:
        merged = True
        while merged:
            hits = [r for r in groups if (r + (-5, -5, 5, 5)).intersects(box)]
            merged = bool(hits)
            for r in hits:
                box |= r
                groups.remove(r)
        groups.append(box)
    return groups


def graphics(page, rows):
    rectangles = []
    for image in page.get_image_info():
        box = fitz.Rect(image["bbox"]) & page.rect
        if box.width > 18 and box.height > 18:
            rectangles.append(box)
    for drawing in page.get_drawings()[:12000]:
        fill = drawing.get("fill")
        if (
            drawing.get("type") == "f"
            and fill
            and all(channel > 0.98 for channel in fill)
            and drawing["rect"].width > page.rect.width * 0.8
        ):
            continue  # A page-wide white backing is not evidence of figure bounds.
        box = (drawing["rect"] + (-0.4, -0.4, 0.4, 0.4)) & page.rect
        if (
            box.is_empty
            or box.width > page.rect.width * 0.95
            and (box.height < 2 or box.height > page.rect.height * 0.9)
        ):
            continue
        rectangles.append(box)
    candidates = union_components(rectangles)
    candidates = [r for r in candidates if not (r.y1 < page.rect.height * 0.05 and r.height < 25)]
    output = []
    captions = [r for r in rows if r["type"] == "caption"]
    for caption in captions:
        box = fitz.Rect(caption["bbox"])
        match = model.CAPTION.match(caption["text"])
        if not match:
            continue  # A cross-column continuation belongs to its original caption.
        kind = "table" if match.group(1).lower() in ("table", "表") else "figure"
        middle = page.rect.width / 2
        left, right = (
            (0, page.rect.width)
            if box.x0 < middle < box.x1
            else ((0, middle) if box.x1 <= middle else (middle, page.rect.width))
        )

        def aligned(r):
            return r.x0 >= left - 3 and r.x1 <= right + 3 and min(r.x1, box.x1) > max(r.x0, box.x0)

        barriers = [
            fitz.Rect(r["bbox"])
            for r in rows
            if r is not caption
            and r["type"] not in ("header", "footer")
            and aligned(fitz.Rect(r["bbox"]))
            and r["bbox"][3] <= box.y0
            and (r["type"] == "caption" or r.get("size", 0) >= caption["size"] * 0.93 and len(r["text"]) > 45)
        ]
        top = max((r.y1 for r in barriers), default=0)
        above = [
            r
            for r in candidates
            if aligned(r) and r.y0 >= top - 2 and r.y1 <= box.y0 + 1 and r.width > 10 and r.height > 3
        ]
        # Tables may put their caption above the grid.
        below = (
            [r for r in candidates if aligned(r) and 0 <= r.y0 - box.y1 < 25 and r.width > 30 and r.height > 15]
            if kind == "table"
            else []
        )
        rules = sorted(
            [
                r
                for r in candidates
                if kind == "table" and aligned(r) and r.height < 3 and r.width > 30 and 0 <= box.y0 - r.y1 < 300
            ],
            key=lambda r: -r.y1,
        )
        grid = []
        for rule in rules:
            if not grid or (
                grid[-1].y0 - rule.y1 < 100 and abs(grid[-1].x0 - rule.x0) < 15 and abs(grid[-1].x1 - rule.x1) < 15
            ):
                grid.append(rule)
            else:
                break
        enclosing = [
            r for r in candidates if kind == "table" and aligned(r) and r.contains(box) and box.y1 - r.y0 < 55
        ]
        if enclosing:
            regions = [fitz.Rect(r.x0, box.y1 + 1, r.x1, r.y1) for r in enclosing]
        elif len(grid) >= 2:
            regions = grid
        elif below and (not above or min(r.y0 - box.y1 for r in below) < min(box.y0 - r.y1 for r in above)):
            regions = below
        else:
            regions = above
        if not regions:
            continue
        region = fitz.Rect(regions[0])
        for other in regions[1:]:
            region |= other
        if kind == "table" and region.y1 < box.y0:
            # A grid need not draw a bottom border: include its trailing cell rows before the caption.
            tail = [
                r
                for r in rows
                if r["type"] in ("text", "heading")
                and r.get("size", 0) <= caption["size"] * 1.05
                and r["bbox"][0] >= region.x0 - 3
                and r["bbox"][2] <= region.x1 + 3
                and region.y1 <= r["bbox"][1]
                and r["bbox"][3] < box.y0
            ]
            for row in tail:
                region |= fitz.Rect(row["bbox"])
        if region.width < 25 or region.height < 15:
            continue
        if any(area(region & fitz.Rect(r["bbox"])) > area(region) * 0.85 for r in output):
            continue
        output.append(
            {
                "type": kind,
                "bbox": list(region),
                "text": "",
                "math_parts": [],
                "caption_text": caption["text"],
                "caption_bbox": caption["bbox"],
            }
        )
    for region in candidates:
        for caption in captions:
            box = fitz.Rect(caption["bbox"])
            if (
                model.CAPTION.match(caption["text"])
                and region.intersects(box)
                and region.y0 + 20 < box.y0 < region.y1
                and min(region.x1, box.x1) - max(region.x0, box.x0) > min(region.width, box.width) * 0.6
            ):
                region = fitz.Rect(region.x0, region.y0, region.x1, box.y0 - 0.5)
                break
        if (
            region.width > 45
            and region.height > 35
            and not any(fitz.Rect(r["bbox"]).intersects(region) for r in output)
            and not any(r["type"] == "abstract" and region.contains(fitz.Rect(r["bbox"])) for r in rows)
        ):
            output.append({"type": "figure", "bbox": list(region), "text": "", "math_parts": []})
    return output


def assign_figure_text(rows, images, words=None):
    for image in images:
        image["figure_text"] = []
    output = []
    for row in rows:
        if row["type"] in ("header", "footer", "caption", "title", "abstract"):
            output.append(row)
            continue
        groups, current = [], []
        source = row.get("source_lines", [row])
        for line in source:
            box = fitz.Rect(line["bbox"])
            target = next(
                (image for image in images if area(fitz.Rect(image["bbox"]) & box) >= area(box) * 0.65), None
            )
            if target:
                target["figure_text"].append(
                    {
                        "text": line["text"],
                        "bbox": line["bbox"],
                        "font": line.get("font"),
                        "size": line["size"],
                        "source": line.get("source", row.get("source", "native_text")),
                    }
                )
                if current:
                    groups.append(current)
                    current = []
            else:
                current.append(line)
        if current:
            groups.append(current)
        if len(groups) == 1 and len(groups[0]) == len(source):
            output.append(row)
            continue
        for group in groups:
            box, text = fitz.Rect(group[0]["bbox"]), group[0]["text"]
            for line in group[1:]:
                box |= fitz.Rect(line["bbox"])
                text = model.joined(text, line["text"], words)
            output.append(
                {
                    **row,
                    "text": text,
                    "bbox": list(box),
                    "source_lines": group,
                    "last_line": group[-1]["bbox"],
                    "paragraph_gap": True,
                }
            )
    return output
