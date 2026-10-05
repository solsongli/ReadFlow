"""Local document order, continuation context and run-in bold markers."""
import re
from .paper_blocks_model import protect, SKIP


def leading(block):
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
    text, mapping = protect(block)
    lead = block.get("lead", "")
    if lead and text.startswith(lead):
        begin, end = f'__RF_{block["id"][:12]}_BOLD_START__', f'__RF_{block["id"][:12]}_BOLD_END__'
        mapping[begin] = {"text": "", "format": "bold-start"}
        mapping[end] = {"text": "", "format": "bold-end"}
        text = begin + lead + end + text[len(lead) :]
    return text, mapping
