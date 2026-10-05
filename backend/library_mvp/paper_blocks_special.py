"""Small-footnote areas and caption continuations, using local geometry rather than article prose."""
import re
from .paper_blocks_typography import prose_font
from .paper_blocks_model import CAPTION, joined
from .paper_blocks_paragraphs import sentence_end, split_word


def mark_footnotes(page, rows, body_size):
    rules = [
        d["rect"]
        for d in page.get_drawings()
        if d["rect"].height < 2
        and body_size * 3 < d["rect"].width < page.rect.width * 0.65
        and d["rect"].y0 > page.rect.height * 0.65
    ]
    for rule in rules:
        candidates = sorted(
            [
                r
                for r in rows
                if r["type"] not in ("header", "footer")
                and r["size"] < body_size * 0.95
                and r["bbox"][1] >= rule.y0 - 1
                and rule.x0 - body_size * 2 <= r["bbox"][0] < rule.x1
            ],
            key=lambda r: r["bbox"][1],
        )
        if not candidates or candidates[0]["bbox"][1] - rule.y0 > body_size * 1.2:
            continue
        if not re.match(r"^[\d*∗†‡]", candidates[0]["text"]):
            continue
        # Repeated parallel rules are more likely a table than a footnote separator.
        if any(
            other != rule and abs(other.x0 - rule.x0) < 3 and 2 < abs(other.y0 - rule.y0) < 50 for other in rules
        ):
            continue
        prior = candidates[0]
        for row in candidates:
            if row is not prior and (not prose_font(prior, row) or row["bbox"][1] - prior["bbox"][3] > body_size):
                if row["bbox"][1] > page.rect.height * 0.91 and not re.match(
                    r"^[*∗†‡]|^\d+(?:\s|[A-Z])", row["text"]
                ):
                    row["type"] = "footer"
                break
            row.update(type="footnote", footnote_area=[rule.x0, rule.y0])
            prior = row


def include_small_figure_labels(rows, images, body_size):
    """Bring nearby tiny axis labels into the crop without absorbing normal prose/captions."""
    import pymupdf as fitz

    for image in images:
        if image["type"] != "figure":
            continue
        box = fitz.Rect(image["bbox"])
        caption = fitz.Rect(image["caption_bbox"]) if image.get("caption_bbox") else None
        padding = body_size * 2.5
        near = box + (-padding, -padding, padding, padding)
        for row in rows:
            if row["type"] not in ("text", "heading") or row.get("size", body_size) > body_size * 0.75:
                continue
            label = fitz.Rect(row["bbox"])
            if not near.intersects(label):
                continue
            if caption and (
                label.intersects(caption)
                or (caption.y0 > box.y1 and label.y1 >= caption.y0)
                or (caption.y1 < box.y0 and label.y0 <= caption.y1)
            ):
                continue
            box |= label
        image["bbox"] = list(box)


def mark_caption_continuations(rows, words):
    previous = None
    for row in rows:
        if row["type"] in ("header", "footer"):
            continue
        if row["type"] == "caption" and CAPTION.match(row["text"]):
            previous = row
            continue
        if previous and row["type"] == "text" and prose_font(previous, row):
            last, box = previous.get("last_line", previous["bbox"]), row["bbox"]
            boundary = box[0] >= last[2] or box[2] <= last[0] or box[1] + 30 < last[1]
            if boundary and (
                split_word(previous["text"])
                or (
                    not sentence_end(previous["text"])
                    and not row.get("first_indent")
                    and not row.get("paragraph_gap")
                )
            ):
                row.update(
                    type="caption",
                    caption_continuation_of=previous.get("caption_continuation_of", previous["bbox"]),
                )
                previous = row
                continue
        previous = None
    return rows


def join_captions(rows, words):
    output = []
    for row in rows:
        origin = row.get("caption_continuation_of")
        prior = (
            next(
                (
                    p
                    for p in reversed(output)
                    if p["type"] == "caption"
                    and p["bbox"] == origin
                    and p["anchors"][0]["page"] == row["anchors"][0]["page"]
                ),
                None,
            )
            if origin
            else None
        )
        if prior:
            prior["text"] = joined(prior["text"], row["text"], words)
            for key in ("anchors", "source_lines", "math_parts"):
                prior[key].extend(row[key])
            prior["last_line"] = row.get("last_line", row["bbox"])
        else:
            output.append(row)
    return output
