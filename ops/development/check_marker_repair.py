"""Read only explicit JSON/PDF inputs; repair a disposable copy, never call any model."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import time
import pymupdf as fitz
from backend.library_mvp.paper_cache_repair import normalize_cache
from backend.library_mvp.paper_markers import has_markers
from backend.library_mvp.paper_blocks_storage import write_json
from backend.library_mvp.paper_blocks_layout import render_layout, tasks_for
from backend.library_mvp.paper_blocks_render import render
from backend.library_mvp import layout_incremental


def regular(path):
    if not path.is_file() or any(p.is_symlink() for p in [path, *path.parents]):
        raise ValueError("Expected regular JSON/PDF without symlinks")
    if path.suffix not in (".json", ".pdf"):
        raise ValueError("Only JSON and PDF inputs are allowed")
    return path


def digest(path):
    return hashlib.sha256(regular(path).read_bytes()).hexdigest()


def pdf_counts(path):
    with fitz.open(regular(path)) as pdf:
        return {
            "pages": len(pdf),
            "body_markers": sum(len(re.findall("BOLD", p.get_text())) for p in pdf),
            "outline_markers": sum(bool(re.search("BOLD", row[1])) for row in pdf.get_toc()),
            "internal_marker_pages": sum(has_markers(p.get_text()) for p in pdf),
        }


def run(source, cache_dir, output):
    if output.exists() and any(output.iterdir()):
        raise ValueError("Use a new empty output directory")
    output.mkdir(parents=True, exist_ok=True)
    document = json.loads(regular(cache_dir / "blocks.json").read_text())
    if digest(source) != document["sha256"]:
        raise ValueError("The public source PDF must match the cached attachment hash")
    inputs = [
        p
        for p in cache_dir.iterdir()
        if p.suffix == ".pdf"
        or p.name
        in {"blocks.json", "translations.json", "result.json", "layout-pages.json", "layout-audit.json"}
    ]
    originals = {str(p): digest(p) for p in inputs}
    for path in inputs:
        shutil.copy2(regular(path), output / path.name)
    cache = json.loads((output / "translations.json").read_text())
    prior = json.loads((output / "result.json").read_text())
    language, fingerprint = prior["language"], prior["fingerprint"]
    before = {name: pdf_counts(output / name) for name in ("translated-layout.pdf", "translated.pdf")}
    before["cache_entries"] = sum(has_markers(value) for value in cache.values())
    # This is the same hash-verified original at a different local path. Rebase only
    # the disposable copy's page-signature identities to test incremental rendering.
    tasks, regions = tasks_for(document, cache, language, fingerprint, prior.get("image_text", True))
    with fitz.open(source) as pdf:
        signatures = layout_incremental.signatures(
            source, len(pdf), tasks, regions, prior.get("layout_density", "balanced")
        )
    pages = json.loads((output / "layout-pages.json").read_text())
    copied = output / "translated-layout.pdf"
    write_json(
        output / "layout-pages.json",
        {
            **pages,
            "signatures": signatures,
            "file_size": copied.stat().st_size,
            "mtime_ns": copied.stat().st_mtime_ns,
        },
    )
    patch, counts = normalize_cache(document, cache)
    cache.update(patch)
    write_json(output / "translations.json", cache)
    start = time.perf_counter()
    layout = render_layout(
        source,
        output,
        document,
        cache,
        language,
        fingerprint,
        image_text=prior.get("image_text", True),
        density=prior.get("layout_density", "balanced"),
        refresh_outline=True,
    )
    layout_seconds = time.perf_counter() - start
    start = time.perf_counter()
    reflow = render(output, document, cache, language, fingerprint, image_text=prior.get("image_text", True))
    reflow_seconds = time.perf_counter() - start
    after = {name: pdf_counts(output / name) for name in ("translated-layout.pdf", "translated.pdf")}
    after["cache_entries"] = sum(has_markers(value) for value in cache.values())
    assert after["cache_entries"] == 0
    for name in ("translated-layout.pdf", "translated.pdf"):
        assert (
            after[name]["body_markers"]
            == after[name]["outline_markers"]
            == after[name]["internal_marker_pages"]
            == 0
        ), after[name]
    assert all(digest(Path(path)) == sha for path, sha in originals.items()), "Read-only inputs changed"
    report = {
        "before": before,
        "after": after,
        "repair": counts,
        "layout_seconds": round(layout_seconds, 3),
        "reflow_seconds": round(reflow_seconds, 3),
        "rendered_pages": layout["rendered_pages"],
        "reused_pages": layout["reused_pages"],
        "reflow_fallback": reflow,
        "originals_unchanged": True,
    }
    write_json(output / "verification.json", report)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    run(args.source, args.cache_dir, args.output)
