"""Keep short display-equation parts together rather than sending stray math as prose."""
import re
import pymupdf as fitz
from .paper_blocks_text import merge


def equation_parts(rows, words):
    pending = list(rows)
    output = []
    while pending:
        row = pending.pop(0)
        if row["type"] != "formula":
            output.append(row)
            continue
        box = fitz.Rect(row["bbox"])
        changed = True
        while changed:
            changed = False
            for other in list(pending + output):
                if other is row or other["type"] not in ("formula", "text"):
                    continue
                if other["type"] == "text" and (
                    len(other["text"].split()) > 4
                    or not (other.get("math_parts") or re.search(r"[=∪∈≥≤]", other["text"]))
                ):
                    continue
                size = max(row["size"], other["size"])
                if not (box + (-size * 2, -size * 0.6, size * 2, size * 0.6)).intersects(fitz.Rect(other["bbox"])):
                    continue
                if other in pending:
                    pending.remove(other)
                else:
                    output.remove(other)
                merge(row, other, words)
                box = fitz.Rect(row["bbox"])
                changed = True
        output.append(row)
    return sorted(output, key=lambda r: (r["bbox"][1], r["bbox"][0]))
