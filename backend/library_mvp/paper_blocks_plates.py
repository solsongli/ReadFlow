"""Caption-bounded plot plates keep disconnected panels and their axis labels together."""
import re
import pymupdf as fitz


def consolidate_plate(page, rows, images):
    if len(images) < 2 or any(r["type"] in {"title", "abstract", "reference"} for r in rows):
        return images
    captions = [r for r in rows if r["type"] == "caption"]
    if len(captions) > 1 or any(r["type"] != "figure" for r in images):
        return images
    figures = [r for r in images if r["type"] == "figure"]
    if len(figures) < 2:
        return images
    text = [
        s for r in rows if r["type"] not in {"header", "footer", "caption"} for s in r.get("source_lines", [r])
    ]
    if captions:
        text = [r for r in text if r["bbox"][3] < captions[0]["bbox"][1]]
    if len(text) < 20:
        return images
    short = [
        r
        for r in text
        if len(r["text"]) <= 75 and len(re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]", r["text"])) <= 8
    ]
    if len(short) / len(text) < 0.9 or any(len(r["text"].split()) > 12 for r in text):
        return images
    region = fitz.Rect(figures[0]["bbox"])
    for figure in figures[1:]:
        region |= fitz.Rect(figure["bbox"])
    if captions and region.y1 > captions[0]["bbox"][1] + 2:
        return images
    for label in short:
        box = fitz.Rect(label["bbox"])
        if 0.05 * page.rect.height < box.y0 and box.y1 < page.rect.height * 0.94:
            region |= box
    if region.width < page.rect.width * 0.6 or region.height < page.rect.height * 0.4:
        return images
    if (
        sum(fitz.Rect(r["bbox"]).width * fitz.Rect(r["bbox"]).height for r in figures)
        < region.width * region.height * 0.03
    ):
        return images
    plate = {
        "type": "figure",
        "bbox": list(region),
        "text": "",
        "math_parts": [],
        "source": "plot_plate",
        "confidence": 0.85,
        "plate_evidence": {"components": len(figures), "short_lines": len(short), "lines": len(text)},
    }
    if captions:
        plate.update(caption_text=captions[0]["text"], caption_bbox=captions[0]["bbox"])
    return [r for r in images if r not in figures] + [plate]
