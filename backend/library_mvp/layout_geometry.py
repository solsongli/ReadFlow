"""Unrotated, CropBox-relative page geometry and native line ownership."""
import pymupdf as fitz


def area(box):
    return max(0, box.width) * max(0, box.height)


def overlap(a, b):
    return area(fitz.Rect(a) & fitz.Rect(b))


def free_rects(box, obstacles):
    rects = [fitz.Rect(box)]
    for obstacle in obstacles:
        next_rects = []
        for rect in rects:
            hit = rect & fitz.Rect(obstacle)
            if area(hit) <= 1 or min(hit.width, hit.height) < 0.3:
                next_rects.append(rect)
                continue
            choices = [
                fitz.Rect(rect.x0, rect.y0, rect.x1, hit.y0),
                fitz.Rect(rect.x0, hit.y1, rect.x1, rect.y1),
                fitz.Rect(rect.x0, hit.y0, hit.x0, hit.y1),
                fitz.Rect(hit.x1, hit.y0, rect.x1, hit.y1),
            ]
            next_rects.extend(r for r in choices if r.width > 4 and r.height > 2)
        rects = next_rects
    return sorted(rects, key=lambda r: (r.y0, r.x0))


def native_lines(page):
    lines = [
        line
        for block in page.get_text("rawdict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]
        for line in block.get("lines", [])
    ]
    for line in lines:
        for span in line["spans"]:
            span["text"] = "".join(c["c"] for c in span["chars"])
    return lines


def owned_lines(box, lines, obstacles):
    # Native PDF lines can span several labels/columns. Group only their owned
    # contiguous glyphs; never erase an entire shared line for one short label.
    result = []
    x0, y0, x1, y1 = box

    def intersection(a, b):
        return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))

    for line in lines:
        if intersection(line["bbox"], box) <= 0:
            continue
        group = None
        for span in line["spans"]:
            for char in span["chars"]:
                rect = char["bbox"]
                cx, cy = (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2
                size = max(0, rect[2] - rect[0]) * max(0, rect[3] - rect[1])
                owned = (
                    x0 <= cx <= x1
                    and y0 <= cy <= y1
                    and intersection(rect, box) >= size * 0.5
                    and not any(intersection(rect, obstacle) > size * 0.2 for obstacle in obstacles)
                )
                if not owned:
                    if group is not None:
                        result.extend(free_rects(fitz.Rect(group) & box, obstacles))
                        group = None
                    continue
                if group is not None and rect[0] - group[2] > max(8, (rect[3] - rect[1]) * 2):
                    result.extend(free_rects(fitz.Rect(group) & box, obstacles))
                    group = None
                group = (
                    list(rect)
                    if group is None
                    else [
                        min(group[0], rect[0]),
                        min(group[1], rect[1]),
                        max(group[2], rect[2]),
                        max(group[3], rect[3]),
                    ]
                )
        if group is not None:
            result.extend(free_rects(fitz.Rect(group) & box, obstacles))
    return result


def residual_counts(lines, masks):
    # Y bands avoid an all-glyphs × all-redactions scan and PyMuPDF Point allocation.
    bands = {}
    for rect in masks:
        for band in range(int(rect.y0 // 32), int(rect.y1 // 32) + 1):
            bands.setdefault(band, []).append(tuple(rect))
    visible = zero = 0
    for line in lines:
        for span in line["spans"]:
            for char in span["chars"]:
                if not char["c"].strip():
                    continue
                a, b, c, d = char["bbox"]
                x, y = (a + c) / 2, (b + d) / 2
                if any(l <= x <= r and t <= y <= bottom for l, t, r, bottom in bands.get(int(y // 32), [])):
                    if (c - a) * (d - b) < 0.001:
                        zero += 1
                    else:
                        visible += 1
    return visible, zero


def text_color(box, lines, exact=True):
    values = [
        (len(s["text"]), s.get("color", 0))
        for line in lines
        if overlap(line["bbox"], box) > 0
        for s in line["spans"]
        if not exact or overlap(s["bbox"], box) > 0
    ]
    color = max(values, default=(0, 0))[1]
    return f"rgb({color >> 16 & 255},{color >> 8 & 255},{color & 255})"


def visible_images(page):
    bounds = fitz.Rect(0, 0, page.cropbox.width, page.cropbox.height)
    resources = page.get_images(full=True)
    all_in_forms = resources and all(row[-1] for row in resources)
    clips = (
        [fitz.Rect(d["scissor"]) for d in page.get_drawings(extended=True) if d["type"] == "clip"]
        if all_in_forms
        else []
    )
    return [
        fitz.Rect(image["bbox"])
        for image in page.get_image_info()
        if bounds.intersects(fitz.Rect(image["bbox"]))
        and (not clips or any(clip.intersects(fitz.Rect(image["bbox"])) for clip in clips))
    ]
