"""Repair reserved formatting tokens as data, never as HTML / Typst source."""
import re

_FORMAT = r"(?P<tag>B[\s_]*O[\s_]*L[\s_]*D|S[\s_]*U[\s_]*P(?:[\s_]*E[\s_]*R)?|S[\s_]*U[\s_]*B)[\s_]*(?P<edge>S[\s_]*T[\s_]*A[\s_]*R[\s_]*T|E[\s_]*N[\s_]*D)"
_PREFIX = r"R[\s_]*F[\s_]*(?:[a-f0-9][\s_]*){12}"
FORMAT = re.compile(r"(?:_\s*)*(?:" + _PREFIX + r")?" + _FORMAT + r"(?:\s*_)*", re.I)
RF = re.compile(
    r"(?:_\s*)*" + _PREFIX + r"\d+(?!\d)(?:\s*_)*|__\s*RF[\s_]+[a-z0-9_ ]{1,100}?__|"
    r"(?:_\s*)*R[\s_]*F[\s_]+[a-z0-9]{1,24}[\s_]+\d+(?:\s*_)*",
    re.I,
)


def canonical(value):
    return re.sub(r"[\s_]", "", value).casefold()


def marker_pattern(value):
    chars = canonical(value)
    tail = r"(?!\d)" if chars[-1:].isdigit() else ""
    return re.compile(r"(?:_\s*)*" + r"[\s_]*".join(map(re.escape, chars)) + tail + r"(?:\s*_)*", re.I)


def has_markers(value):
    if isinstance(value, dict):
        return has_markers(value.get("text", "")) or any(
            has_markers(r.get("text", "")) for r in value.get("runs", [])
        )
    return isinstance(value, str) and bool(FORMAT.search(value) or RF.search(value))


def canonicalize(text, mapping):
    """Expected placeholders tolerate separators/case; unknown tokens stay detectable."""
    for key in sorted(mapping, key=len, reverse=True):
        pattern = marker_pattern(key)
        span = mapping[key]
        if isinstance(span, dict) and "left" in span and "right" in span:
            # Whitespace surrounding a protected run is restored from the local source span.
            pattern = re.compile(r"\s*" + pattern.pattern + r"\s*", re.I)
        text = pattern.sub(lambda _: key, text)
    return text


def _slice(runs, start, end):
    offset, result = 0, []
    for run in runs:
        text = run.get("text", "")
        part = text[max(0, start - offset) : max(0, min(len(text), end - offset))]
        if part:
            result.append({**run, "text": part})
        offset += len(text)
    return result


def clean_rich(value, mapping=None):
    """Recover paired formats; remove orphan formats and flag unknown protected data."""
    if not has_markers(value):
        return value, {"tokens": 0, "unresolved": 0}
    original = value if isinstance(value, dict) else {"text": value}
    text = original.get("text", "")
    runs = original.get("runs") or [{"kind": "text", "text": text}]
    # The text field is authoritative. Never retain contaminated, divergent runs.
    if "".join(r.get("text", "") for r in runs) != text:
        runs = [{"kind": "text", "text": text}]
    spans = {canonical(key): val for key, val in (mapping or {}).items()}
    events = [(m.start(), m.end(), "format", m) for m in FORMAT.finditer(text)]
    events += [(m.start(), m.end(), "rf", m) for m in RF.finditer(text)]
    events.sort(key=lambda entry: (entry[0], -(entry[1] - entry[0])))
    tokens, end = [], -1
    for event in events:
        if event[0] < end:
            continue
        tokens.append(event)
        end = event[1]
    pending, paired = {}, set()
    for index, (_, _, kind, match) in enumerate(tokens):
        if kind != "format":
            continue
        tag, edge = canonical(match["tag"]), canonical(match["edge"])
        tag = "super" if tag == "sup" else tag
        if edge == "start":
            pending.setdefault(tag, []).append(index)
        elif pending.get(tag):
            paired.update((pending[tag].pop(), index))
    result, cursor, styles, unknown = [], 0, {}, 0

    def add(parts):
        for part in parts:
            if styles.get("bold"):
                part = {**part, "bold": True}
            for tag in ("sub", "super"):
                if styles.get(tag):
                    part = {**part, "kind": tag}
            if part.get("text"):
                result.append(part)

    for index, (start, end, kind, match) in enumerate(tokens):
        add(_slice(runs, cursor, start))
        if kind == "format" and index in paired:
            tag = canonical(match["tag"])
            tag = "super" if tag == "sup" else tag
            styles[tag] = styles.get(tag, 0) + (1 if canonical(match["edge"]) == "start" else -1)
        elif kind == "rf":
            span = spans.get(canonical(match[0]))
            if span:
                if isinstance(span, str):
                    span = {"text": span}
                if span.get("left") and result and not result[-1]["text"][-1:].isspace():
                    add([{"kind": "text", "text": span["left"]}])
                add(span.get("runs") or [{"kind": "text", "text": span["text"]}])
                if span.get("right") and text[end:] and not text[end].isspace():
                    add([{"kind": "text", "text": span["right"]}])
            else:
                unknown += 1
        cursor = end
    add(_slice(runs, cursor, len(text)))
    repaired = {**original, "text": "".join(r["text"] for r in result), "runs": result}
    if not repaired["text"].strip():
        unknown += 1
    if unknown:
        repaired["marker_issues"] = True
    return repaired, {"tokens": len(tokens), "unresolved": unknown}
