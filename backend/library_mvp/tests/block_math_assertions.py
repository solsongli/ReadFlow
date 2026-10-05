"""Shared metric: continuous lowercase continuation must not form a separate text block."""
import re
from backend.library_mvp.paper_blocks_paragraphs import sentence_end
from backend.library_mvp.paper_blocks_typography import continuous_lines


def broken_paragraphs(blocks):
    flow = [b for b in blocks if b["type"] not in ("header", "footer")]
    pairs = []
    for a, b in zip(flow, flow[1:]):
        if a["type"] != "text" or b["type"] != "text" or sentence_end(a["text"]):
            continue
        if not re.match(r"^[a-z]", b["text"]) or a["anchors"][-1]["page"] != b["anchors"][0]["page"]:
            continue
        first, last = b["source_lines"][0], a["source_lines"][-1]
        box, prior = first["bbox"], last["bbox"]
        overlap = min(box[2], prior[2]) - max(box[0], prior[0])
        if overlap <= min(box[2] - box[0], prior[2] - prior[0]) * 0.6:
            continue
        if continuous_lines(a, {**first, "size": b["size"]}, 1.5):
            pairs.append((a, b))
    return pairs


def single_line_fragments(blocks):
    return {r["id"] for pair in broken_paragraphs(blocks) for r in pair if len(r["source_lines"]) == 1}
