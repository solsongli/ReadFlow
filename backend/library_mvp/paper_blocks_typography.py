"""Style is evidence for a heading only together with an actual following paragraph gap."""
import re


def family(font):
    value = (font or "").casefold()
    if re.match(r"^cm(?:r|bx|ti|sl|ss|tt|csc)\d", value):
        return "computer-modern-text"
    return re.sub(r"[-,](?:regu|medi|bold|semi|italic|it\b|roman|book|light).*$", "", value)


def prose_font(a, b):
    return (
        family(a.get("font")) == family(b.get("font"))
        and abs(a["size"] - b["size"]) <= max(a["size"], b["size"]) * 0.12
    )


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
    if gap > max(normal_gap + min(row["size"] * 0.05, 0.5), row["size"] * 0.25) and (ratio > 1.08 or weight_change):
        return {
            "size_ratio": ratio,
            "weight_change": weight_change,
            "after_gap": gap,
            "normal_gap": normal_gap,
            "next_bbox": after["bbox"],
        }
    return None
