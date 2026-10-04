"""ReadFlow block schema v1. Coordinates carry both native PDF and normalized display geometry."""
import hashlib
import json
import re
from .paper_blocks_inline import restore_rich

SCHEMA_VERSION = 1
EXTRACTOR_VERSION = "heuristic-3"
SKIP = frozenset({"figure", "table", "formula", "header", "footer", "reference", "author"})
MATH_FONT = re.compile(r"cmmi|cmsy|cmex|symbol|stix|math|msam|msbm", re.I)
CAPTION = re.compile(r"^\s*(Figure|Fig\.?|Table|Scheme|图|表)\s*([\dA-Z]+)\b\s*[:.：]?", re.I)
REFERENCE = re.compile(r"^[\s■▪•]*(?:\d+[.\s]+)?(?:references|bibliography|参考文献)\s*$", re.I)
APPENDIX = re.compile(r"^\s*(?:appendix\b|appendices\b|supplementary (?:information|material|figures)\b|附录)", re.I)


def digest(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def block_id(anchors, content):
    return digest([[{"page": a["page"], "bbox": [round(x, 2) for x in a["bbox"]]} for a in anchors], content])[:24]


def service_fingerprint(config, terms):
    # Deliberately excludes credentials, including hashes of credentials.
    return digest([config["base_url"], config["model"], terms])


def cache_key(block, language, service):
    return digest([block["id"], language, service])


def protected_ranges(text, math_parts=()):
    spans = [
        {"start": m.start(), "end": m.end(), "text": m.group()}
        for m in re.finditer(r"\[\s*\d+(?:\s*[,，;；–—-]\s*\d+)*\s*\]", text)
    ]
    cursor = 0
    for part in math_parts:
        part = {"text": part} if isinstance(part, str) else part
        value = part["text"]
        start = text.find(value, cursor)
        if start >= 0 and value.strip():
            spans = [s for s in spans if not (s["start"] < start + len(value) and s["end"] > start)]
            spans.append({**part, "start": start, "end": start + len(value)})
            cursor = start + len(value)
    return sorted(spans, key=lambda s: s["start"])


def protect(block):
    text = block["text"]
    mapping = {}
    prefix = "__RF_" + block["id"][:12] + "_"
    while prefix in text:
        prefix += "X"
    for index, span in reversed(list(enumerate(block.get("protected", [])))):
        marker = f"{prefix}{index}__"
        mapping[marker] = {
            **span,
            "left": re.search(r"\s*$", text[: span["start"]]).group(),
            "right": re.match(r"\s*", text[span["end"] :]).group(),
        }
        text = text[: span["start"]] + marker + text[span["end"] :]
    return text, mapping


def restore(text, mapping):
    value = restore_rich(text, mapping)
    return value["text"] if value else None


def joined(a, b, words=None):
    end, beginning = re.search(r"([A-Za-z]+(?:-[A-Za-z]+)*)-$", a), re.match(r"^([A-Za-z]+)", b)
    if end and beginning:
        compound = (end[1] + "-" + beginning[1]).lower()
        plain = (end[1] + beginning[1]).lower()
        words = words or {"hyphen": {}, "plain": {}}
        if not words["hyphen"].get(compound) and words["plain"].get(plain):
            return a[:-1] + b
        return a + b
    return a.rstrip() + (" " if a and b and not a[-1].isspace() and not b[0].isspace() else "") + b.lstrip()


def reading_order(blocks, width):
    """Full-width separators form horizontal bands; each band is read left column then right."""
    margins = [b for b in blocks if b["type"] in {"header", "footer"}]
    blocks = [b for b in blocks if b["type"] not in {"header", "footer"}]
    texts = [b for b in blocks if b["type"] not in {"figure", "table", "formula"}]
    evidence = [line for b in texts if b["type"] not in {"title", "author"} for line in b.get("source_lines", [b])]
    narrow = [b for b in evidence if width * 0.24 < b["bbox"][2] - b["bbox"][0] < width * 0.56]
    left = [b for b in narrow if b["bbox"][0] < width * 0.42]
    right = [b for b in narrow if b["bbox"][0] > width * 0.45]
    split = width / 2 if len(left) >= 2 and len(right) >= 2 else None
    if split is None:
        return sorted(blocks, key=lambda b: (b["bbox"][1], b["bbox"][0])) + margins
    wide = sorted(
        [b for b in blocks if b["bbox"][0] < split - width * 0.08 and b["bbox"][2] > split + width * 0.08],
        key=lambda b: b["bbox"][1],
    )
    remaining = [b for b in blocks if b not in wide]
    output = []

    def band(rows):
        return sorted(rows, key=lambda b: (b["bbox"][0] >= split, b["bbox"][1], b["bbox"][0]))

    for separator in wide:
        before = [b for b in remaining if (b["bbox"][1] + b["bbox"][3]) / 2 < separator["bbox"][1]]
        output.extend(band(before))
        remaining = [b for b in remaining if b not in before]
        output.append(separator)
    return output + band(remaining) + margins
