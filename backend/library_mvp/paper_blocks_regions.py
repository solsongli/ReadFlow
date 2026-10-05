"""Caption/region ownership, including form padding and multi-panel spanning figures."""
import pymupdf as fitz
import re
from .paper_blocks_model import CAPTION
from .document_layout import fraction


def caption_kind(row):
    match = CAPTION.match(row["text"])
    return "table" if match and match[1].lower() in {"table", "表"} else "figure"


def ruled_table(page, caption):
    box = fitz.Rect(caption["bbox"])
    rules = [
        d["rect"] + (-0.3, -0.3, 0.3, 0.3)
        for d in page.get_drawings()
        if d["rect"].height < 2
        and d["rect"].width > 80
        and min(d["rect"].x1, box.x1) - max(d["rect"].x0, box.x0) > min(d["rect"].width, box.width) * 0.6
    ]
    choices = []
    for below in (True, False):
        nearby = [r for r in rules if (0 <= r.y0 - box.y1 < 240 if below else 0 <= box.y0 - r.y1 < 240)]
        nearby.sort(key=lambda r: abs(r.y0 - (box.y1 if below else box.y0)))
        if len(nearby) < 2:
            continue
        first = nearby[0]
        group = [r for r in nearby if abs(r.x0 - first.x0) < 8 and abs(r.x1 - first.x1) < 8]
        area = fitz.Rect(first)
        for line in group[1:]:
            area |= line
        if len(group) >= 2 and area.height > 15:
            choices.append((abs(first.y0 - (box.y1 if below else box.y0)), area))
    return min(choices, key=lambda p: p[0])[1] if choices else None


def refine_regions(page, rows, images, regions):
    for row in rows:
        match = re.match(r"^(Definition|Theorem|Lemma|Proposition|Corollary|Proof)\b", row["text"], re.I)
        if match:
            row["environment"] = match[1].casefold()
            if row["type"] == "formula":
                row.update(type="text", inline_math=True)
    captions = [r for r in rows if r["type"] == "caption" and CAPTION.match(r["text"])]
    for caption in captions:
        box, kind = fitz.Rect(caption["bbox"]), caption_kind(caption)
        candidates = []
        for image in images:
            if image["type"] not in {"figure", "table"}:
                continue
            area = fitz.Rect(image["bbox"])
            horizontal = min(area.x1, box.x1) - max(area.x0, box.x0)
            if horizontal < min(area.width, box.width) * 0.5:
                continue
            overlap = area.intersects(box)
            distance = min(abs(area.y1 - box.y0), abs(area.y0 - box.y1))
            if distance > 45 and not overlap:
                continue
            if image.get("caption_bbox") and image["caption_bbox"] != caption["bbox"]:
                continue
            candidate = fitz.Rect(area)
            if overlap:
                # Form/image rectangles can contain invisible padding over the caption
                # and the following prose. Caption boundaries override that padding.
                if kind == "table" and box.y1 < area.y0 + area.height * 0.35:
                    candidate.y0 = box.y1 + 0.5
                else:
                    candidate.y1 = box.y0 - 0.5
            if candidate.width > 25 and candidate.height > 15:
                candidates.append((distance if not overlap else 0, image, candidate))
        if not candidates:
            grid = ruled_table(page, caption) if kind == "table" else None
            if grid is None:
                continue
            image = {
                "type": "table",
                "bbox": list(grid),
                "text": "",
                "math_parts": [],
                "source": "table_rules",
                "confidence": 0.9,
            }
            images.append(image)
            candidates.append((0, image, grid))
        best = min(candidates, key=lambda p: (p[0], p[1]["type"] != kind))
        _, image, candidate = best
        middle = page.rect.width / 2
        if kind == "figure" and box.width < page.rect.width * 0.5 and candidate.x0 < middle < candidate.x1:
            left_caption = box.x1 <= middle + 5
            right_caption = box.x0 >= middle - 5
            opposite = [
                r
                for r in regions
                if r["type"] in {"text", "abstract"}
                and r["confidence"] >= 0.85
                and r["bbox"][3] - r["bbox"][1] > 35
                and min(r["bbox"][3], candidate.y1) - max(r["bbox"][1], candidate.y0) > 30
                and (left_caption and r["bbox"][0] > middle or right_caption and r["bbox"][2] < middle)
            ]
            strong_figure = any(
                r["type"] == "figure" and r["confidence"] >= 0.85 and fraction(candidate, r["bbox"]) > 0.8
                for r in regions
            )
            if opposite and not strong_figure:
                if left_caption:
                    candidate.x1 = min(candidate.x1, min(r["bbox"][0] for r in opposite) - 1)
                elif right_caption:
                    candidate.x0 = max(candidate.x0, max(r["bbox"][2] for r in opposite) + 1)
        image.update(type=kind, bbox=list(candidate), caption_text=caption["text"], caption_bbox=caption["bbox"])
        # A common caption spanning multiple panels owns all adjacent aligned panels.
        for _, other, other_box in candidates:
            if other is image or other not in images:
                continue
            same_side = (candidate.y1 <= box.y0 and other_box.y1 <= box.y0) or (
                candidate.y0 >= box.y1 and other_box.y0 >= box.y1
            )
            vertical_overlap = min(candidate.y1, other_box.y1) - max(candidate.y0, other_box.y0)
            if same_side and vertical_overlap > min(candidate.height, other_box.height) * 0.5:
                candidate |= other_box
                image["bbox"] = list(candidate)
                images.remove(other)
    for image in images:
        if image["type"] != "table":
            continue
        box = fitz.Rect(image["bbox"])
        for row in rows:
            note = fitz.Rect(row["bbox"])
            if (
                re.match(r"^(?:Notes?[.:]|注[:：])", row["text"], re.I)
                and box.y0 + box.height * 0.5 < note.y0 < box.y1 + 35
                and min(note.x1, box.x1) > max(note.x0, box.x0)
            ):
                row.update(type="footnote", table_note=True)
                box.y1 = min(box.y1, note.y0 - 0.5)
        image["bbox"] = list(box)
    # Remove uncaptioned decorative boxes around prose/theorem environments.
    for image in list(images):
        if image.get("caption_bbox") or image["type"] not in {"figure", "table"}:
            continue
        text_regions = [r for r in regions if r["type"] in {"text", "abstract"} and r["confidence"] >= 0.85]
        environment = any(r.get("environment") and fraction(r["bbox"], image["bbox"]) > 0.8 for r in rows)
        if environment or any(fraction(image["bbox"], r["bbox"]) > 0.8 for r in text_regions):
            native = [r for r in rows if fraction(r["bbox"], image["bbox"]) > 0.8]
            if environment or sum(len(r["text"].split()) for r in native) > 30:
                images.remove(image)
    return images
