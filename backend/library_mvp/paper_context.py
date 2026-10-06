"""Local document order, continuation context and structured run-in labels."""
import re
from .paper_blocks_model import protect, SKIP


def leading(block):
    if block["type"] == "abstract":
        prefix = re.match(r"^(?:Abstract|摘要)\s*[—–:：-]\s*", block["text"], re.I)
        if prefix:
            return prefix.group().strip()
    line = next(iter(block.get("source_lines", [])), {})
    lead = line.get("lead", "")
    if not lead and re.search(r"bold|black|demi", line.get("start_font", ""), re.I):
        match = re.match(r"^.{1,75}?[.:](?:\s|$)", block["text"])
        lead = match[0].strip() if match else ""
    return lead if block["type"] in {"text", "list", "abstract"} and block["text"].startswith(lead) else ""


def contextualize(blocks, terms=()):
    from .paper_terms import occurs

    section, previous, seen, result = "", "", set(), []
    for block in blocks:
        if block["type"] == "heading":
            section = block["text"][:250]
        first = [
            t["source"]
            for t in terms
            if t["source"].casefold() not in seen
            and t["target"] != t["source"]
            and not t.get("keep")
            and occurs(t["source"], block["text"])
        ]
        seen.update(t.casefold() for t in first)
        continuation = len(block.get("anchors", [])) > 1 or bool(re.match(r"^[a-z]", block["text"]))
        result.append(
            {
                **block,
                "section": section,
                "previous_sentence": previous[-300:] if continuation else "",
                "first_terms": first,
                "lead": leading(block),
            }
        )
        if block["type"] not in SKIP:
            previous = re.split(r"(?<=[.!?。！？])\s+", block["text"].strip())[-1]
    return result


def protected_text(block):
    return protect(block)


def protected_fields(block):
    """Run-in label is a separate JSON field, never a magic string in model text."""
    text, mapping = protect(block)
    lead = leading(block)
    head = lead
    for marker, span in sorted(mapping.items(), key=lambda row: row[1]["start"], reverse=True):
        if span["start"] < len(lead) < span["end"]:
            return text, "", mapping
        if span["end"] <= len(lead):
            head = head[:span["start"]] + marker + head[span["end"]:]
    if head and text.startswith(head) and text[len(head):].strip():
        return text[len(head):].lstrip(), head, mapping
    return text, "", mapping
