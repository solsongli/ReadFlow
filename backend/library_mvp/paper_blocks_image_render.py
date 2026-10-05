"""Data-only label placement; Typst shares/subsets the document font instead of embedding it per crop."""
from pathlib import Path
import os
import pymupdf as fitz
from .paper_blocks_labels import translated_labels


def wrapped(text, font, size, width):
    lines, current, used = [], "", 0.0
    for char in text:
        advance = font.text_length(char, fontsize=size)
        if advance > width:
            return None
        if char == "\n" or used + advance > width:
            lines.append(current)
            current, used = "", 0.0
        if char != "\n":
            current += char
            used += advance
    if current:
        lines.append(current)
    return lines


def label_layout(root, block, cache, language, fingerprint, font_directories, display_width):
    labels = [r for r in translated_labels(block, cache, language, fingerprint) if r.get("translation")]
    if not labels:
        return [], 0
    fonts = [
        p
        for directory in font_directories.split(os.pathsep)
        if directory
        for p in Path(directory).rglob("*")
        if p.suffix.lower() in (".otf", ".ttf", ".ttc")
    ]
    file = next((p for p in fonts if "SourceHanSerif" in p.name or "NotoSerifCJK" in p.name), None)
    if file is None:
        return [], len(labels)
    font = fitz.Font(fontfile=str(file))
    placements, skipped = [], 0
    with fitz.open(root / block["asset"]) as doc:
        page = doc[0]
        scale = display_width / page.rect.width  # Millimetres per original PDF point.
        for label in labels:
            box = fitz.Rect(label["bbox"]) + (
                -block["bbox"][0],
                -block["bbox"][1],
                -block["bbox"][0],
                -block["bbox"][1],
            )
            box = ((box + (-1, -1, 1, 1)) * page.rotation_matrix) & page.rect
            placed = False
            for size in sorted({min(max(5, label.get("size", 9)), 12), 8, 6, 5}, reverse=True):
                lines = wrapped(label["translation"], font, size, max(0, box.width - 1))
                if lines and len(lines) * size * 1.3 <= box.height - 1:
                    placements.append(
                        {
                            "x": box.x0 * scale,
                            "y": box.y0 * scale,
                            "width": box.width * scale,
                            "height": box.height * scale,
                            "size": size * scale * 72 / 25.4,
                            "text": "\n".join(lines),
                        }
                    )
                    placed = True
                    break
            skipped += not placed
    return placements, skipped
