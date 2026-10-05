"""Serial, offline corpus audit. Inputs are read-only; all generated files stay under --output.

PYTHONPATH=. nice -n 10 <bundled-python> -m ops.development.paper_blocks_corpus
  --corpus-dir <public PDFs> --fixtures tests/fixtures/pdfs --safevla <PDF> --output /tmp/readflow-x4/before
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from .corpus_metrics import measure, summary
from .corpus_visuals import contact_sheets


def regular(path):
    path = path.absolute()
    if not path.is_file() or any(p.is_symlink() for p in [path, *path.parents]):
        raise ValueError(f"Expected a regular PDF without symlink ancestors: {path}")
    return path


def inputs(options):
    paths = []
    for folder in [options.corpus_dir, options.fixtures]:
        if folder:
            paths.extend(sorted(folder.glob("*.pdf")))
    if options.safevla:
        paths.append(options.safevla)
    if not paths:
        raise ValueError("No PDF input; supply --corpus-dir or READFLOW_CORPUS_DIR")
    return list(dict.fromkeys(regular(p) for p in paths))


def evaluate(path, directory, models, options):
    import pymupdf as fitz
    from backend.library_mvp.paper_blocks_extract import extract
    from backend.library_mvp.paper_blocks_storage import write_json
    from backend.library_mvp.paper_blocks_translate import translate_blocks
    from backend.library_mvp.paper_blocks_labels import translation_units
    from backend.library_mvp.paper_blocks_render import render
    from ops.development.readflow_fake_openai import completion_response

    directory.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    source = path
    with fitz.open(path) as pdf:
        original_pages = len(pdf)
        if len(pdf) > options.limit_over:
            source = directory / "source-subset.pdf"
            subset = fitz.open()
            subset.insert_pdf(pdf, to_page=options.limit_pages - 1)
            subset.set_toc([row for row in pdf.get_toc() if 1 <= row[2] <= options.limit_pages])
            subset.save(source, garbage=4, deflate=True)
            subset.close()
    warm_cache = any(directory.glob("layout-*.json"))
    start = time.perf_counter()
    document = extract(source, directory, digest, models=models)
    elapsed = time.perf_counter() - start
    write_json(directory / "blocks.json", document)
    with fitz.open(source) as pdf:
        metrics = measure(pdf, document)
    metrics.update(
        name=path.stem,
        sha256=digest,
        source=str(path),
        pages=len(document["pages"]),
        original_pages=original_pages,
        extractor=document["extractor_version"],
        warm_analysis_cache=warm_cache,
        extraction_seconds=round(elapsed, 3),
        seconds_per_page=round(elapsed / len(document["pages"]), 4),
        warnings=document["warnings"],
        capabilities=document["capabilities"],
    )
    if not options.no_render:
        cache = {}

        def fake(messages):
            return completion_response({"messages": messages})[1]["choices"][0]["message"]["content"]

        failures = translate_blocks(
            translation_units(document["blocks"]),
            cache,
            "zh-CN",
            "corpus-fake",
            fake,
            [],
            lambda: None,
            lambda *_: None,
            lambda _: None,
            concurrency=1,
        )
        write_json(directory / "translations.json", cache)
        start = time.perf_counter()
        try:
            result = render(directory, document, cache, "zh-CN", "corpus-fake")
            metrics.update(
                render_fallback=len(result["render_fallback"]),
                label_fallback=len(result["label_fallback"]),
                translation_fallback=len(failures),
                render_seconds=round(time.perf_counter() - start, 3),
            )
            write_json(directory / "result.json", {**result, "translation_fallback": failures})
            contact_sheets(source, directory / "translated.pdf", directory)
        except Exception as error:
            metrics.update(render_error=str(error), render_fallback=None, translation_fallback=len(failures))
    write_json(directory / "metrics.json", metrics)
    if not options.no_render and not options.keep_assets:
        # Final PDFs and sheets are self-contained; source crops can otherwise grow
        # to gigabytes across a corpus because each may embed a full source image.
        for block in document["blocks"]:
            for key in ("asset", "thumbnail"):
                if block.get(key):
                    (directory / block[key]).unlink(missing_ok=True)
    return metrics


def report(directory, records):
    (directory / "summary.json").write_text(
        json.dumps(
            {"papers": records, "triage": summary([r for r in records if not r.get("extraction_error")])},
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    text = [
        "# PDF corpus audit",
        "",
        "Characters exclude whitespace. Flags require visual review.",
        "",
        "| Paper | Pages | Translate % | Native covered % | Short / single-line | Orphan captions | Uncaptioned | Outline % | Post-ref skipped chars | s/page |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for r in records:
        if r.get("extraction_error"):
            text.append(f'| {r["name"]} | extraction failed | — | — | — | — | — | — | — | — |')
            continue
        outline = "—" if r["outline_ratio"] is None else f'{100 * r["outline_ratio"]:.1f}'
        text.append(
            f'| {r["name"]} | {r["pages"]} | {100 * r["translatable_ratio"]:.1f} | '
            f'{100 * r["native_coverage_ratio"]:.1f} | {r["short_fragments"]} / {r["single_line_fragments"]} | '
            f'{r["orphan_captions"]} | {r["uncaptioned_figures"]} | {outline} | '
            f'{r["post_reference_untranslated_characters"]} | {r["seconds_per_page"]} |'
        )
    (directory / "summary.md").write_text("\n".join(text) + "\n")
    links = ["# Corpus review", "", "The PDFs use a local echo translator, not a real model.", ""]
    for r in records:
        label = r["name"]
        links.append(f"## {label}\n")
        links.append(f"[Metrics]({label}/metrics.json) · [Blocks]({label}/blocks.json)")
        if not r.get("extraction_error") and not r.get("render_error"):
            links.append(f"[Fake translated PDF]({label}/translated.pdf)")
            links.extend(
                f"[{p.stem}]({label}/{p.name})" for p in sorted((directory / label).glob("comparison-*.png"))
            )
        links.append("")
    (directory / "index.md").write_text("\n".join(links) + "\n")


def run_one(path, destination, label, options):
    """One native-library process at a time; neither stale metrics nor a crash count as success."""
    destination.mkdir(parents=True, exist_ok=True)
    metrics_path = destination / "metrics.json"
    metrics_path.unlink(missing_ok=True)
    command = [
        sys.executable,
        "-m",
        "ops.development.paper_blocks_corpus",
        "--worker-pdf",
        str(path),
        "--output",
        str(destination),
        "--limit-over",
        str(options.limit_over),
        "--limit-pages",
        str(options.limit_pages),
    ]
    for flag in ("no_render", "keep_assets"):
        if getattr(options, flag):
            command.append("--" + flag.replace("_", "-"))
    with (destination / "worker.log").open("w") as log:
        try:
            completed = subprocess.run(command, stdout=log, stderr=log, timeout=600, check=False)
            if completed.returncode or not metrics_path.is_file():
                raise RuntimeError(f"PDF worker exited {completed.returncode}; see worker.log")
            metrics = json.loads(metrics_path.read_text())
        except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
            metrics = {"source": str(path), "extraction_error": str(error)}
    metrics["name"] = label
    metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n")
    return metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    from .paper_quality_report import arguments, run
    arguments(parser)
    parser.add_argument("--corpus-dir", type=Path, default=os.environ.get("READFLOW_CORPUS_DIR"))
    parser.add_argument("--fixtures", type=Path)
    parser.add_argument("--safevla", type=Path, default=os.environ.get("READFLOW_SAFE_VLA_PDF"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit-over", type=int, default=100)
    parser.add_argument("--limit-pages", type=int, default=40)
    parser.add_argument("--no-render", action="store_true", help="Extraction diagnostics only, for fast iteration")
    parser.add_argument("--keep-assets", action="store_true", help="Retain intermediate vector crops/thumbnails")
    parser.add_argument("--worker-pdf", type=Path, help=argparse.SUPPRESS)
    options = parser.parse_args()
    if options.quality_blocks:
        return run(options)
    if not 1 <= options.limit_pages <= options.limit_over:
        parser.error("Expected 1 <= limit-pages <= limit-over")
    os.environ.update(
        OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="2", RAYON_NUM_THREADS="2", ORT_DISABLE_TELEMETRY="1"
    )
    options.output.mkdir(parents=True, exist_ok=True)
    if options.worker_pdf:
        from backend.library_mvp.document_models import DocumentModels

        evaluate(regular(options.worker_pdf), options.output, DocumentModels(), options)
        return
    records = []
    for path in inputs(options):
        label = "SafeVLA" if options.safevla and path == options.safevla.absolute() else path.stem
        destination = options.output / label
        metrics = run_one(path, destination, label, options)
        records.append(metrics)
        report(options.output, records)
        print(
            json.dumps(
                {
                    "paper": path.stem,
                    "pages": metrics.get("pages"),
                    "seconds": metrics.get("extraction_seconds"),
                    "types": metrics.get("types"),
                    "error": metrics.get("extraction_error") or metrics.get("render_error"),
                }
            ),
            flush=True,
        )

    if any(r.get("extraction_error") or r.get("render_error") for r in records):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
