"""PP-DocLayout-S's published tensor contract; independent preprocessing and fusion."""
import hashlib
import pymupdf as fitz
from PIL import Image
from .document_cache import cached

KINDS = (
    "heading",
    "figure",
    "text",
    "number",
    "abstract",
    "text",
    "caption",
    "formula",
    "table",
    "caption",
    "reference",
    "title",
    "footnote",
    "header",
    "figure",
    "footer",
    "figure",
    "caption",
    "figure",
    "number",
    "header",
    "footer",
    "footnote",
)


def page_layout(page, models, directory):
    import numpy as np

    pix = page.get_pixmap(matrix=fitz.Matrix(480 / page.rect.width, 480 / page.rect.height), alpha=False)
    image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples).resize(
        (480, 480), Image.Resampling.BILINEAR
    )
    identity = models.revision + "-layout1-" + hashlib.sha256(image.tobytes()).hexdigest() + str(page.rect)

    def detect():
        pixels = np.asarray(image, np.float32) / 255
        pixels = (pixels - np.array([0.485, 0.456, 0.406], np.float32)) / np.array(
            [0.229, 0.224, 0.225], np.float32
        )
        result = models.run(
            "layout",
            {
                "image": pixels.transpose(2, 0, 1)[None],
                "scale_factor": np.array([[480 / page.rect.height, 480 / page.rect.width]], np.float32),
            },
        )
        rows = []
        for category, score, x0, y0, x1, y1 in result[0][: int(result[1][0])]:
            if not np.isfinite([category, score, x0, y0, x1, y1]).all() or score < 0.55:
                continue
            box = fitz.Rect(float(x0), float(y0), float(x1), float(y1)) & page.rect
            if 0 <= int(category) < len(KINDS) and not box.is_empty:
                rows.append(
                    {"type": KINDS[int(category)], "bbox": list(box), "confidence": round(float(score), 4)}
                )
        return rows

    return cached(directory, f"layout-{page.number + 1:04}.json", identity, detect)


def fraction(inner, outer):
    a, b = fitz.Rect(inner), fitz.Rect(outer)
    common = a & b
    return max(0, common.width) * max(0, common.height) / max(0.01, a.width * a.height)


def fuse_layout(rows, images, regions, page):
    """Preserve typographic paragraph boundaries; model geometry only changes ownership/types."""
    for row in rows:
        row.setdefault("source", "heuristic")
        row.setdefault("confidence", 0.5)
        hits = [r for r in regions if r["confidence"] >= 0.85 and fraction(row["bbox"], r["bbox"]) > 0.8]
        hit = max(hits, key=lambda r: r["confidence"], default=None)
        if hit:
            row.update(layout_type=hit["type"], layout_confidence=hit["confidence"])
        if not hit or row["type"] in ("header", "footer", "formula", "caption", "reference"):
            continue
        kind = hit["type"]
        if kind == "formula" and not row.get("display_evidence"):
            continue
        scanned = row.get("source") == "ocr"
        # A short run-in phrase is never promoted to a heading by a detector alone.
        allowed = kind == row["type"] or (
            kind == "heading"
            and row.get("heading_evidence")
            or kind == "title"
            and page.number == 0
            and row.get("size", 0) >= 14
            or kind in ("header", "footer")
            and (row["bbox"][3] < page.rect.height * 0.1 or row["bbox"][1] > page.rect.height * 0.91)
            or kind == "text"
            and row["type"] == "heading"
            and not row.get("heading_evidence")
            or scanned
            and kind in ("heading", "abstract", "caption", "formula", "reference", "footnote")
        )
        if allowed:
            row.update(
                type=kind,
                source="ocr" if row.get("source") == "ocr" else "layout",
                confidence=row["confidence"] if scanned else hit["confidence"],
                layout_confidence=hit["confidence"],
            )
    for region in regions:
        if region["type"] not in ("figure", "table") or region["confidence"] < 0.7:
            continue
        box = fitz.Rect(region["bbox"])
        captions = [
            r for r in rows if r["type"] == "caption" and min(r["bbox"][2], box.x1) > max(r["bbox"][0], box.x0)
        ]
        caption = min(
            captions, key=lambda c: min(abs(c["bbox"][1] - box.y1), abs(box.y0 - c["bbox"][3])), default=None
        )
        attached = bool(caption and min(abs(caption["bbox"][1] - box.y1), abs(box.y0 - caption["bbox"][3])) < 35)
        caption_below = bool(caption and caption["bbox"][1] >= (box.y0 + box.y1) / 2)
        if caption and fraction(caption["bbox"], box) > 0.1:
            if caption["bbox"][1] > box.y0 + box.height * 0.6:
                box.y1 = caption["bbox"][1] - 0.5
            elif caption["bbox"][3] < box.y0 + box.height * 0.4:
                box.y0 = caption["bbox"][3] + 0.5
        hits = [i for i in images if fraction(i["bbox"], box) > 0.5 or fraction(box, i["bbox"]) > 0.5]
        if hits:
            target = hits[0]
            # Existing vector evidence can extend beyond the detector; keep it.
            for image in hits:
                box |= fitz.Rect(image["bbox"])
                if image is not target:
                    images.remove(image)
            # PDF image/form bounds can include invisible padding beyond the actual figure.
            # Unioning that padding back in must not swallow its caption or the next paragraph.
            if attached:
                if caption_below:
                    box.y1 = min(box.y1, caption["bbox"][1] - 0.5)
                else:
                    box.y0 = max(box.y0, caption["bbox"][3] + 0.5)
            target.update(bbox=list(box), type=region["type"], source="layout", confidence=region["confidence"])
        else:
            target = {**region, "bbox": list(box), "source": "layout", "text": "", "math_parts": []}
            images.append(target)
        if caption and min(abs(caption["bbox"][1] - box.y1), abs(box.y0 - caption["bbox"][3])) < 35:
            target.update(caption_text=caption["text"], caption_bbox=caption["bbox"])
    return rows, images
