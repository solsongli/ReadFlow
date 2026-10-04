"""Generate only this small synthetic fixture with the installed Typst; no network or models."""
from pathlib import Path
import os
import subprocess
import json
import sys
import pymupdf
import tempfile
import hashlib
import shutil

root = Path(__file__).resolve().parent
repo = root.parents[4]
bundle = repo / "frontend/desktop/dist-readflow/linux-unpacked/resources/backend"
subprocess.run(
    [
        os.environ.get("READFLOW_TYPST_BIN", str(bundle / "typst/bin/typst")),
        "compile",
        "--root",
        str(root.parent),
        "--font-path",
        str(bundle / "fonts"),
        str(root / "paper.typ"),
        str(root / "paper.pdf"),
    ],
    check=True,
)

# A second tiny fixture cross-checks PyMuPDF output against pdf.js viewport coordinates.
sys.path.insert(0, str(repo))
from backend.library_mvp.paper_blocks_extract import geometry, anchor

coordinates = []
with pymupdf.open() as doc:
    for rotation in (0, 90, 180, 270):
        page = doc.new_page(width=600, height=800)
        page.set_mediabox(pymupdf.Rect(10, 20, 610, 820))
        page.set_cropbox(pymupdf.Rect(50, 70, 550, 730))
        page.insert_text((30, 80), "Crop offset and rotation fixture")
        page.set_rotation(rotation)
        meta = geometry(page)
        coordinates.append(anchor([30, 40, 120, 80], meta))
        page.set_rotation(rotation)
    doc.save(root / "coordinates.pdf")
(root / "coordinates.json").write_text(json.dumps(coordinates, indent=2))

# Reproducible offline UI fixtures, using only an in-process prefix function as the translator.
from backend.library_mvp.paper_blocks_extract import extract
from backend.library_mvp.paper_blocks_model import cache_key, SKIP
from backend.library_mvp.paper_blocks_render import render

with tempfile.TemporaryDirectory(prefix="readflow-block-fixture-") as temporary:
    directory = Path(temporary)
    manifest = extract(root / "paper.pdf", directory, hashlib.sha256((root / "paper.pdf").read_bytes()).hexdigest())
    (root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    cache = {
        cache_key(b, "zh-CN", "synthetic"): "【译】" + b["text"]
        for b in manifest["blocks"]
        if b["type"] not in SKIP and b["text"]
    }
    render(directory, manifest, cache, "zh-CN", "synthetic")
    shutil.copyfile(directory / "translated.pdf", root / "translated.pdf")
