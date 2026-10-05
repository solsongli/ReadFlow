"""Conservative author-zone name parsing; institutions and prose are never guessed as people."""
import re
import unicodedata
from .pdf_identity import placeholder_author

AFFILIATION = re.compile(
    r"\b(?:university|institute|laborator\w*|department|school|college|research|"
    r"google|brain|deepmind|meta|openai|microsoft|stanford|berkeley|toyota|"
    r"physical intelligence|inc\.?|corporation|contribution|correspond\w*|lead|"
    r"authors?|joint|fair|received|accepted)\b|大学|学院|研究所|实验室",
    re.I,
)
PROSE = re.compile(
    r"^(?:abstract\b|摘要|we\s|this\s|in this\s|our\s|large\s|figure\b|fig\.|table\b|keywords?\b)", re.I
)
PARTICLES = frozenset({"de", "del", "da", "di", "van", "von", "der", "den", "la", "le", "dos"})


def clean_name(value):
    accents = {"´": "\u0301", "`": "\u0300", "ˆ": "\u0302", "˜": "\u0303", "¨": "\u0308"}
    value = re.sub(r"([´`ˆ˜¨])([A-Za-z])", lambda m: unicodedata.normalize("NFC", m[2] + accents[m[1]]), value)
    value = re.sub(r"\s*([\u0300-\u036f])([A-Za-z])", lambda m: unicodedata.normalize("NFC", m[2] + m[1]), value)
    value = re.sub(r"^[\d*∗†‡]+|[\d*∗†‡]+$", "", value.strip())
    return re.sub(r"\s+", " ", value).strip(" ,;·")


def plausible_name(value):
    if placeholder_author(value) or AFFILIATION.search(value) or "@" in value or re.search(r"\d|[/:=]", value):
        return False
    if re.fullmatch(r"[\u4e00-\u9fff]{2,4}", value):
        return True
    parts = value.split()
    if not 2 <= len(parts) <= 5:
        return False
    for word in parts:
        if word.casefold() in PARTICLES:
            continue
        segments = re.split(r"[-’']", word.rstrip("."))
        if not all(
            s and s[0].isupper() and all(c.isalpha() or unicodedata.category(c) == "Mn" for c in s)
            for s in segments
        ):
            return False
    return True


def detect_authors(page, rows, title):
    if title["confidence"] < 0.85 or not title.get("bbox"):
        return {"values": [], "confidence": 0.0}
    top = title["bbox"][3]
    limit = min(page.rect.height * 0.65, top + page.rect.height * 0.36)
    for image in page.get_image_info():
        x0, y0, x1, y1 = image["bbox"]
        if y0 > top + 5 and (x1 - x0) * (y1 - y0) > 1200:
            limit = min(limit, y0)
    selected = [r for r in rows if r["bbox"][1] >= top - 1 and r["bbox"][3] < limit]
    names, valid_lines, rejected = [], 0, 0
    last_bottom, author_size = None, None
    for row in selected:
        value = row["names"]
        if last_bottom is not None and row["bbox"][1] - last_bottom > author_size * 2.5:
            break
        if author_size is not None and not AFFILIATION.search(value) and "@" not in value and "http" not in value:
            if abs(row["size"] - author_size) > author_size * 0.15:
                break
        if valid_lines:
            last_bottom = max(last_bottom, row["bbox"][3])
        if PROSE.search(value) or row["size"] > max(r["size"] for r in rows if r["bbox"][1] <= top) * 0.9:
            break
        if AFFILIATION.search(value) or "@" in value or "http" in value or not value.strip():
            continue
        parts = [clean_name(p) for p in re.split(r"[,;；、]|\band\b|&", value) if clean_name(p)]
        valid = [p for p in parts if plausible_name(p)]
        if valid and len(valid) == len(parts):
            names.extend(valid)
            valid_lines += 1
            author_size = row["size"] if author_size is None else author_size
            last_bottom = row["bbox"][3] if last_bottom is None else max(last_bottom, row["bbox"][3])
        else:
            rejected += 1
            if valid_lines and len(value.split()) > 8:
                break
    unique = list(dict.fromkeys(names))
    confidence = (
        0.93
        if valid_lines and len(unique) >= 2 and rejected <= 1
        else 0.86
        if valid_lines and rejected == 0
        else 0.4
    )
    return {"values": unique[:100] if confidence >= 0.85 else [], "confidence": confidence}
