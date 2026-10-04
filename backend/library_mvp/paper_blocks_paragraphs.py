"""Text-flow continuity with floating figures kept after the complete paragraph."""
import re
from .paper_blocks_model import joined

FLOATS = frozenset({"figure", "table", "caption", "footnote"})
MARGINS = frozenset({"header", "footer"})


def split_word(text):
    return bool(re.search(r"[A-Za-z]-\s*$", text))


def sentence_end(text):
    text = re.sub(r"(?:\[\d+(?:[\s,;–-]+\d+)*\])+$", "", text.strip())
    return bool(re.search(r'[.!?。！？:：][\s”\'"\])]*$', text))


def inherited_indent(previous, row):
    last = (previous.get("source_lines") or [{}])[-1].get("indent_offset")
    current = row.get("indent_offset")
    return (
        last is not None
        and current is not None
        and last > 2
        and abs(current - last) <= max(2, row.get("size", 10) * 0.25)
    )


def continuation(previous, row, floating=False):
    if previous["type"] not in ("text", "list") or row["type"] != "text":
        return False
    if split_word(previous["text"]):
        return True
    last = previous["anchors"][-1].get("bbox", previous["bbox"])
    box = row["bbox"]
    columns = box[0] >= last[2] or box[2] <= last[0]
    boundary = previous["anchors"][-1]["page"] != row["anchors"][0]["page"] or columns or box[1] + 30 < last[1]
    return (
        bool(boundary or floating)
        and not sentence_end(previous["text"])
        and (not row.get("first_indent") or inherited_indent(previous, row))
        and (floating or not row.get("paragraph_gap"))
        and bool(re.match(r"^[a-z]", row["text"]))
    )


def join_paragraphs(rows, words):
    output, previous = [], None
    for row in rows:
        if row["type"] in MARGINS | FLOATS:
            output.append(row)
            continue
        floating = previous is not None and any(r["type"] in FLOATS for r in output[previous + 1 :])
        prior = output[previous] if previous is not None else None
        if prior is not None and continuation(prior, row, floating):
            reason = "hyphen" if split_word(prior["text"]) else "floating" if floating else "column_or_page"
            # Metadata records the original boundary flags rather than erasing evidence of the join.
            row["anchors"][0]["continuation_reason"] = reason
            row["anchors"][0]["inherited_indent"] = inherited_indent(prior, row)
            prior.setdefault("continuations", []).append(
                {"reason": reason, "source_end": prior["text"][-100:], "source_start": row["text"][:100]}
            )
            prior["text"] = joined(prior["text"], row["text"], words)
            prior["source_lines"].extend(row["source_lines"])
            prior["anchors"].extend(row["anchors"])
            prior["math_parts"].extend(row["math_parts"])
            prior["last_line"] = row.get("last_line", row["bbox"])
        else:
            output.append(row)
            previous = len(output) - 1 if row["type"] in ("text", "list") else None
    return output
