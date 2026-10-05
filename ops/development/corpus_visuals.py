"""Low-resolution contact sheets; original/reflow pages are not claimed to align one-to-one."""
from PIL import Image, ImageDraw
from pathlib import Path
import shutil
import subprocess
import tempfile


def contact_sheets(source, translated, directory, per_sheet=6):
    binary = shutil.which("pdftoppm")
    if binary is None:
        raise RuntimeError("Corpus contact sheets require an existing pdftoppm executable; nothing is downloaded")
    for previous in directory.glob("comparison-*.png"):
        previous.unlink()
    # Keep the audit renderer independent of the extraction library. Some embedded
    # PDF font combinations trigger a native MuPDF abort during rasterization/close.
    with tempfile.TemporaryDirectory(prefix="readflow-corpus-raster-") as temporary:
        root = Path(temporary)
        pages = []
        for index, path in enumerate((source, translated)):
            prefix = root / str(index)
            subprocess.run(
                [binary, "-png", "-scale-to", "412", str(path), str(prefix)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=180,
            )
            pages.append(sorted(root.glob(f"{index}-*.png"), key=lambda p: int(p.stem.split("-")[-1])))
        count = max(map(len, pages))
        for start in range(0, count, per_sheet):
            rows = min(per_sheet, count - start)
            sheet = Image.new("RGB", (720, rows * 450), "#dedede")
            draw = ImageDraw.Draw(sheet)
            for offset in range(rows):
                index = start + offset
                for column, files in enumerate(pages):
                    x, y = column * 360 + 8, offset * 450 + 28
                    label = f'{"Source" if column == 0 else "Fake reflow"} p. {index + 1}'
                    draw.text((x, y - 20), label, fill="black")
                    if index >= len(files):
                        continue
                    with Image.open(files[index]) as image:
                        image.thumbnail((344, 412), Image.Resampling.LANCZOS)
                        sheet.paste(image.convert("RGB"), (x, y))
            sheet.save(directory / f"comparison-{start + 1:03}.png")
