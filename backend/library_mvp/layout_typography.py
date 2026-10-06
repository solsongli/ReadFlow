"""Per-column type planning and bounded paragraph occupancy, independent of PDF writing."""
from collections import defaultdict
from statistics import median
import math
import pymupdf as fitz
from .layout_geometry import area

VERSION = "balanced-x10-1"
BODY = frozenset({"text", "abstract", "list"})
MIN_SCALE = 0.55
MAX_LEADING = 1.7


def category(task):
    kind = task.get("type", "text")
    if kind in BODY:
        return "body"
    if kind in {"title", "heading"}:
        return f"{kind}:{round(task['size'] * 2) / 2}"
    return kind


def column(task, width, two_columns):
    box = fitz.Rect(task["box"])
    if not two_columns or box.width > width * 0.56:
        return "full"
    return "left" if (box.x0 + box.x1) / 2 < width / 2 else "right"


def page_groups(tasks, width):
    widths = [fitz.Rect(t["box"]).width for t in tasks if t.get("type") in BODY and not t["label"]]
    two_columns = bool(widths and median(widths) < width * 0.48)
    return {id(t): (column(t, width, two_columns), category(t)) for t in tasks}


def uniform_sizes(samples):
    """An exceptional long/one-line block never dictates the surrounding font.

    samples: source size, maximum estimated fitting size, and group. The
    regular pool excludes blocks substantially tighter than their peers. A minority
    of tight rectangles use their own smaller size and are recorded separately.
    """
    grouped = defaultdict(list)
    for sample in samples:
        grouped[sample["group"]].append(sample)
    result = {}
    for key, rows in grouped.items():
        source = median(r["source"] for r in rows)
        typical = median(min(1, r["capacity"] / r["source"]) for r in rows)
        cutoff = max(MIN_SCALE, typical * 0.85)
        if isinstance(key, tuple) and key[-1] == "body":
            # Short one-line anchors have a tight glyph envelope. They are
            # local geometric exceptions, not the surrounding prose style.
            cutoff = max(0.8, cutoff)
        regular = [min(r["source"], r["capacity"]) for r in rows if r["capacity"] >= r["source"] * cutoff]
        sizes = sorted(regular)
        if sizes:
            # A single unusually long block does not lower the whole column.
            planned = sizes[int((len(sizes) - 1) * 0.25)]
        else:
            planned = source
        result[key] = max(source * MIN_SCALE, min(source, planned))
    return result


def capacity(size, height, glyph_height, lines):
    if height >= glyph_height:
        return size
    ratio = max(MIN_SCALE, min(1, height / max(0.01, glyph_height)))
    # Shrinking a multiline paragraph reduces both line count and line height.
    return size * (math.sqrt(ratio) if lines > 1 else ratio)


def allocate_leading(height, size, lines, glyph_height, baseline=1.05):
    if size <= 0 or lines < 2:
        return baseline
    last_line_height = max(size, glyph_height - (lines - 1) * size * baseline)
    visual = (height - last_line_height) / ((lines - 1) * size)
    # Story must fit the final line box, not just its ink/glyph bounds. The
    # compensated top padding is (.875 - leading / 2) em in balanced CSS.
    story = (height / size - 0.875) / (lines - 0.5)
    return max(baseline, min(MAX_LEADING, visual, story - 0.002))


def source_style(task, lines, center=None):
    """Infer alignment/indents from owned native spans, without another get_text."""
    box = fitz.Rect(task["box"])
    owned = []
    for line in lines:
        a, b, c, d = line["bbox"]
        if c <= box.x0 or a >= box.x1 or d <= box.y0 or b >= box.y1:
            continue
        spans = [
            s
            for s in line["spans"]
            if box.x0 <= s["origin"][0] <= box.x1
            and box.y0 <= s["origin"][1] <= box.y1
            or area(box & fitz.Rect(s["bbox"])) > area(fitz.Rect(s["bbox"])) * 0.6
        ]
        if not spans:
            continue
        rect = fitz.Rect(spans[0]["bbox"])
        for span in spans[1:]:
            rect |= fitz.Rect(span["bbox"])
        owned.append(rect & box)
    # Different PDF font runs belonging to one baseline count as one line.
    rows = []
    for rect in sorted(owned, key=lambda r: (round(r.y0, 1), r.x0)):
        if rows and abs(rect.y0 - rows[-1].y0) < task["size"] * 0.3:
            rows[-1] |= rect
        else:
            rows.append(rect)
    kind = task.get("type")
    aligned_center = center is not None and abs((box.x0 + box.x1) / 2 - center) < task["size"] * 1.5
    alignment, indent = ("center" if kind in {"title", "heading"} and aligned_center else "left"), 0
    if len(rows) > 1:
        centered = all(abs((r.x0 + r.x1) / 2 - (box.x0 + box.x1) / 2) < task["size"] for r in rows)
        if kind in {"title", "heading"} and centered and (aligned_center or center is None):
            alignment = "center"
        elif (
            alignment != "center"
            and sum(abs(r.x1 - box.x1) < task["size"] * 0.6 for r in rows[:-1]) >= len(rows[:-1]) * 0.65
        ):
            alignment = "justify"
        start = min(r.x0 for r in rows[1:])
        delta = rows[0].x0 - start
        if alignment != "center" and task["size"] * 0.3 < abs(delta) < task["size"] * 3:
            indent = delta
    return {"align": alignment, "indent": indent, "source_lines": len(rows), "category": category(task)}
