"""Conservative removal of isolated text-decoration paths, never general diagram strokes."""
from collections import Counter
import json
import hashlib
import pymupdf as fitz
from .layout_geometry import overlap
from .paper_blocks_model import MATH_FONT
from .layout_incremental import graft_content

PROTECTED = frozenset({"figure", "table", "formula", "algorithm", "code", "header", "footer"})


def drawing_signature(drawing):
    def numbers(value):
        if isinstance(value, (fitz.Point, fitz.Rect, fitz.Quad, tuple, list)):
            return [numbers(v) for v in value]
        return round(value, 2) if isinstance(value, (float, int)) else value

    value = {
        key: numbers(drawing.get(key))
        for key in (
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
    }
    value["dashes"] = "".join(str(drawing.get("dashes", "")).split())
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def thin_horizontal(drawing):
    items = drawing["items"]
    if len(items) != 1:
        return None  # Never dissect a box, grid or a compound diagram path.
    item = items[0]
    rect = fitz.Rect(drawing["rect"])
    width = drawing.get("width") or 0
    if drawing["type"] in {"s", "fs"} and width > 1.2:
        return None
    if item[0] == "l" and drawing["type"] == "s":
        if abs(item[1].y - item[2].y) > 0.3:
            return None
    elif item[0] == "re" and drawing["type"] in {"f", "fs"}:
        if rect.height > 1.2:
            return None
    else:
        return None
    if rect.width < max(1.5, rect.height * 4):
        return None
    return rect, max(0.05, width)


def fraction_bar(rect, lines, size):
    above, below = False, False
    x0, x1, y = rect.x0, rect.x1, (rect.y0 + rect.y1) / 2
    for line in lines:
        for span in line["spans"]:
            box = fitz.Rect(span["bbox"])
            if box.x1 <= x0 or box.x0 >= x1 or abs((box.y0 + box.y1) / 2 - y) > size * 1.4:
                continue
            if MATH_FONT.search(span["font"]):
                return True
            # Normal-font fractions exist too. Their numerator/denominator
            # are narrow isolated spans, not one letter clipped from prose.
            if box.width > rect.width * 1.7 + 1 or not span["text"].strip():
                continue
            middle = (box.y0 + box.y1) / 2
            above |= middle < y - size * 0.12
            below |= middle > y + size * 0.12
    return above and below


def decoration_owner(rect, lines, records):
    center = (rect.tl + rect.br) / 2
    owners = [
        r
        for r in records
        if r["status"] == "placed"
        and not r.get("label")
        and any((fitz.Rect(mask) + (-0.5, -0.5, 0.5, 0.5)).contains(center) for mask in r["redactions"])
    ]
    if len({r["id"] for r in owners}) != 1:
        return None
    owner = owners[0]
    for line in lines:
        row = fitz.Rect(line["bbox"])
        if rect.x0 < row.x0 - 0.5 or rect.x1 > row.x1 + 0.5:
            continue
        spans = [s for s in line["spans"] if s["text"].strip()]
        if not spans:
            continue
        main = max(spans, key=lambda s: len(s["text"]))
        size, baseline = main["size"], main["origin"][1]
        y = (rect.y0 + rect.y1) / 2
        underline = baseline + size * 0.03 <= y <= baseline + max(1.2, size * 0.23)
        strike = abs(y - (row.y0 + row.y1) / 2) <= max(0.35, size * 0.07)
        if (underline or strike) and not fraction_bar(rect, lines, size):
            return owner
    return None


def plan_decorations(page, lines, records, regions, tables, images):
    protected = [fitz.Rect(r["bbox"]) for r in regions if r["type"] in PROTECTED] + tables + images
    type3 = {font[3].split("+")[-1] for font in page.get_fonts() if font[2] == "Type3"}
    protected += [
        fitz.Rect(span["bbox"])
        for line in lines
        for span in line["spans"]
        if span["font"].split("+")[-1] in type3
    ]
    drawings = page.get_drawings()
    candidates = []
    for index, drawing in enumerate(drawings):
        candidate = thin_horizontal(drawing)
        if not candidate:
            continue
        rect, width = candidate
        # Covered-only removal needs the stroke/miter envelope, not a zero-height line.
        padding = width * 5 + 0.15
        mask = rect + (-padding, -padding, padding, padding)
        if any(overlap(mask, box) > 0 for box in protected):
            continue
        owner = decoration_owner(rect, lines, records)
        if owner is not None:
            candidates.append(
                {
                    "index": index,
                    "mask": mask,
                    "signature": drawing_signature(drawing),
                    "id": owner["id"],
                    "type": owner.get("type", "text"),
                    "bbox": list(rect),
                }
            )
    selected = {c["index"] for c in candidates}
    # Even tiny unrelated graphics must not disappear in the expanded envelope.
    return [
        c
        for c in candidates
        if not any(
            c["mask"].contains(fitz.Rect(d["rect"])) for i, d in enumerate(drawings) if i not in selected
        )
    ]


def erase_decorations(page, candidates):
    if not candidates:
        return page, []
    original = Counter(drawing_signature(d) for d in page.get_drawings())
    with fitz.open() as trial:
        trial.insert_pdf(page.parent, from_page=page.number, to_page=page.number, links=False, annots=False)
        target = trial[0]
        for candidate in candidates:
            target.add_redact_annot(candidate["mask"], fill=None, cross_out=False)
        target.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
            text=fitz.PDF_REDACT_TEXT_NONE,
        )
        remaining = Counter(drawing_signature(d) for d in target.get_drawings())
        missing = original - remaining
        expected = Counter(c["signature"] for c in candidates)
        # Fail closed: an unexpected path loss, split or rewrite discards the
        # trial entirely. No collateral diagram/table/fraction loss is committed.
        if remaining - original or missing - expected or not missing:
            return page, []
        pdf, number = page.parent, page.number
        graft_content(pdf, trial, number, fitz.Graftmap(pdf), source_index=0, copy_group=False)
        page = pdf[number]
    removed = []
    for candidate in candidates:
        if missing[candidate["signature"]]:
            missing[candidate["signature"]] -= 1
            removed.append({k: v for k, v in candidate.items() if k not in {"index", "mask"}})
    return page, removed
