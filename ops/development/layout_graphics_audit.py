"""Distinguish editable Type-3 glyph paints from real diagram strokes in PDF audits."""
from collections import Counter
import re
import pymupdf as fitz


def non_text_drawings(page):
    fonts = {re.sub(r"^[A-Z]{6}\+", "", row[3]).replace(" ", "") for row in page.get_fonts() if row[2] == "Type3"}
    grid = {}
    for span in page.get_texttrace() if fonts else []:
        if span["font"].replace(" ", "") in fonts:
            for char in span["chars"]:
                margin = max(.5, min(2, span["size"] * .2))
                box = fitz.Rect(char[3]) + (-margin, -margin, margin, margin)
                for x in range(int(box.x0 // 16), int(box.x1 // 16) + 1):
                    for y in range(int(box.y0 // 16), int(box.y1 // 16) + 1):
                        grid.setdefault((x, y), []).append(box)
    drawings, glyphs = [], 0
    for draw in page.get_drawings():
        rect = fitz.Rect(draw["rect"])
        center = (rect.tl + rect.br) / 2
        candidates = grid.get((int(center.x // 16), int(center.y // 16)), [])
        if draw["type"] == "f" and any(box.contains(rect) for box in candidates):
            glyphs += 1
        else:
            drawings.append(draw)
    return drawings, glyphs


def image_signature(page):
    # get_image_info includes invocations entirely outside the page/Form clip.
    # A visible image must intersect its own clip, hence at least one clip in
    # this union. Only use that proof when every image belongs to a Form.
    bounds = fitz.Rect(0, 0, page.cropbox.width, page.cropbox.height)
    resources = page.get_images(full=True)
    all_in_forms = resources and all(row[-1] for row in resources)
    clips = (
        [fitz.Rect(d["scissor"]) for d in page.get_drawings(extended=True) if d["type"] == "clip"]
        if all_in_forms
        else []
    )
    images, clipped = Counter(), 0
    for image in page.get_image_info(hashes=True):
        box = fitz.Rect(image["bbox"])
        if not bounds.intersects(box) or clips and not any(region.intersects(box) for region in clips):
            clipped += 1
            continue
        images[(tuple(round(v, 2) for v in box), bytes(image["digest"]).hex())] += 1
    return images, clipped


def same_images(left, right):
    remaining = list(right.elements())
    for box, digest in left.elements():
        match = next(
            (
                i
                for i, (candidate, value) in enumerate(remaining)
                if value == digest and max(abs(a - b) for a, b in zip(box, candidate)) <= 0.1
            ),
            None,
        )
        if match is None:
            return False
        remaining.pop(match)
    return not remaining
