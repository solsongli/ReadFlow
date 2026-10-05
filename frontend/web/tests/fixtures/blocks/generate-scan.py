"""Rasterize the owned synthetic paper, discarding its text layer (no network or models)."""
from pathlib import Path
import pymupdf as fitz

root = Path(__file__).resolve().parent
with fitz.open(root / "paper.pdf") as source, fitz.open() as target:
    for page in source:
        bitmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        target.new_page(width=page.rect.width, height=page.rect.height).insert_image(page.rect, pixmap=bitmap)
    target.save(root / "paper-scan.pdf", garbage=4, deflate=True)
