"""Auditable warnings for a tall block written into a sliver, or text ending in an ellipsis."""
import pymupdf as fitz


def suspected_squeeze(pages):
    results = []
    for page in pages:
        for record in page["records"]:
            if record["status"] != "placed" or record.get("label"):
                continue
            height = fitz.Rect(record["bbox"]).height
            intervals = sorted((p["bbox"][1], p["bbox"][3]) for p in record["placements"])
            merged = []
            for start, end in intervals:
                if merged and start <= merged[-1][1] + 0.01:
                    merged[-1][1] = max(end, merged[-1][1])
                else:
                    merged.append([start, end])
            coverage = sum(end - start for start, end in merged) / max(0.01, height)
            flags = []
            for placement in record["placements"]:
                box = fitz.Rect(placement["bbox"])
                ratio = box.height / max(0.01, height)
                reasons = []
                if height > 40 and ratio < 0.35 and coverage < 0.35:
                    reasons.append("small_placement")
                if placement.get("truncated") or placement["text"].rstrip().endswith("…"):
                    reasons.append("ellipsis")
                if reasons:
                    flags.append(
                        {
                            "bbox": list(box),
                            "height_ratio": round(ratio, 4),
                            "reasons": reasons,
                            "font_size": placement.get("font_size"),
                            "total_height_ratio": round(coverage, 4),
                            "text": placement["text"][-100:],
                        }
                    )
            if flags:
                results.append(
                    {
                        "page": page["page"],
                        "id": record["id"],
                        "type": record.get("type"),
                        "bbox": record["bbox"],
                        "placements": flags,
                    }
                )
    return results
