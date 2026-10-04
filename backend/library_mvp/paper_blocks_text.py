"""Conservative paragraph/caption boundaries and repeated margin classification."""
import collections
import math
import re
import statistics
import unicodedata
import pymupdf as fitz
from . import paper_blocks_model as model
from .paper_blocks_paragraphs import continuation, sentence_end, split_word  # compatible pure-logic export
from .paper_blocks_typography import prose_font, heading_evidence


def normalized(text):
    return re.sub(r"\s+", "", re.sub(r"\d+", "#", unicodedata.normalize("NFKC", text).casefold()))


def band(row, width, height):
    x0, y0, x1, y1 = row["bbox"]
    if y1 > height * 0.89:
        return "footer"
    if y0 < height * 0.13 or x1 < width * 0.09 or x0 > width * 0.91:
        return "header"
    return None


def mark_margins(stats):
    pages = collections.defaultdict(set)
    for index, (meta, rows, _) in enumerate(stats):
        width, height = fitz.Rect(meta["cropbox"]).width, fitz.Rect(meta["cropbox"]).height
        for row in rows:
            if band(row, width, height):
                pages[normalized(row["text"])].add(index)
    threshold = max(2, math.ceil(len(stats) * 0.35))
    repeated = {key for key, hits in pages.items() if key and len(hits) >= threshold}
    for meta, rows, _ in stats:
        width, height = fitz.Rect(meta["cropbox"]).width, fitz.Rect(meta["cropbox"]).height
        for row in rows:
            position = band(row, width, height)
            # The same repeated margin text can also occur as a diagonal publisher watermark.
            if normalized(row["text"]) in repeated and (position or row["sideways"]):
                row["type"] = position or "header"
            elif row["sideways"] and (row["bbox"][0] < width * 0.1 or row["bbox"][2] > width * 0.9):
                row["type"] = "header"


def word_frequencies(rows):
    text = "\n".join(r["text"] for r in rows)
    return {
        "hyphen": collections.Counter(w.lower() for w in re.findall(r"[A-Za-z]+(?:-[A-Za-z]+)+", text)),
        "plain": collections.Counter(w.lower() for w in re.findall(r"\b[A-Za-z]+\b", text)),
    }


def same_font(a, b, tolerance=0.055):
    return a.get("font") == b.get("font") and abs(a["size"] - b["size"]) <= max(a["size"], b["size"]) * tolerance


def overlap(a, b):
    return max(0, min(a[2], b[2]) - max(a[0], b[0]))


def merge(prior, row, words):
    prior["text"] = model.joined(prior["text"], row["text"], words)
    prior["bbox"] = list(fitz.Rect(prior["bbox"]) | fitz.Rect(row["bbox"]))
    prior["math_parts"].extend(row["math_parts"])
    prior["source_lines"].extend(row["source_lines"])
    prior["last_line"] = row["last_line"]


