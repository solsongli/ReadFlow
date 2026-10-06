"""Local reference syntax shared by translation protection and PDF link anchoring."""
import re

REFERENCE_TOKEN = re.compile(
    r"(?:\b(?:Fig(?:ure)?s?\.?|Tables?|Eq(?:uation)?s?\.?)\s*\(?\d+(?:\.\d+)*\)?)"
    r"|(?:[图表式]\s*\(?\d+(?:\.\d+)*\)?)"
    r"|(?:\[\s*\d+(?:\s*[,，;；–—-]\s*\d+)*\s*\])"
    r"|(?:\(\s*\d+\s*\))",
    re.I,
)


def reference_spans(text):
    return [{"start": m.start(), "end": m.end(), "text": m.group()} for m in REFERENCE_TOKEN.finditer(text)]


def add_reference_spans(block):
    """Augment cached documents in memory; preserve old IDs, caches and math runs.

    A reference can contain a pre-existing structured script. Protect only its
    uncovered parts so the existing script never loses its local formatting.
    """
    spans = list(block.get("protected", []))
    for reference in reference_spans(block["text"]):
        cursor = reference["start"]
        for span in sorted(spans, key=lambda s: s["start"]):
            if span["end"] <= cursor or span["start"] >= reference["end"]:
                continue
            if span["start"] > cursor:
                end = min(span["start"], reference["end"])
                spans.append({"start": cursor, "end": end, "text": block["text"][cursor:end]})
            cursor = max(cursor, span["end"])
        if cursor < reference["end"]:
            spans.append(
                {"start": cursor, "end": reference["end"], "text": block["text"][cursor : reference["end"]]}
            )
    return sorted(spans, key=lambda s: s["start"])
