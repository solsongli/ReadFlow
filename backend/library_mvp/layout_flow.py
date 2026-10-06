"""Local rich-text line breaking; model strings are always escaped, never HTML."""
import html
import re
from .layout_text import boundaries, plain, slice_runs

OPENING = frozenset("（([{「『【《〈“‘")
CLOSING = frozenset("，。、；：！？）)]}」』】》〉”’%‰")
NATIVE_CJK = frozenset("（「『【《〈“‘，。、；：！？）」』】》〉”’")


def groups(text):
    """Glue a closing mark to its predecessor and an opening mark to its successor.

    Story already handles standard CJK punctuation. Short nowrap spans also
    cover ASCII parentheses/percent signs and boundaries between styled runs.
    Unlike word joiners, these spans do not add invisible text to the PDF.
    """
    start = 0
    for end in range(1, len(text) + 1):
        if end < len(text) and (text[end - 1] in OPENING or text[end] in CLOSING):
            continue
        yield start, end
        start = end


def rich_html(runs):
    text = plain(runs)
    output = []
    pending = []

    def markup(parts):
        values = []
        for run in parts:
            value = html.escape(run.get("text", ""), quote=True).replace("\n", "<br>")
            tag = {"super": "sup", "sub": "sub"}.get(run.get("kind"))
            if tag:
                value = f"<{tag}>{value}</{tag}>"
            values.append(f"<strong>{value}</strong>" if run.get("bold") else value)
        return "".join(values)

    # Slice only around punctuation, not every character: ordinary paragraphs
    # remain one cheap HTML text node per rich run.
    cursor = 0
    for start, end in groups(text):
        if end - start < 2 or not any(c in (OPENING | CLOSING) - NATIVE_CJK for c in text[start:end]):
            continue
        pending.extend(slice_runs(runs, cursor, start))
        output.append(markup(pending))
        pending = []
        output.append('<span style="white-space:nowrap">' + markup(slice_runs(runs, start, end)) + "</span>")
        cursor = end
    output.append(markup(slice_runs(runs, cursor, len(text))))
    return "<div>" + "".join(output) + "</div>"


def title_lines(runs, count):
    """Preserve a multi-line title at semantic/word boundaries, without stretching."""
    text = plain(runs).strip()
    if count < 2 or not text or "\n" in text or len(text) < count * 5:
        return runs
    cuts = boundaries(text)
    result, start = [], 0
    for index in range(1, min(count, 4)):
        target = round(len(text) * index / count)
        choices = [p for p in cuts if start + 3 <= p <= len(text) - 3]
        semantic = [p for p in choices if re.search(r"[，、：；:,;\s]$", text[:p])]
        nearby = [p for p in semantic if abs(p - target) <= len(text) / count * 0.4]
        if not choices:
            break
        end = min(nearby or choices, key=lambda p: abs(p - target))
        result.extend(slice_runs(runs, start, end))
        result.append({"kind": "text", "text": "\n"})
        start = end
    result.extend(slice_runs(runs, start, len(text)))
    return result
