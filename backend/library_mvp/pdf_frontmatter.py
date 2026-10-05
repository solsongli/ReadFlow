"""First-page native typography only: no OCR, layout inference, or network."""
from collections import Counter
import re
import statistics
import unicodedata
import pymupdf as fitz

NOISE = re.compile(
    r"arxiv\s*:|https?://|@|copyright|all rights reserved|permission|attribution|"
    r"journalistic|scholarly works|^preprint\b|^submitted\b|^accepted\b|^article in press|"
    r"^journal\b|^issn\b|^vol(?:ume)?[.\s]|^(?:research|review) article$",
    re.I,
)
MASTHEAD = re.compile(
    r"^(?:nature(?: communications|materials|methods|medicine|chemistry|biotechnology)?|science|cell|"
    r"chem(?:ical)?\s+soc\s+rev|chemical reviews)$",
    re.I,
)


def clean_line(line, *, names=False):
    spans = line["spans"]
    size = max((s["size"] for s in spans), default=10)
    bases = [s["origin"][1] for s in spans if s["size"] >= size * 0.85 and re.search(r"[^\d\s*∗†‡,]", s["text"])]
    baseline = statistics.median(bases) if bases else spans[0]["origin"][1]
    values, previous = [], None
    for span in spans:
        value = span["text"]
        symbols = bool(re.fullmatch(r"[\d\s,*∗†‡⁰¹²³⁴⁵⁶⁷⁸⁹]+", value))
        superscript = span["flags"] & 1 or span["origin"][1] < baseline - size * 0.16
        if symbols and (superscript or names and span["size"] < size * 0.85):
            continue
        if previous and span["bbox"][0] - previous["bbox"][2] > size * (0.8 if names else 1.2):
            values.append("; " if names else " ")
        values.append(value)
        previous = span
    result = "".join(values)
    result = re.sub(r"[∗†‡⁰¹²³⁴⁵⁶⁷⁸⁹]", "", result)
    result = re.sub(r"\*+(?=\s|$)", "", result)
    return unicodedata.normalize("NFKC", result).strip()


def page_rows(page):
    output = []
    for block in page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]:
        for line in block.get("lines", []):
            if not line["spans"] or abs(line.get("dir", (1, 0))[1]) > 0.3:
                continue
            value = clean_line(line)
            if not value or any(ord(c) < 32 for c in value):
                continue
            size = max(s["size"] for s in line["spans"])
            output.append(
                {
                    "text": value,
                    "names": clean_line(line, names=True),
                    "bbox": list(line["bbox"]),
                    "size": size,
                    "bold": any(s["flags"] & 16 for s in line["spans"]),
                    "font": max(line["spans"], key=lambda s: len(s["text"]))["font"],
                }
            )
    return sorted(output, key=lambda r: (round(r["bbox"][1] / 3), r["bbox"][0]))


def detect_title(page, rows=None):
    rows = rows if rows is not None else page_rows(page)
    weights = Counter(round(r["size"], 1) for r in rows for _ in range(min(len(r["text"]), 100)))
    body = weights.most_common(1)[0][0] if weights else 10
    candidates = [
        r
        for r in rows
        if r["bbox"][1] < page.rect.height * 0.42
        and len(r["text"]) >= 6
        and re.search(r"[A-Za-z\u4e00-\u9fff]", r["text"])
        and not NOISE.search(r["text"])
        and not MASTHEAD.fullmatch(r["text"])
        and r["text"].casefold() not in {"abstract", "摘要", "introduction"}
    ]
    if not candidates:
        return {"value": "", "confidence": 0.0, "bbox": None}
    largest = max(r["size"] for r in candidates)
    leaders = [r for r in candidates if r["size"] >= largest * 0.9]
    first = min(leaders, key=lambda r: r["bbox"][1])
    group = [first]
    for row in candidates[candidates.index(first) + 1 :]:
        last = group[-1]
        if row["bbox"][1] - last["bbox"][3] > largest * 0.85:
            break
        horizontal = min(last["bbox"][2], row["bbox"][2]) - max(last["bbox"][0], row["bbox"][0])
        if row["size"] >= largest * 0.9 and horizontal > 0 and row["bbox"][1] > last["bbox"][1] + largest * 0.3:
            group.append(row)
    value = " ".join(r["text"] for r in group)
    box = fitz.Rect(group[0]["bbox"])
    for row in group[1:]:
        box |= fitz.Rect(row["bbox"])
    ratio = largest / max(1, body)
    confidence = 0.95 if ratio >= 1.35 else 0.86 if ratio >= 1.18 and any(r["bold"] for r in group) else 0.55
    if len(value) < 10 or len(value) > 500 or len(value.split()) > 60:
        confidence = min(confidence, 0.4)
    return {"value": value, "confidence": confidence, "bbox": list(box)}
