"""Preserve framed pseudocode and contiguous monospaced listings as vector crops."""
import re
import pymupdf as fitz

PROGRAM = re.compile(r"^\s*(Algorithm|Listing|算法)\s*(?:\d+|[A-Z]\d+)\b", re.I)
MONO = re.compile(r"courier|mono|cmtt|typewriter|inconsolata", re.I)
SYNTAX = re.compile(
    r"(?:^\s*\d+\s*[:.]|\b(?:for|while|return|def|class|import|print|with|require|ensure|input|output|if)\b|←|:=|\b[A-Za-z_]\w*\s*=(?!=))",
    re.I,
)


def programs(page, raw):
    drawings = [d["rect"] for d in page.get_drawings()]
    regions = []
    for head in raw:
        match = PROGRAM.match(head["text"])
        if not match or head.get("sideways"):
            continue
        box = fitz.Rect(head["bbox"])
        containers = [r for r in drawings if r.contains(box) and 30 < r.height < page.rect.height * 0.8]
        if containers:
            region = min(containers, key=lambda r: r.width * r.height)
        else:
            rules = sorted(
                [
                    r
                    for r in drawings
                    if r.height < 2
                    and r.width > max(80, box.width * 0.7)
                    and r.x0 <= box.x0 + 8
                    and r.x1 >= box.x1 - 8
                ],
                key=lambda r: r.y0,
            )
            top = max((r for r in rules if box.y0 - 18 < r.y0 < box.y1 + 15), key=lambda r: r.y0, default=None)
            bottom = next(
                (
                    r
                    for r in rules
                    if top
                    and r.y0 > max(top.y0 + 25, box.y1 + 25)
                    and abs(r.x0 - top.x0) < 8
                    and abs(r.x1 - top.x1) < 8
                ),
                None,
            )
            if top is None or bottom is None or bottom.y0 - box.y0 > page.rect.height * 0.75:
                continue
            region = fitz.Rect(top.x0, min(box.y0, top.y0) - 2, top.x1, bottom.y0 + 2)
        content = [r for r in raw if (region + (-2, -2, 2, 2)).contains(fitz.Rect(r["bbox"]))]
        for row in content:
            region |= fitz.Rect(row["bbox"])
        region += (-1, -1, 1, 1)
        if len(content) >= 3 and any(SYNTAX.search(r["text"]) for r in content[1:]):
            regions.append(_region("algorithm" if match[1].lower() != "listing" else "code", region, content))
    mono = [
        r
        for r in raw
        if MONO.search(r.get("font", ""))
        and not r.get("sideways")
        and not any(fitz.Rect(p["bbox"]).contains(fitz.Rect(r["bbox"])) for p in regions)
    ]
    groups = []
    for row in sorted(mono, key=lambda r: (r["bbox"][0] > page.rect.width / 2, r["bbox"][1])):
        prior = groups[-1][-1] if groups else None
        if not prior or row["bbox"][1] - prior["bbox"][3] > row["size"] * 1.8 or row["bbox"][1] < prior["bbox"][1]:
            groups.append([])
        groups[-1].append(row)
    for group in groups:
        if len(group) < 3 or sum(bool(SYNTAX.search(r["text"])) for r in group) < 2:
            continue
        box = fitz.Rect(group[0]["bbox"])
        for row in group[1:]:
            box |= fitz.Rect(row["bbox"])
        regions.append(_region("code", box + (-2, -2, 2, 2), group))
    return regions


def _region(kind, box, rows):
    return {
        "type": kind,
        "bbox": list(box),
        "text": "\n".join(r["text"] for r in rows),
        "math_parts": [],
        "source_lines": [{**r, "math_parts": list(r.get("math_parts", []))} for r in rows],
        "source": "program_structure",
        "confidence": 0.95,
        "program_evidence": {
            "lines": len(rows),
            "syntax_lines": sum(bool(SYNTAX.search(r["text"])) for r in rows),
        },
    }
