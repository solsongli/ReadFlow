"""Style is evidence for a heading only together with an actual following paragraph gap."""
import re


def family(font):
    value = (font or "").casefold()
    if re.match(r"^(?:times|nimbusroman|liberationserif)", value):
        return "times"
    if re.match(r"^(?:arial|helvetica|nimbussans|liberationsans)", value):
        return "sans"
    if re.match(r"^cm(?:r|bx|ti|sl|ss|tt|csc)\d", value):
        return "computer-modern-text"
    return re.sub(r"[-,](?:regu|medi|bold|semi|italic|it\b|roman|book|light).*$", "", value)


def prose_font(a, b):
    first, second = a.get("text_size", a["size"]), b.get("text_size", b["size"])
    return (
        family(a.get("text_font", a.get("font"))) == family(b.get("text_font", b.get("font")))
        or a.get("inline_math")
        or b.get("inline_math")
    ) and abs(first - second) <= max(first, second) * 0.12


def continuous_lines(previous, current, normal_gap):
    """Superscripts may overlap glyph boxes while the actual prose baselines remain regular."""
    last = (previous.get("source_lines") or [previous])[-1]
    before = last.get("baseline")
    after = current.get("baseline")
    size = max(previous.get("text_size", previous["size"]), current.get("text_size", current["size"]))
    gap = current["bbox"][1] - last["bbox"][3]
    if -0.5 <= gap <= normal_gap + size * 0.25:
        return True
    if before is None or after is None:
        return False
    return gap < 0 and size * 0.65 <= after - before <= size + normal_gap + size * 0.25


def heading_evidence(row, rows, normal_gap):
    if re.fullmatch(r"[\d.\s-]+", row["text"]) or "@" in row["text"] or re.search(r"https?://|www\.", row["text"]):
        return None
    box = row["bbox"]
    below = [
        r
        for r in rows
        if r is not row
        and r["type"] not in ("header", "footer")
        and not r["sideways"]
        and r["bbox"][1] > box[1] + row["size"] * 0.55
        and min(box[2], r["bbox"][2]) - max(box[0], r["bbox"][0])
        > min(box[2] - box[0], r["bbox"][2] - r["bbox"][0]) * 0.5
    ]
    after = min(below, key=lambda r: r["bbox"][1], default=None)
    if after is None:
        return None
    gap = after["bbox"][1] - box[3]
    ratio = row["size"] / max(1, after["size"])
    weight_change = row["bold"] and not after["bold"]
    if gap > max(normal_gap + min(row["size"] * 0.05, 0.5), row["size"] * 0.25) and (
        ratio > 1.08 or weight_change
    ):
        return {
            "size_ratio": ratio,
            "weight_change": weight_change,
            "after_gap": gap,
            "normal_gap": normal_gap,
            "next_bbox": after["bbox"],
        }
    return None
