"""Opt-in serial X2 evaluation; owned fake translations only, no HTTP or model service."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import time
import pymupdf as fitz
from backend.library_mvp.document_models import DocumentModels
from backend.library_mvp.document_layout import page_layout, fraction
from backend.library_mvp.paper_blocks_extract import extract
from backend.library_mvp.paper_blocks_labels import translation_units
from backend.library_mvp.paper_blocks_model import cache_key, SKIP, protect
from backend.library_mvp.paper_blocks_inline import restore_rich
from backend.library_mvp.paper_blocks_render import render
from backend.library_mvp.paper_blocks_storage import write_json

ROOT = Path(__file__).resolve().parents[3]
GOLD = {
    # Same independently located regions used by X1's real-paper structural regressions.
    "babeldoc-10p": {
        "figures": [(3, "figure", [78, 75, 283, 328])],
        "title": (1, [76.6, 75.2, 518.7, 105.5]),
        "body": [(2, (330, 607)), (3, (110, 438))],
    },
    "yakubenko-halogen-lithium-10p": {
        "figures": [(4, "table", [50, 406, 545, 579])],
        "title": (1, [46.8, 84.9, 540.6, 143.2]),
        "body": [(2, (100, 609)), (2, (400, 550))],
    },
    "s41524-tibetan-plateau-21p": {
        "figures": [(6, "table", [101, 345, 501, 524])],
        "title": (1, [45.4, 154.9, 460.5, 218.7]),
        "body": [(1, (350, 392))],
    },
    "paper": {
        "figures": [
            (1, "figure", [305, 210, 539, 260]),
            (1, "figure", [335, 286, 509, 416]),
            (1, "table", [365, 442, 479, 495]),
        ],
        "title": (1, [119.1, 53.8, 476.2, 72.8]),
        "body": [(1, (120, 240))],
    },
}


def quality(doc, truth):
    blocks = doc["blocks"]
    cover = [
        max([fraction(box, b["bbox"]) for b in blocks if b["page"] == page and b["type"] == kind] or [0])
        for page, kind, box in truth["figures"]
    ]
    title_page, title_box = truth["title"]
    titles = [b for b in blocks if b["type"] == "title"]
    title_errors = sum(b["page"] != title_page or fraction(b["bbox"], title_box) < 0.8 for b in titles)
    title_errors += not any(b["page"] == title_page and fraction(title_box, b["bbox"]) > 0.9 for b in titles)
    body_errors = sum(
        not any(
            b["type"] == "text"
            and any(a["page"] == page and fitz.Rect(a["bbox"]).contains(fitz.Point(*point)) for a in b["anchors"])
            for b in blocks
        )
        for page, point in truth["body"]
    )
    return {
        "figure_coverage_percent": round(100 * sum(cover) / len(cover), 2),
        "figure_probes": len(cover),
        "body_errors": body_errors,
        "body_probes": len(truth["body"]),
        "title_errors": title_errors,
        "title_probes": 1,
    }


def words(text):
    return Counter(re.findall(r"[a-z]{3,}", text.lower()))


def evaluate(output):
    output.mkdir(parents=True, exist_ok=True)
    models = DocumentModels()
    reports = []
    fixtures = ROOT / "frontend/web/tests/fixtures/blocks"
    for name in GOLD:
        path = fixtures / "paper.pdf" if name == "paper" else ROOT / "tests/fixtures/pdfs" / (name + ".pdf")
        if any(p.is_symlink() for p in [path, *path.parents]):
            raise ValueError("Evaluation input must not be a symlink")
        sha = hashlib.sha256(path.read_bytes()).hexdigest()
        before, after, profile = (output / name / part for part in ("heuristic", "hybrid", "profile"))
        for directory in (before, after, profile):
            directory.mkdir(parents=True, exist_ok=True)
        old = extract(path, before, sha, enrich=False)
        started = time.perf_counter()
        doc = extract(path, after, sha, models=models)
        duration = time.perf_counter() - started
        layout_times = []
        with fitz.open(path) as pdf:
            for page in pdf:
                page.set_rotation(0)
                started = time.perf_counter()
                page_layout(page, models, profile)
                layout_times.append(time.perf_counter() - started)
        write_json(after / "blocks.json", doc)
        cache = {}
        for block in translation_units(doc["blocks"]):
            if block["type"] in SKIP or not block["text"]:
                continue
            masked, mapping = protect(block)
            cache[cache_key(block, "zh-CN", "fake")] = restore_rich("【译】" + masked, mapping)
        warnings = render(after, doc, cache, "zh-CN", "fake")
        reports.append(
            {
                "file": path.name,
                "pages": len(doc["pages"]),
                "before": quality(old, GOLD[name]),
                "after": quality(doc, GOLD[name]),
                "extract_seconds": round(duration, 3),
                "layout_mean_ms": round(sum(layout_times) * 1000 / len(layout_times), 2),
                "layout_max_ms": round(max(layout_times) * 1000, 2),
                "types": dict(Counter(b["type"] for b in doc["blocks"])),
                "model_sourced_blocks": sum(b["source"] == "layout" for b in doc["blocks"]),
                "ocr_labels": sum(
                    r.get("source") == "ocr" for b in doc["blocks"] for r in b.get("figure_text", [])
                ),
                "render_fallback_blocks": len(warnings["render_fallback"]),
                "label_fallback_blocks": len(warnings["label_fallback"]),
                "warnings": doc["warnings"],
            }
        )
    scan = output / "scan"
    scan.mkdir(exist_ok=True)
    started = time.perf_counter()
    scanned = extract(fixtures / "paper-scan.pdf", scan, "owned-scan", models=models)
    elapsed = time.perf_counter() - started
    expected, actual = Counter(), Counter()
    with fitz.open(fixtures / "paper.pdf") as pdf:
        for page in pdf:
            expected.update(words(page.get_text()))
    for file in scan.glob("ocr-page-*.json"):
        for row in json.loads(file.read_text())["value"]:
            actual.update(words(row["text"]))
    result = {
        "samples": reports,
        "scan": {
            "pages": len(scanned["pages"]),
            "seconds": round(elapsed, 3),
            "seconds_per_page": round(elapsed / len(scanned["pages"]), 3),
            "english_word_recall": round(sum((actual & expected).values()) / sum(expected.values()), 4),
            "expected_words": sum(expected.values()),
            "ocr_blocks": sum(b["source"] == "ocr" for b in scanned["blocks"]),
        },
    }
    write_json(output / "metrics.json", result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    evaluate(parser.parse_args().output)
