"""Opt-in serial CPU benchmark; synthetic prefix results, never calls a model or network.

Run as a module after other tests and browsers have stopped. Not part of unittest discovery.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import tempfile
import time

import pymupdf
from backend.library_mvp.paper_blocks_extract import extract
from backend.library_mvp.paper_blocks_model import cache_key, SKIP
from backend.library_mvp.paper_blocks_render import render
from backend.library_mvp.paper_blocks_storage import write_json


def run(output):
    repo = Path(__file__).resolve().parents[3]
    fixtures = repo / "frontend/web/tests/fixtures/blocks"
    names = ("babeldoc-10p.pdf", "yakubenko-halogen-lithium-10p.pdf", "s41524-tibetan-plateau-21p.pdf")
    with tempfile.TemporaryDirectory(prefix="readflow-block-benchmark-") as temporary:
        root = Path(temporary)
        synthetic = root / "synthetic-20p.pdf"
        with pymupdf.open(fixtures / "paper.pdf") as source, pymupdf.open() as document:
            for index in range(20):
                # Repeat content pages; references must appear only at the end of this one paper.
                page = index % (len(source) - 1) if index < 19 else len(source) - 1
                document.insert_pdf(source, from_page=page, to_page=page)
            document.save(synthetic)
        reports = []
        with ThreadPoolExecutor(max_workers=1) as worker:
            for path in [synthetic, *(repo / "tests/fixtures/pdfs" / name for name in names)]:
                if not path.is_file() or any(parent.is_symlink() for parent in [path, *path.parents]):
                    raise ValueError("Benchmark inputs must be ordinary files without symlink ancestors")
                directory = root / path.stem
                directory.mkdir()
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                started = time.perf_counter()
                document = worker.submit(extract, path, directory, digest).result()
                write_json(directory / "blocks.json", document)
                elapsed = time.perf_counter() - started
                report = {
                    "file": path.name,
                    "pages": len(document["pages"]),
                    "blocks": len(document["blocks"]),
                    "types": dict(Counter(b["type"] for b in document["blocks"])),
                    "extract_seconds": round(elapsed, 3),
                    "vector_crops": sum(bool(b.get("asset")) for b in document["blocks"]),
                }
                if path == synthetic:
                    cache = {
                        cache_key(b, "zh-CN", "fake"): "【译】" + b["text"]
                        for b in document["blocks"]
                        if b["type"] not in SKIP and b["text"]
                    }
                    started = time.perf_counter()
                    render(directory, document, cache, "zh-CN", "fake")
                    report["render_seconds"] = round(time.perf_counter() - started, 3)
                    with pymupdf.open(directory / "translated.pdf") as translated:
                        report["translated_pages"] = len(translated)
                reports.append(report)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(reports, indent=2, ensure_ascii=False) + "\n")
        print(json.dumps(reports, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    run(parser.parse_args().output)
