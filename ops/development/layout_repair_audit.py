"""Only declared decoration paths and link rectangles may differ from the source."""
from collections import Counter
import re
import pymupdf as fitz
from backend.library_mvp.layout_decorations import drawing_signature


def similar_drawing(left, right):
    def similar(a, b):
        if isinstance(a, (fitz.Point, fitz.Rect, fitz.Quad, tuple, list)):
            return (
                isinstance(b, (fitz.Point, fitz.Rect, fitz.Quad, tuple, list))
                and len(a) == len(b)
                and all(similar(x, y) for x, y in zip(a, b))
            )
        if isinstance(a, (float, int)) and isinstance(b, (float, int)):
            return abs(a - b) <= 0.02
        return a == b

    return all(
        similar(left.get(k), right.get(k))
        for k in (
            "type",
            "items",
            "rect",
            "width",
            "color",
            "fill",
            "closePath",
            "even_odd",
            "fill_opacity",
            "stroke_opacity",
            "lineCap",
            "lineJoin",
        )
    )


def drawing_mismatch(original, target, record):
    expected = Counter(drawing_signature(d) for d in original)
    removed = Counter(d["signature"] for d in record.get("decorations", []))
    actual = Counter(drawing_signature(d) for d in target)
    if removed - expected or len(original) - len(target) != sum(removed.values()):
        return True
    missing, added = (expected - removed) - actual, actual - (expected - removed)
    before, after = [], []
    for drawings, counts, values in ((original, missing, before), (target, added, after)):
        for drawing in drawings:
            key = drawing_signature(drawing)
            if counts[key]:
                values.append(drawing)
                counts[key] -= 1
    # Quantized hashes can straddle a rounding boundary after a harmless
    # 0.00002pt stream rewrite. Compare only the unmatched paths with tolerance.
    for drawing in before:
        index = next((i for i, candidate in enumerate(after) if similar_drawing(drawing, candidate)), None)
        if index is None:
            return True
        after.pop(index)
    return bool(after)


def border(pdf, xref):
    values = {}
    for key in ("Border", "BS/W", "BS/S", "BS/D", "C"):
        kind, text = pdf.xref_get_key(xref, key)
        values[key] = (
            tuple(float(v) for v in re.findall(r"[-+]?\d+(?:\.\d+)?", text))
            if kind in {"array", "int", "real"}
            else text
        )
    return values


def link_mismatches(left, right, record):
    original, target = left.get_links(), right.get_links()
    if len(original) != len(target):
        return 1, 1
    plans = {r["xref"]: r for r in record.get("links", [])}
    geometry = borders = 0
    for source, output in zip(original, target):
        clean = lambda link: {k: str(v) for k, v in link.items() if k not in {"xref", "id", "from"}}
        plan = plans.get(source["xref"], {"status": "unaffected"})
        expected = (
            fitz.Rect(plan["rect"]) * right.rotation_matrix
            if plan["status"] == "reanchored"
            else source["from"]
        )
        geometry += (
            clean(source) != clean(output) or max(abs(a - b) for a, b in zip(expected, output["from"])) > 0.05
        )
        before, after = border(left.parent, source["xref"]), border(right.parent, output["xref"])
        if plan["status"] == "border_hidden":
            borders += not (
                after["Border"] == (0, 0, 0)
                and after["BS/W"] == (0,)
                and right.parent.xref_get_key(output["xref"], "AP")[0] == "null"
            )
        else:
            borders += before != after
    return geometry, borders
