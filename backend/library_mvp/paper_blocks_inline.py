"""Local, data-only inline scripts. Model output never supplies formatting instructions."""
import re
import statistics


def span_content(spans, size, math_font):
    normal = [s for s in spans if s["size"] >= size * 0.88]
    baseline = statistics.median(s["origin"][1] for s in normal) if normal else 0

    def kind(span):
        small = span["size"] < size * 0.86
        dy = span["origin"][1] - baseline
        if small and dy > size * 0.06:
            return "sub"
        if small and (dy < -size * 0.12 or span["flags"] & 1 and dy <= 0):
            return "super"
        return "text"

    ordered = sorted(spans, key=lambda s: (round(s["bbox"][0], 1), {"sub": 0, "text": 1, "super": 2}[kind(s)]))
    text, parts, current, previous, start = "", [], [], None, 0

    def finish():
        if current:
            value = "".join(r["text"] for r in current)
            parts.append({"text": value, "runs": list(current), "start": start, "end": start + len(value)})
            current.clear()

    for span in ordered:
        value = span["text"]
        script = kind(span)
        mathematical = bool(math_font.search(span["font"])) and not (
            len(value) > 30 and len(re.findall(r"[A-Za-z]{3,}", value)) > 3
        )
        protected = mathematical or script != "text"
        gap = previous and span["bbox"][0] - previous["bbox"][2] > size * 0.18
        # Whitespace is part of prose, never silently swallowed by a protected fragment.
        space = bool(gap and script == "text" and text and not text[-1].isspace() and not value[0].isspace())
        if space:
            text += " "
            if current and protected:
                current.append({"kind": "text", "text": " "})
        if not protected:
            finish()
        elif not current:
            start = len(text)
        text += value
        if protected:
            current.append({"kind": script, "text": value})
        previous = span
    finish()
    leading = len(text) - len(text.lstrip())
    trimmed = text.strip()
    for part in parts:
        left, right = max(leading, part["start"]), min(leading + len(trimmed), part["end"])
        offset, runs = part["start"], []
        for run in part["runs"]:
            fragment = run["text"][max(0, left - offset) : max(0, min(len(run["text"]), right - offset))]
            if fragment:
                runs.append({**run, "text": fragment})
            offset += len(run["text"])
        part.update(start=left - leading, end=right - leading, text=text[left:right], runs=runs)
    return trimmed, [part for part in parts if part["text"]]


def line_math_parts(lines, expected, join):
    """Rebase exact source offsets after paragraph, caption and cross-page joins."""
    if not lines or any("math_parts" not in line for line in lines):
        return None
    text, parts = "", []
    for line in lines:
        text = join(text, line["text"])
        offset = len(text) - len(line["text"])
        for part in line["math_parts"]:
            if not isinstance(part, dict) or "start" not in part:
                return None
            parts.append({**part, "start": part["start"] + offset, "end": part["end"] + offset})
    return parts if text == expected else None


def rich_text(value):
    return value.get("text", "") if isinstance(value, dict) else value


def source_runs(block, text=None):
    """Reapply local script spans to unchanged source/fake-prefix text; never parse markup."""
    text = block["text"] if text is None else text
    runs, cursor = [], 0
    source_offset = text.find(block["text"])
    for span in block.get("protected", []):
        at = source_offset + span.get("start", -1) if source_offset >= 0 else -1
        if at < cursor or text[at : at + len(span["text"])] != span["text"]:
            at = text.find(span["text"], cursor)
        if at < 0:
            continue
        runs.append({"kind": "text", "text": text[cursor:at]})
        runs.extend(span.get("runs") or [{"kind": "text", "text": span["text"]}])
        cursor = at + len(span["text"])
    runs.append({"kind": "text", "text": text[cursor:]})
    return [r for r in runs if r["text"]]


def restore_rich(text, mapping):
    if not isinstance(text, str) or not text.strip() or len(text) > 100000:
        return None
    if any(text.count(marker) != 1 for marker in mapping):
        return None
    runs, cursor, bold = [], 0, False
    for at, marker in sorted((text.index(marker), marker) for marker in mapping):
        span = mapping[marker]
        if isinstance(span, str):
            span = {"text": span}
        before = text[cursor:at]
        left, right = span.get("left", ""), span.get("right", "")
        if left and before and not before[-1].isspace():
            before += left
        elif left and not before and runs and not runs[-1]["text"][-1:].isspace():
            before = left
        runs.append({"kind": "text", "text": before, **({"bold": True} if bold else {})})
        if span.get("format"):
            if span["format"] == "bold-start" and not bold:
                bold = True
            elif span["format"] == "bold-end" and bold:
                bold = False
            else:
                return None
        else:
            runs.extend({**run, **({"bold": True} if bold else {})}
                        for run in (span.get("runs") or [{"kind": "text", "text": span["text"]}]))
        cursor = at + len(marker)
        if right and text[cursor:] and not text[cursor].isspace():
            runs.append({"kind": "text", "text": right})
    if bold:
        return None
    runs.append({"kind": "text", "text": text[cursor:]})
    value = "".join(r["text"] for r in runs)
    if re.search(r"__RF_[A-Za-z0-9_]+__", value):
        return None
    return {"text": value, "runs": [r for r in runs if r["text"]]}
