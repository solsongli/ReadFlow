"""Unambiguous reference matching inside one translated block, never page-wide guessing."""
import re
import unicodedata
import pymupdf as fitz
from .paper_reference_tokens import REFERENCE_TOKEN


def canonical(value):
    return "".join(
        c
        for c in unicodedata.normalize("NFKC", value).casefold().replace("–", "-").replace("—", "-")
        if not c.isspace()
    )


def native_label(rect, lines):
    for line in lines:
        chars = [c for span in line["spans"] for c in span["chars"]]
        selected = [
            i
            for i, c in enumerate(chars)
            if rect.contains((fitz.Rect(c["bbox"]).tl + fitz.Rect(c["bbox"]).br) / 2)
        ]
        if not selected:
            continue
        text = "".join(c["c"] for c in chars)
        start, end = min(selected), max(selected) + 1
        label = text[start:end].strip()
        context = next(
            (m.group() for m in REFERENCE_TOKEN.finditer(text) if m.start() <= start and m.end() >= end), None
        )
        return {"label": canonical(label), "context": canonical(context or label)}
    return {"label": "", "context": ""}


def glyph_index(prepared, identity):
    text, boxes = [], []
    for rect, placement in prepared:
        if placement.get("owner") != identity or placement.get("label"):
            continue
        page = placement["doc"][0]
        scale = min(rect.width / page.rect.width, rect.height / page.rect.height)
        dx = rect.x0 + (rect.width - page.rect.width * scale) / 2
        dy = rect.y0 + (rect.height - page.rect.height * scale) / 2
        # Texttrace uses size-bounded glyph boxes, avoiding a 1.44em CJK font
        # envelope that would make link borders overlap the adjacent line.
        traced = {
            (chr(c[0]), round(c[2][0], 2), round(c[2][1], 2)): c[3]
            for span in page.get_texttrace()
            for c in span["chars"]
        }
        for block in page.get_text("rawdict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    for char in span["chars"]:
                        value = canonical(char["c"])
                        if not value:
                            continue
                        key = (char["c"], round(char["origin"][0], 2), round(char["origin"][1], 2))
                        box = fitz.Rect(traced.get(key, char["bbox"]))
                        box = fitz.Rect(
                            dx + box.x0 * scale, dy + box.y0 * scale, dx + box.x1 * scale, dy + box.y1 * scale
                        )
                        text.append(value)
                        boxes.extend([box] * len(value))
    return "".join(text), boxes


def patterns(context):
    match = re.fullmatch(r"(fig(?:ure)?s?\.?|tables?|eq(?:uation)?s?\.?|[图表式])\(?(\d+(?:\.\d+)*)\)?", context)
    if not match:
        return [re.escape(context)]
    prefix, number = match.groups()
    names = (
        r"(?:fig(?:ure)?s?\.?|图)"
        if prefix.startswith("fig") or prefix == "图"
        else r"(?:tables?|表)"
        if prefix.startswith("table") or prefix == "表"
        else r"(?:eq(?:uation)?s?\.?|式)"
    )
    return [names + r"\(?" + re.escape(number) + r"(?!\d|\.\d)\)?"]


def anchor(index, source):
    text, boxes = index
    label, context = source["label"], source["context"]
    if not label or not context:
        return None
    matches = [m for pattern in patterns(context) for m in re.finditer(pattern, text)]
    # Bare numbers / URLs still require a full-token boundary.
    if not REFERENCE_TOKEN.fullmatch(context):
        matches = [
            m
            for m in matches
            if (m.start() == 0 or not text[m.start() - 1].isalnum())
            and (m.end() == len(text) or not text[m.end()].isalnum())
        ]
    if len(matches) != 1:
        return None
    match = matches[0]
    start, end = match.span()
    if label != context:
        at = match.group().find(label)
        if at >= 0 and match.group().count(label) == 1:
            start, end = start + at, start + at + len(label)
        elif label.isdigit():
            digits = [m for m in re.finditer(r"\d+", match.group()) if m.group() == label]
            if len(digits) != 1:
                return None
            start, end = match.start() + digits[0].start(), match.start() + digits[0].end()
        else:
            return None
    chosen = boxes[start:end]
    if not chosen:
        return None
    # A single PDF link rectangle cannot span a wrapped citation without
    # covering unrelated text. Leave it invisible instead of making a guess.
    mids = [(r.y0 + r.y1) / 2 for r in chosen]
    if max(mids) - min(mids) > max(r.height for r in chosen) * 0.65:
        return None
    rect = fitz.Rect(chosen[0])
    for box in chosen[1:]:
        rect |= box
    return rect + (-0.2, -0.2, 0.2, 0.2)
