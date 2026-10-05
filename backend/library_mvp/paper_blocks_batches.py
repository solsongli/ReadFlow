"""Token-budget batches and stable page priority, independent of provider I/O."""
import json
import math
from .paper_blocks_model import protect
from .paper_terms import relevant


def estimate_tokens(text):
    return int(sum(1 if ord(char) > 127 else 0.3 for char in text)) + 40


def batches(blocks, budget=2400):
    """Previous batching retained for reproducible serial/two-worker benchmarks."""
    group, size = [], 0
    for block in blocks:
        tokens = estimate_tokens(block["text"])
        if group and (size + tokens > budget or len(group) >= 12):
            yield group
            group, size = [], 0
        group.append(block)
        size += tokens
    if group:
        yield group


def planned_batches(blocks, concurrency, title="", terms=None):
    # Reserve context/JSON/prompt space as well as the original text. The target is
    # 2k estimated input tokens; one indivisible block may exceed this budget.
    if not blocks:
        return []
    # Weights omit repeated empty fields and glossary metadata, matching the wire body.
    overhead = 230 + estimate_tokens(title[:500])
    weights = [
        estimate_tokens(protect(b)[0])
        + 35
        + estimate_tokens(b.get("previous_sentence", "")) * bool(b.get("previous_sentence"))
        + sum(estimate_tokens(t["source"] + t["target"]) for t in relevant(terms or [], [b]))
        for b in blocks
    ]
    target = max(1, min(len(blocks), 2 * concurrency))
    budget = min(max(300, 2100 - overhead), max(1, math.ceil(sum(weights) / target)))
    groups, group, size = [], [], 0
    for block, weight in zip(blocks, weights):
        if group and size + weight > budget:
            groups.append(group)
            group, size = [], 0
        group.append(block)
        size += weight
    if group:
        groups.append(group)
    while len(groups) < target:
        index = max(range(len(groups)), key=lambda i: len(groups[i]))
        group = groups[index]
        middle = len(group) // 2
        groups[index : index + 1] = [group[:middle], group[middle:]]
    # Coalesce using wire cost: repeated per-row terms overestimate a shared batch.
    from .paper_prompts import messages_for

    index = 0
    while index + 1 < len(groups) and len(groups) > target:
        combined = groups[index] + groups[index + 1]
        messages, _ = messages_for(combined, terms or [], "zh-CN", title)
        if estimate_tokens("".join(m["content"] for m in messages)) <= 2100:
            groups[index : index + 2] = [combined]
        else:
            index += 1
    return groups


def prioritize_pages(blocks, page):
    if type(page) is not int or page < 1:
        return blocks

    def priority(block):
        pages = [a.get("page", 0) for a in block.get("anchors", [])] or [block.get("page", 0)]
        return min((p - page for p in pages if page <= p <= page + 2), default=3)

    return sorted(blocks, key=priority)
