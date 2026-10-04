"""PDF spans to physical lines, retaining script baselines and font identity."""
import collections
import re
import statistics
import pymupdf as fitz
from . import paper_blocks_model as model
from .paper_blocks_inline import span_content


def same_baseline(a, b, size):
    return abs(a["origin"][1] - b["origin"][1]) < size * 0.15


def lines(page):
    spans = [
        {
            **span,
            "sideways": abs(line.get("dir", (1, 0))[1]) > 0.3,
            "source_block": block_index,
            "source_width": group["bbox"][2] - group["bbox"][0],
        }
        for block_index, group in enumerate(page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)["blocks"])
        if group.get("type") == 0
        for line in group["lines"]
        for span in line["spans"]
        if span["text"].strip()
    ]
    clusters = []
    for span in sorted(spans, key=lambda s: ((s["bbox"][1] + s["bbox"][3]) / 2, s["bbox"][0])):
        box = fitz.Rect(span["bbox"])
        match = next(
            (
                row
                for row in reversed(clusters[-40:])
                if (
                    not (
                        row["bbox"].x1 <= page.rect.width / 2 <= box.x0
                        or box.x1 <= page.rect.width / 2 <= row["bbox"].x0
                    )
                    or any(
                        s["source_block"] == span["source_block"]
                        and span["source_width"] > page.rect.width * 0.56
                        and same_baseline(s, span, row["size"])
                        for s in row["spans"]
                    )
                )
                and row["sideways"] == span["sideways"]
                and abs((row["bbox"].y0 + row["bbox"].y1 - box.y0 - box.y1) / 2) < max(row["size"], span["size"]) * 0.7
                and (
                    max(row["bbox"].x0, box.x0) - min(row["bbox"].x1, box.x1) < max(row["size"], span["size"]) * 2.2
                    or any(
                        s["source_block"] == span["source_block"] and same_baseline(s, span, row["size"])
                        for s in row["spans"]
                    )
                )
            ),
            None,
        )
        if match:
            match["spans"].append(span)
            match["bbox"] |= box
            match["size"] = max(match["size"], span["size"])
        else:
            clusters.append({"spans": [span], "bbox": box, "size": span["size"], "sideways": span["sideways"]})
    changed = True
    while changed:
        changed = False
        for row in list(clusters):
            other = next(
                (
                    c
                    for c in clusters
                    if c is not row
                    and c["sideways"] == row["sideways"]
                    and abs((c["bbox"].y0 + c["bbox"].y1 - row["bbox"].y0 - row["bbox"].y1) / 2)
                    < max(c["size"], row["size"]) * 0.4
                    and max(c["bbox"].x0, row["bbox"].x0) - min(c["bbox"].x1, row["bbox"].x1)
                    < max(c["size"], row["size"]) * 0.4
                ),
                None,
            )
            if other:
                other["spans"].extend(row["spans"])
                other["bbox"] |= row["bbox"]
                other["size"] = max(other["size"], row["size"])
                clusters.remove(row)
                changed = True
                break
    for small in list(clusters):
        if sum(len(span["text"]) for span in small["spans"]) > 4:
            continue
        parent = next(
            (
                row
                for row in clusters
                if row is not small
                and row["sideways"] == small["sideways"]
                and row["bbox"].contains(small["bbox"])
                and sum(len(span["text"]) for span in row["spans"]) > 4
            ),
            None,
        )
        if parent:
            parent["spans"].extend(small["spans"])
            clusters.remove(small)
    result = []
    for cluster in clusters:
        spans = cluster["spans"]
        text, parts = span_content(spans, cluster["size"], model.MATH_FONT)
        font = collections.Counter({})
        for span in spans:
            font[re.sub(r"^[A-Z]{6}\+", "", span["font"])] += len(span["text"])
        normal = [s for s in spans if s["size"] >= cluster["size"] * 0.88]
        result.append(
            {
                "bbox": list(cluster["bbox"]),
                "text": text,
                "size": cluster["size"],
                "font": font.most_common(1)[0][0],
                "baseline": statistics.median(s["origin"][1] for s in normal),
                "bold": sum(len(s["text"]) for s in spans if s["flags"] & 16) > len(text) * 0.5,
                "sideways": cluster["sideways"],
                "math_parts": parts,
                "math_ratio": sum(len(p["text"]) for p in parts) / max(1, len(text)),
                "type": "text",
            }
        )
    return result
