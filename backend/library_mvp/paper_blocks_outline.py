"""Recover an outline-backed run-in heading without turning its whole paragraph into a heading."""
import copy
import re
import unicodedata
import pymupdf as fitz
from .paper_blocks_model import joined


def prefix_heading(row, title, level, page, canonical, words):
    source = row.get("source_lines")
    if not source or row["type"] not in {"text", "heading", "list"}:
        return None
    line = source[0]
    value, target = line["text"], canonical(title)
    end = next(
        (
            i
            for i in range(1, min(len(value), len(title) * 2 + 40))
            if canonical(value[:i]) == target and (value[i].isspace() or value[i] in ".:：")
        ),
        None,
    )
    if end is None:
        return None
    while end < len(value) and (value[end].isspace() or value[end] in ".:："):
        end += 1
    if end == len(value):
        return None
    bounds = fitz.Rect(line["bbox"])
    chars = [
        char
        for block in page.get_text("rawdict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]
        for physical in block.get("lines", [])
        for span in physical["spans"]
        for char in span["chars"]
        if char["c"].strip() and bounds.contains(fitz.Point(*char["origin"]))
    ]
    chars.sort(key=lambda c: c["bbox"][0])
    needed = len(re.sub(r"\s", "", unicodedata.normalize("NFKC", value[:end])))
    count, used = 0, []
    for char in chars:
        used.append(char)
        count += len(unicodedata.normalize("NFKC", char["c"]))
        if count >= needed:
            break
    if not used or count != needed or len(used) >= len(chars):
        return None
    head_box, tail_box = fitz.Rect(used[0]["bbox"]), fitz.Rect(chars[len(used)]["bbox"])
    for char in used[1:]:
        head_box |= fitz.Rect(char["bbox"])
    for char in chars[len(used) + 1 :]:
        tail_box |= fitz.Rect(char["bbox"])
    head = {
        **copy.deepcopy(row),
        "text": value[:end].strip(),
        "bbox": list(head_box),
        "type": "heading",
        "outline_title": title,
        "heading_level": max(1, min(6, level)),
        "math_parts": [],
        "source_lines": [{**line, "text": value[:end].strip(), "bbox": list(head_box), "math_parts": []}],
        "last_line": list(head_box),
        "outline_evidence": "run_in_prefix",
    }
    parts = [
        {**p, "start": p["start"] - end, "end": p["end"] - end}
        for p in line.get("math_parts", [])
        if isinstance(p, dict) and p.get("start", -1) >= end
    ]
    tail = {**line, "text": value[end:], "bbox": list(tail_box), "math_parts": parts}
    remainder = [tail, *source[1:]]
    content = tail["text"]
    for following in source[1:]:
        tail_box |= fitz.Rect(following["bbox"])
        content = joined(content, following["text"], words)
    row.update(type="text", text=content, bbox=list(tail_box), source_lines=remainder, math_parts=[])
    row.pop("heading_evidence", None)
    return head
