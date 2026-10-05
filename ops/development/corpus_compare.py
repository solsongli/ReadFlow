"""Compare the same evaluable papers; extraction failures are reported separately."""
import argparse
import json
from pathlib import Path


def compare(before, after):
    old = {r["name"]: r for r in before["papers"]}
    new = {r["name"]: r for r in after["papers"]}
    common = [
        name
        for name in old.keys() & new.keys()
        if not old[name].get("extraction_error") and not new[name].get("extraction_error")
    ]
    fields = [
        "reference_leak_characters",
        "cropped_prose_characters",
        "author_prose_characters",
        "program_leak_characters",
        "short_fragments",
        "single_line_fragments",
        "orphan_captions",
        "uncaptioned_figures",
        "outline_matched",
        "outline_items",
        "post_reference_untranslated_characters",
        "reading_order_jumps",
        "render_fallback",
        "label_fallback",
        "translation_fallback",
    ]
    rows = []
    for field in fields:
        eligible = [
            name
            for name in common
            if not field.startswith("outline_") or old[name]["outline_items"] == new[name]["outline_items"]
        ]
        rows.append(
            {
                "metric": field,
                "before": sum(old[n].get(field, 0) or 0 for n in eligible),
                "after": sum(new[n].get(field, 0) or 0 for n in eligible),
                "before_papers": sum(bool(old[n].get(field)) for n in eligible),
                "after_papers": sum(bool(new[n].get(field)) for n in eligible),
            }
        )
    return {
        "comparable_papers": sorted(common),
        "before_failures": [n for n in old if old[n].get("extraction_error")],
        "after_failures": [n for n in new if new[n].get("extraction_error")],
        "metrics": rows,
        "after_papers": len(new),
        "after_pages": sum(r.get("pages", 0) for r in new.values()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = compare(
        json.loads((args.before / "summary.json").read_text()),
        json.loads((args.after / "summary.json").read_text()),
    )
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    text = [
        "# Corpus comparison",
        "",
        f'Comparable papers: {len(result["comparable_papers"])}',
        "",
        "| Metric | Before | After | Before papers | After papers |",
        "|---|---:|---:|---:|---:|",
    ]
    text += [
        f'| {r["metric"]} | {r["before"]} | {r["after"]} | {r["before_papers"]} | {r["after_papers"]} |'
        for r in result["metrics"]
    ]
    args.output.with_suffix(".md").write_text("\n".join(text) + "\n")


if __name__ == "__main__":
    main()
