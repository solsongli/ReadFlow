"""Offline X13 corpus renderer. Inputs stay read-only; all outputs live under --output."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import time
import pymupdf as fitz
from PIL import Image
from backend.library_mvp.paper_blocks_aligned import render_aligned
from ops.development.layout_aligned_quality import inspect_layout

PAGES = {
    "SAM": (2, 4),
    "OpenVLA": (3,),
    "DiffusionPolicy": (2,),
    "ACT": (2, 3),
}


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def regular(path):
    return (
        path.is_file() and not path.is_symlink() and all(not parent.is_symlink() for parent in path.parents)
    )


def compare_png(source, translated, page_number, output, clip=None, zoom=1.45):
    images = []
    for path in (source, translated):
        with fitz.open(path) as pdf:
            pixmap = pdf[page_number - 1].get_pixmap(
                matrix=fitz.Matrix(zoom, zoom), clip=fitz.Rect(clip) if clip else None, alpha=False
            )
            images.append(Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples))
    height = max(image.height for image in images)
    canvas = Image.new("RGB", (sum(image.width for image in images), height), "white")
    x = 0
    for image in images:
        canvas.paste(image, (x, 0))
        x += image.width
    canvas.save(output)


def integrity(source, translated, baseline, audit, baseline_audit):
    result = {
        "pages": 0,
        "geometry": True,
        "images_match_accepted_layout": True,
        "graphics_match_accepted_layout": True,
        "links": True,
    }
    with fitz.open(source) as left, fitz.open(translated) as right, fitz.open(baseline) as accepted:
        result["pages"] = len(right)
        if len(left) != len(right):
            result["geometry"] = False
        for index, (source_page, target_page, accepted_page) in enumerate(zip(left, right, accepted)):
            result["geometry"] &= source_page.mediabox == target_page.mediabox
            result["geometry"] &= source_page.cropbox == target_page.cropbox
            result["geometry"] &= source_page.rotation == target_page.rotation
            result["images_match_accepted_layout"] &= len(accepted_page.get_image_info()) == len(
                target_page.get_image_info()
            )
            removed = len(audit["pages"][index].get("decorations", []))
            prior_removed = len(baseline_audit["pages"][index].get("decorations", []))
            result["graphics_match_accepted_layout"] &= (
                len(accepted_page.get_drawings()) - len(target_page.get_drawings()) == removed - prior_removed
            )
            result["links"] &= len(source_page.get_links()) == len(target_page.get_links())
    result["residual_source_chars"] = audit["residual_source_chars"]
    if not all(
        result[key]
        for key in ("geometry", "images_match_accepted_layout", "graphics_match_accepted_layout", "links")
    ):
        raise AssertionError(result)
    if audit["residual_source_chars"]:
        raise AssertionError("translated text regions retain source glyphs")
    return result


def render_one(source_root, output_root, name, reuse=False, baseline_root=None):
    source = source_root / name
    required = [
        source / filename for filename in ("source.pdf", "blocks.json", "translations.json", "selection.json")
    ]
    if not all(regular(path) for path in required):
        return {"paper": name, "skipped": "offline corpus files are unavailable"}
    hashes = {path.name: digest(path) for path in required}
    target = output_root / name
    cached = reuse and all(
        (target / filename).is_file()
        for filename in (
            "source.pdf",
            "blocks.json",
            "translations.json",
            "selection.json",
            "translated-aligned.pdf",
            "layout-aligned-audit.json",
        )
    )
    if target.exists() and not cached:
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)
    if not cached:
        for path in required:
            shutil.copy2(path, target / path.name)
    document = json.loads((target / "blocks.json").read_text())
    cache = json.loads((target / "translations.json").read_text())
    selection = json.loads((target / "selection.json").read_text())
    started = time.perf_counter()
    result = (
        render_aligned(
            target / "source.pdf",
            target,
            document,
            cache,
            selection["language"],
            selection["fingerprint"],
        )
        if not cached
        else json.loads((target / "layout-aligned-audit.json").read_text())
    )
    elapsed = time.perf_counter() - started if not cached else result["seconds"]
    audit = json.loads((target / "layout-aligned-audit.json").read_text())
    baseline_audit = json.loads((source / "layout-audit.json").read_text())
    checks = integrity(
        target / "source.pdf",
        target / "translated-aligned.pdf",
        source / "translated-layout.pdf",
        audit,
        baseline_audit,
    )
    reused = render_aligned(
        target / "source.pdf",
        target,
        document,
        cache,
        selection["language"],
        selection["fingerprint"],
    )
    if reused["rendered_pages"] or len(reused["reused_pages"]) != checks["pages"]:
        raise AssertionError("aligned incremental page cache was not reused")
    for page in PAGES[name]:
        compare_png(
            target / "source.pdf",
            target / "translated-aligned.pdf",
            page,
            output_root / f"{name}-p{page}-source-aligned.png",
        )
    if name == "SAM":
        compare_png(
            target / "source.pdf",
            target / "translated-aligned.pdf",
            4,
            output_root / "SAM-p4-run-in-closeup.png",
            clip=(35, 65, 420, 775),
            zoom=2.1,
        )
    if name == "DiffusionPolicy":
        compare_png(
            target / "source.pdf",
            target / "translated-aligned.pdf",
            2,
            output_root / "DiffusionPolicy-p2-math-closeup.png",
            clip=(290, 570, 555, 745),
            zoom=2.1,
        )
    for path in required:
        if digest(path) != hashes[path.name]:
            raise AssertionError(f"read-only corpus changed: {path}")
    return {
        "paper": name,
        "pages": checks["pages"],
        "seconds": round(elapsed, 3),
        **result["metrics"],
        "aligned_blocks": result["aligned_blocks"],
        "line_count_match": result["aligned_line_count_match"],
        "quality": inspect_layout(target),
        "before_quality": inspect_layout(baseline_root / name)
        if baseline_root and (baseline_root / name / "translated-aligned.pdf").is_file()
        else None,
        "render_fallback": len(result["render_fallback"]),
        "label_fallback": len(result["label_fallback"]),
        "links_reanchored": result["links_reanchored"],
        "link_borders_hidden": result["link_borders_hidden"],
        "links_unaffected": result["links_unaffected"],
        "integrity": checks,
        "incremental_reused_pages": len(reused["reused_pages"]),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--reuse-output", action="store_true")
    args = parser.parse_args()
    corpus = args.corpus or (
        Path(value) if (value := __import__("os").environ.get("READFLOW_X13_CORPUS_DIR")) else None
    )
    args.output.mkdir(parents=True, exist_ok=True)
    if corpus is None or not corpus.is_dir():
        print("SKIP aligned corpus: READFLOW_X13_CORPUS_DIR is not set or unavailable")
        return
    baseline = args.baseline.resolve() if args.baseline and args.baseline.is_dir() else None
    rows = [
        render_one(corpus.resolve(), args.output.resolve(), name, args.reuse_output, baseline)
        for name in PAGES
    ]
    (args.output / "metrics.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    keys = ("scattered_lines", "tiny_blocks", "missing_glyphs", "forbidden_starts", "lead_gaps")
    summary = {
        "before": {
            key: sum((row["before_quality"] or {}).get(key, 0) for row in rows) for key in keys
        },
        "after": {key: sum(row["quality"][key] for row in rows) for key in keys},
        "baseline_p95_max": max(row["baseline_p95"] for row in rows),
        "line_count_rate": sum(row["line_count_match"] for row in rows)
        / max(1, sum(row["aligned_blocks"] for row in rows)),
        "spacing_em_p95_max": max(row["spacing_em_p95"] for row in rows),
        "remaining": [
            {"paper": row["paper"], **item}
            for row in rows
            for item in row["quality"]["remaining"]
        ],
    }
    (args.output / "quality-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2)
    )
    if any(summary["after"][key] for key in ("scattered_lines", "missing_glyphs", "forbidden_starts", "lead_gaps")):
        raise AssertionError(summary)
    if summary["baseline_p95_max"] >= 1 or summary["line_count_rate"] < 0.98:
        raise AssertionError(summary)
    if summary["spacing_em_p95_max"] > 0.1201:
        raise AssertionError(summary)
    print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
