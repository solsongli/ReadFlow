"""Raster-only recognition projected into unrotated CropBox coordinates."""
import hashlib
import pymupdf as fitz
from PIL import Image
from .document_cache import cached
from .document_ocr import DocumentOcr
from .document_layout import fraction


def recognize_region(page, box, models, directory, name, check):
    rect = fitz.Rect(box) & page.rect
    scale = min(2.5, 2600 / max(rect.width, rect.height))
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, alpha=False)
    image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    identity = models.revision + "-ocr1-" + hashlib.sha256(image.tobytes()).hexdigest()
    result = cached(directory, name, identity, lambda: DocumentOcr(models).recognize(image, check))
    # Pixel clipping rounds to an integer origin; use that exact origin rather than rect.x0.
    return [
        {
            **r,
            "bbox": [
                (r["bbox"][0] + pix.x) / scale,
                (r["bbox"][1] + pix.y) / scale,
                (r["bbox"][2] + pix.x) / scale,
                (r["bbox"][3] + pix.y) / scale,
            ],
        }
        for r in result
    ]


def scan_lines(page, models, directory, check):
    lines = recognize_region(page, page.rect, models, directory, f"ocr-page-{page.number + 1:04}.json", check)
    for row in lines:
        box = row["bbox"]
        row.update(
            size=(box[3] - box[1]) * 0.8,
            baseline=box[3],
            font="OCR",
            bold=False,
            sideways=False,
            math_parts=[],
            math_ratio=0,
            type="text",
        )
    return lines


def image_labels(page, images, models, directory, check):
    bitmaps = [i["bbox"] for i in page.get_image_info()]
    for image in images:
        if not any(fraction(box, image["bbox"]) > 0.5 for box in bitmaps):
            continue
        key = hashlib.sha256(str(image["bbox"]).encode()).hexdigest()[:12]
        labels = recognize_region(
            page, image["bbox"], models, directory, f"ocr-figure-{page.number + 1:04}-{key}.json", check
        )
        existing = image.setdefault("figure_text", [])
        for row in labels:
            if any(
                fraction(row["bbox"], prior["bbox"]) > 0.4 or fraction(prior["bbox"], row["bbox"]) > 0.6
                for prior in existing
            ):
                continue
            existing.append({**row, "font": "OCR", "size": (row["bbox"][3] - row["bbox"][1]) * 0.8})
