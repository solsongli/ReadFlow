"""Geometric display-math evidence, distinct from protected inline mathematics."""
import re
import statistics
import pymupdf as fitz

OPERATORS = re.compile(r"[=∈∉≤≥⇐⇒→∑∫∪∩∧∨±×^+−*/]")
NUMBER = re.compile(r"\(\s*\d+[a-z]?\s*\)\s*$")
FUNCTIONS = frozenset("arg max min sin cos tan log exp lim len diag det trace inf sup Pr s t st at ti".split())


def prose_words(row):
    text = row["text"]
    for part in reversed(row.get("math_parts", [])):
        value = part["text"] if isinstance(part, dict) else part
        if isinstance(part, dict) and "start" in part:
            text = text[: part["start"]] + " " * (part["end"] - part["start"]) + text[part["end"] :]
        else:
            text = text.replace(value, " ", 1)
    return [w for w in re.findall(r"[A-Za-z]{2,}", text) if w not in FUNCTIONS]


def math_seed(row):
    value = row["text"].strip()
    calls = sum(len(m.group()) for m in re.finditer(r"[A-Za-zΑ-Ωα-ω]\s*\([^)]{1,12}\)", value))
    return (
        len(value) > 1
        and not row.get("sideways")
        and len(prose_words(row)) <= 2
        and (
            row.get("math_ratio", 0) >= 0.28
            or len(OPERATORS.findall(value)) / max(1, len(re.sub(r"\s", "", value))) >= 0.1
            or calls / max(1, len(value)) >= 0.4
        )
        and not NUMBER.fullmatch(value)
    )


def classify_display_math(rows, body_size, width):
    for row in rows:
        row.pop("display_group", None)
        row.pop("display_evidence", None)
        row["inline_math"] = row.get("math_ratio", 0) >= 0.28
    prose = [
        r
        for r in rows
        if len(prose_words(r)) >= 4 and not r.get("sideways") and r["type"] not in ("header", "footer", "footnote")
    ]
    narrow = [r for r in prose if width * 0.24 < r["bbox"][2] - r["bbox"][0] < width * 0.56]
    split = (
        width / 2
        if (
            sum(r["bbox"][0] < width * 0.42 for r in narrow) >= 2
            and sum(r["bbox"][0] > width * 0.45 for r in narrow) >= 2
        )
        else None
    )

    def column(row):
        return int((row["bbox"][0] + row["bbox"][2]) / 2 > split) if split else 0

    seeds = [r for r in rows if r["type"] not in ("header", "footer", "footnote") and math_seed(r)]
    groups = []
    for seed in seeds:
        box = fitz.Rect(seed["bbox"])
        matches = [
            g
            for g in groups
            if g["column"] == column(seed)
            and (g["box"] + (-body_size * 2, -body_size * 0.6, body_size * 2, body_size * 0.6)).intersects(box)
        ]
        group = {"box": box, "rows": [seed], "column": column(seed)}
        for prior in matches:
            group["box"] |= prior["box"]
            group["rows"].extend(prior["rows"])
            groups.remove(prior)
        groups.append(group)
    for row in rows:
        if not NUMBER.fullmatch(row["text"]):
            continue
        candidates = [
            g
            for g in groups
            if g["column"] == column(row)
            and row["bbox"][0] >= g["box"].x1 - body_size * 0.2
            and any(
                abs(row.get("baseline", row["bbox"][3]) - member.get("baseline", member["bbox"][3]))
                <= body_size * 0.4
                for member in g["rows"]
            )
        ]
        if candidates:
            target = min(candidates, key=lambda g: abs(row["bbox"][0] - g["box"].x1))
            target["rows"].append(row)
            target["box"] |= fitz.Rect(row["bbox"])
    for group in groups:
        # Limits, equation numbers and tiny operators belong to the nearby equation, not to their own block.
        for row in rows:
            if (
                row in group["rows"]
                or row in seeds
                or NUMBER.fullmatch(row["text"])
                or column(row) != group["column"]
            ):
                continue
            if (
                len(row["text"].strip()) > 8
                or prose_words(row)
                or not (row.get("math_parts") or NUMBER.fullmatch(row["text"]) or OPERATORS.search(row["text"]))
            ):
                continue
            if (group["box"] + (-body_size, -body_size, body_size, body_size)).intersects(fitz.Rect(row["bbox"])):
                group["rows"].append(row)
                group["box"] |= fitz.Rect(row["bbox"])
    for identity, group in enumerate(groups):
        box, members = group["box"], group["rows"]
        text = " ".join(r["text"] for r in members)
        if len(text.strip()) <= 1:
            continue
        peers = [r for r in prose if column(r) == group["column"] and r not in members]
        left = statistics.median(r["bbox"][0] for r in peers) if peers else width * 0.1
        right = max((r["bbox"][2] for r in peers), default=width * 0.9)
        centered = abs((box.x0 + box.x1 - left - right) / 2) <= max(body_size * 2, (right - left) * 0.12)
        numbered = any(NUMBER.search(r["text"]) for r in members)
        neighbors = [
            r
            for r in rows
            if r not in members
            and r["type"] not in ("header", "footer")
            and column(r) == group["column"]
            and min(r["bbox"][2], box.x1) - max(r["bbox"][0], box.x0) > body_size
        ]
        before = max((r for r in neighbors if r["bbox"][1] < box.y0), key=lambda r: r["bbox"][3], default=None)
        after = min((r for r in neighbors if r["bbox"][1] > box.y0), key=lambda r: r["bbox"][1], default=None)
        above = before["bbox"][3] if before else box.y0 - body_size
        below = after["bbox"][1] if after else box.y1 + body_size
        baselines = [r.get("baseline", r["bbox"][3]) for r in members if r["size"] >= body_size * 0.85]
        upper = box.y0 - above >= body_size * 0.12 or (
            before and baselines and min(baselines) - before.get("baseline", above) >= body_size * 1.55
        )
        lower = below - box.y1 >= body_size * 0.12 or (
            after and baselines and after.get("baseline", below) - max(baselines) >= body_size * 1.55
        )
        clear = upper and lower
        if not clear or not (centered or numbered):
            continue
        evidence = {
            "centered": centered,
            "numbered": numbered,
            "above_gap": box.y0 - above,
            "below_gap": below - box.y1,
        }
        for row in members:
            row.update(display_group=identity, display_evidence=evidence, inline_math=False)
