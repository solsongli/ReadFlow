"""Synthetic raster-image fixture; no user documents or network."""
from pathlib import Path
import pymupdf

root = Path(__file__).parent
with pymupdf.open() as doc:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 80, 60), False)
    pix.clear_with(255)
    pix.set_rect(pymupdf.IRect(0, 0, 40, 60), (230, 50, 40))
    pix.set_rect(pymupdf.IRect(40, 0, 80, 60), (40, 90, 220))
    image = pix.tobytes('png')
    (root / 'paper-image.png').write_bytes(image)
    for number in range(100):
        page = doc.new_page(width=400, height=600)
        page.insert_text((40, 70), f'Raster figure test - page {number + 1}', fontsize=16)
        page.insert_image(pymupdf.Rect(80, 140, 240, 260), stream=image)
        page.insert_text((80, 285), 'Figure 1. Original image colors.', fontsize=11)
    doc.save(root / 'paper-images.pdf', garbage=4, deflate=True)
