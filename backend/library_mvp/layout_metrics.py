"""Comparable paragraph occupancy, type dispersion and added vertical blank area."""
from collections import defaultdict
from statistics import mean, pstdev
import pymupdf as fitz
from .layout_typography import BODY, page_groups


def percentile(values, fraction):
    values = sorted(values)
    if not values:
        return None
    at = (len(values) - 1) * fraction
    left = int(at)
    right = min(len(values) - 1, left + 1)
    return round(values[left] + (values[right] - values[left]) * (at - left), 4)


def typography_metrics(document, audit):
    """Glyph-box vertical occupancy, not raster ink coverage or a ground truth score.

    The denominator uses original anchor rectangles. Existing page/figure
    whitespace is excluded; per-column groups preserve actual source hierarchy.
    Audit placements are PDF glyph bounds, including preserved super/subscripts.
    """
    blocks = {b["id"]: b for b in document["blocks"]}
    groups, ratios, body_area, added_blank, outliers = defaultdict(list), [], 0, 0, set()
    per_page, reasons = [], defaultdict(set)
    for page in audit["pages"]:
        candidates = [
            {
                "box": r["bbox"],
                "size": blocks[r["id"]].get("text_size", blocks[r["id"]].get("size", 10)),
                "type": blocks[r["id"]]["type"],
                "label": False,
                "record": r,
            }
            for r in page["records"]
            if r["status"] == "placed" and r["id"] in blocks and not r.get("label")
        ]
        width = next((p["width"] for p in document.get("pages", []) if p["page"] == page["page"]), 612)
        keys = page_groups(candidates, width)
        for task in candidates:
            for p in task["record"]["placements"]:
                if not p["glyph_boxes"]:
                    continue
                size = p.get("font_size", task["size"] * p["scale"])
                key = (page["page"], *keys[id(task)])
                groups[key].append(size)
                if p.get("outlier"):
                    outliers.add(task["record"]["id"])
                    reasons[p.get("outlier_reason") or "legacy_geometry"].add(task["record"]["id"])
                if task["type"] not in BODY:
                    continue
                box = fitz.Rect(p["bbox"])
                height = max(b[3] for b in p["glyph_boxes"]) - min(b[1] for b in p["glyph_boxes"])
                ratio = height / max(0.01, box.height)
                ratios.append(ratio)
                body_area += max(0, box.width * box.height)
                added_blank += max(0, box.height - height) * max(0, box.width)
        page_groups_values = [
            values for key, values in groups.items() if key[0] == page["page"] and len(values) > 1
        ]
        per_page.append(
            {
                "page": page["page"],
                "font_sd_pt": round(mean(map(pstdev, page_groups_values)), 4) if page_groups_values else 0,
            }
        )
    eligible = [v for key, v in groups.items() if len(v) > 1 and key[-1] == "body"]
    return {
        "paragraphs": len(ratios),
        "paragraph_occupancy": {
            "p10": percentile(ratios, 0.1),
            "p50": percentile(ratios, 0.5),
            "p90": percentile(ratios, 0.9),
        },
        "body_font_sd_pt": round(mean(map(pstdev, eligible)), 4) if eligible else 0,
        "body_font_cv": round(mean(pstdev(v) / mean(v) for v in eligible), 4) if eligible else 0,
        "added_body_blank_ratio": round(added_blank / max(1, body_area), 4),
        "outlier_blocks": len(outliers),
        "outlier_reasons": {key: len(value) for key, value in reasons.items()},
        "font_dispersion_by_page": per_page,
    }