def text_blocks(rows, body_size, page_number, width, height, words=None):
    output = []
    eligible = [r for r in rows if r["type"] not in ("header", "footer")]
    title_size = max((r["size"] for r in eligible if r["bbox"][1] < height * 0.3 and not r["sideways"]), default=0)
    bases, gaps = {}, {}
    for col in (0, 1):
        lines = sorted(
            [
                r
                for r in eligible
                if (r["bbox"][0] >= width / 2) == bool(col)
                and len(r["text"]) > 35
                and abs(r["size"] - body_size) < body_size * 0.13
            ],
            key=lambda r: r["bbox"][1],
        )
        starts = collections.Counter(round(r["bbox"][0]) for r in lines)
        bases[col] = starts.most_common(1)[0][0] if starts else 0
        distances = [
            b["bbox"][1] - a["bbox"][3]
            for a, b in zip(lines, lines[1:])
            if 0 <= b["bbox"][1] - a["bbox"][3] < body_size
        ]
        gaps[col] = statistics.median(distances) if distances else body_size * 0.3
    previous_line = {}
    for source in sorted(rows, key=lambda r: (r["bbox"][1], r["bbox"][0])):
        row = {**source, "math_parts": list(source["math_parts"])}
        value, box = row["text"], row["bbox"]
        col = int(box[0] >= width / 2)
        indented = bases[col] + body_size * 0.55 < box[0] < bases[col] + body_size * 2
        before = previous_line.get(col)
        paragraph_gap = bool(before and box[1] - before["bbox"][3] > gaps[col] + body_size * 0.3)
        if row["type"] not in ("header", "footer"):
            previous_line[col] = row
        row.update(
            first_indent=indented,
            indent_offset=box[0] - bases[col],
            paragraph_gap=paragraph_gap,
            source_lines=[
                {
                    "text": value,
                    "bbox": list(box),
                    "size": row["size"],
                    "font": row.get("font"),
                    "bold": row["bold"],
                    "baseline": row.get("baseline", box[3]),
                    "indent_offset": box[0] - bases[col],
                }
            ],
            last_line=list(box),
        )
        proof = heading_evidence(source, eligible, gaps[col])
        if row["type"] not in ("header", "footer"):
            if re.fullmatch(r"(?:https?://|www\.)\S+", value) and box[1] < height * 0.13:
                row["type"] = "header"
            elif model.REFERENCE.match(value) or model.APPENDIX.match(value):
                row["type"] = "heading"
            elif model.CAPTION.match(value) and (
                re.match(r"^\s*(?:Figure|Fig\.?|Table|Scheme|图|表)\s*\d+\s*[:.：]", value, re.I)
                or row["size"] < body_size * 0.97
            ):
                row["type"] = "caption"
            elif row["math_ratio"] > 0.45:
                row["type"] = "formula"
            elif page_number == 1 and row["size"] >= max(body_size * 1.2, title_size * 0.93) and box[1] < height * 0.3:
                row["type"] = "title"
            elif proof and (row["size"] >= body_size * 1.08 or row["bold"]):
                row["type"] = "heading"
                row["heading_evidence"] = proof
            elif re.match(r"^(Abstract\b|摘要)", value, re.I):
                row["type"] = "abstract"
            elif re.match(r"^\s*(?:[•●▪]|[1-9]\d{0,2}[.):]\s|[-–]\s)", value):
                row["type"] = "list"
            elif row["size"] < body_size * 0.83 and box[1] > height * 0.78:
                row["type"] = "footnote"
        if row["type"] == "text" and page_number == 1 and row["size"] > body_size * 1.8 and box[1] < height * 0.13:
            row["type"] = "header"
        candidates = []
        for prior in output[-40:]:
            last = prior["last_line"]
            gap = box[1] - last[3]
            horizontal = overlap(box, last) > min(box[2] - box[0], last[2] - last[0]) * 0.6
            if (
                prior["type"] == "text"
                and row["type"] == "heading"
                and same_font(prior, row, 0.03)
                and prior["bold"] == row["bold"]
                and not sentence_end(prior["text"])
                and horizontal
                and -row["size"] * 0.4 <= gap < row["size"] * 0.6
            ):
                match = True
            elif prior["type"] == row["type"] == "title":
                match = (
                    horizontal
                    and same_font(prior, row, 0.03)
                    and prior["bold"] == row["bold"]
                    and -row["size"] * 0.55 <= gap < row["size"] * 0.6
                )
            elif prior["type"] in ("caption", "abstract") and row["type"] in ("text", "caption", "formula"):
                match = horizontal and same_font(prior, row) and -0.5 <= gap < row["size"] * 0.65
                match = match and not model.CAPTION.match(value) and abs(box[0] - prior["bbox"][0]) < body_size * 2
            else:
                match = (
                    prior["type"] == row["type"]
                    and row["type"] in ("text", "abstract", "formula")
                    and prose_font(prior, row)
                    and horizontal
                    and (not indented or abs(box[0] - last[0]) < body_size * 0.25)
                    and -0.5 <= gap <= gaps[col] + body_size * 0.25
                )
            intervening = any(
                other is not prior
                and other["type"] not in ("header", "footer")
                and last[1] < other["bbox"][1] < box[1] - 0.5
                and overlap(box, other["bbox"]) > min(box[2] - box[0], other["bbox"][2] - other["bbox"][0]) * 0.6
                for other in output[-40:]
            )
            if match and not intervening:
                candidates.append(prior)
        if candidates:
            prior = min(candidates, key=lambda r: abs(box[1] - r["last_line"][3]))
            if row["type"] == "heading" and prior["type"] == "text":
                prior["type"] = "heading"
                prior["heading_evidence"] = row["heading_evidence"]
            merge(prior, row, words)
        else:
            output.append(row)
    for label in list(output):
        if re.fullmatch(r"\(\d+[a-z]?\)", label["text"]):
            formula = next(
                (
                    r
                    for r in output
                    if r is not label and r["type"] == "formula" and abs(r["bbox"][1] - label["bbox"][1]) < body_size
                ),
                None,
            )
            if formula:
                merge(formula, label, words)
                output.remove(label)
    return output
