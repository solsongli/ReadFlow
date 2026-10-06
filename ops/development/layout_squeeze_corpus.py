"""Serial cached-block corpus audit: 0.9.17 baselines plus new rendering and per-warning explanations.

Inputs are prepared read-only PDF/JSON copies listed by --inputs. Corpus uses
explicitly fake translations; real copies use supplied cached text. This tool
never extracts models, sends requests, or modifies the original inputs.
"""
import argparse
import copy
import json
from pathlib import Path
import shutil
from collections import Counter
from backend.library_mvp.paper_blocks_layout import render_layout
from backend.library_mvp.layout_squeeze import suspected_squeeze
from backend.library_mvp.layout_metrics import typography_metrics
from .layout_corpus import audit
from .layout_typography_corpus import sheets
from .layout_squeeze_explain import explain


def comparable(document, before, after):
    keys = lambda value: {
        (p["page"], r["id"], tuple(r["bbox"]))
        for p in value["pages"]
        for r in p["records"]
        if r["status"] == "placed"
    }
    common = keys(before) & keys(after)
    metrics = []
    for value in (before, after):
        same = copy.deepcopy(value)
        for page in same["pages"]:
            page["records"] = [
                r for r in page["records"] if (page["page"], r["id"], tuple(r["bbox"])) in common
            ]
        metrics.append(typography_metrics(document, same))
    return {"before": metrics[0], "after": metrics[1], "new_regions": len(keys(after) - keys(before))}


def evaluate(entry):
    folder = Path(entry["path"])
    document = json.loads(
        (folder / ("fake-blocks.json" if entry["kind"] == "corpus" else "blocks.json")).read_text()
    )
    cache = json.loads((folder / "translations.json").read_text())
    selection = (
        {"language": "zh-CN", "fingerprint": "squeeze-fake"}
        if entry["kind"] == "corpus"
        else json.loads((folder / "selection.json").read_text())
    )
    before = json.loads((folder / "before/layout-audit.json").read_text())
    dest = folder / "after"
    dest.mkdir(exist_ok=True)
    for fonts in (folder / "before").glob("layout-fonts-*"):
        shutil.copytree(fonts, dest / fonts.name, dirs_exist_ok=True)
    result = render_layout(
        folder / "source.pdf", dest, document, cache, selection["language"], selection["fingerprint"]
    )
    after = json.loads((dest / "layout-audit.json").read_text())
    old, new = suspected_squeeze(before["pages"]), suspected_squeeze(after["pages"])
    metrics = audit(folder / "source.pdf", dest / "translated-layout.pdf", after)
    details = explain(dest, document, cache, selection, after, new) if new else []
    outcome = {
        **entry,
        "counts": [len(old), len(new)],
        "before": old,
        "after": new,
        "remaining": details,
        "integrity": metrics,
        "typography_before": typography_metrics(document, before),
        "typography_after": typography_metrics(document, after),
        "comparable": comparable(document, before, after),
        "links_before": {
            k: before.get(k)
            for k in ("links_reanchored", "link_borders_hidden", "links_unaffected", "decorations_removed")
        },
        "links_after": {
            k: result.get(k)
            for k in ("links_reanchored", "link_borders_hidden", "links_unaffected", "decorations_removed")
        },
    }
    (folder / "comparison.json").write_text(json.dumps(outcome, ensure_ascii=False, indent=2))
    if entry["name"] == "ACT" and entry["kind"] == "real":
        sheets(folder, "ACT", (1, 16, 18), labels=("原文", "0.9.17 原版式", "0.9.18 原版式"))
    return outcome


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", type=Path, default=Path("/tmp/readflow-x10c/inputs.json"))
    options = parser.parse_args()
    results = []
    root = options.inputs.parent
    for entry in json.loads(options.inputs.read_text()):
        outcome = evaluate(entry)
        results.append(outcome)
        print(
            json.dumps(
                {
                    "paper": entry["name"],
                    "kind": entry["kind"],
                    "counts": outcome["counts"],
                    "remaining_reasons": dict(Counter(r["reason"] for r in outcome["remaining"])),
                }
            ),
            flush=True,
        )
    (root / "squeeze-summary.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
    lines = [
        "# 疑似挤压完整报告",
        "",
        "正常绕图多区域按合并纵向覆盖率判断，避免把一小片当作整块容量。",
        "",
        "| 文档 | 数据 | 0.9.17 | 0.9.18 |",
        "|---|---|---:|---:|",
    ]
    for result in results:
        lines.append(
            f'| {result["name"]} | {result["kind"]} | {result["counts"][0]} | {result["counts"][1]} |'
        )
    lines += ["", "## 逐条残留说明", ""]
    for result in results:
        for warning in result["remaining"]:
            lines.append(
                f'- {result["name"]}（{result["kind"]}）第 {warning["page"]} 页 · {warning["id"]} · '
                f'{warning["type"]}：{warning["reason"]}；区域 {warning["bbox"]}。'
            )
    (root / "疑似挤压完整报告.md").write_text("\n".join(lines) + "\n")
    if any(
        v
        for result in results
        for key, v in result["integrity"].items()
        if key.endswith("mismatches") or key in {"glyph_overflow", "residual_source_chars", "page_mismatch"}
    ):
        raise SystemExit("Integrity audit failed; inspect squeeze-summary.json")


if __name__ == "__main__":
    main()
