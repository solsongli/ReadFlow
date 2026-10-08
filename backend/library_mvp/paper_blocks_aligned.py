"""Page-preserving PDF whose translated baselines follow every source line."""
from collections import defaultdict
from contextlib import ExitStack
from pathlib import Path
import statistics
import time
import pymupdf as fitz
from .layout_aligned import plan_lines, render_placement, source_line_slots
from .layout_cleanup import finish_page
from .layout_fit import fit
from .layout_fonts import prepare_fonts
from .layout_geometry import area, native_lines, owned_lines, text_color, visible_images
from .layout_links import apply_links
from .layout_ownership import bounded_tables, overlap_policy, region_obstacles
from .layout_regions import ruled_tables
from .layout_save import publish, save_pdf
from .paper_blocks_layout import tasks_for, translated_outline
from .paper_blocks_storage import write_json
from . import layout_incremental as incremental

# Bump when the aligned renderer changes visibly: finished results with an older (or no)
# revision are re-rendered locally once, without any model call. 2 = 0.9.23 robustness fixes.
ALIGNED_REVISION = 2

PDF_NAME = "translated-aligned.pdf"
AUDIT_NAME = "layout-aligned-audit.json"
PAGES_NAME = "layout-aligned-pages.json"


def _audit():
    return {
        "pages": [],
        "residual_source_chars": 0,
        "zero_width_source_chars": 0,
        "layout_overflow": [],
        "layout_truncated": [],
        "render_fallback": [],
        "label_fallback": [],
        "rendered_pages": [],
        "reused_pages": [],
        "links_reanchored": 0,
        "link_borders_hidden": 0,
        "links_unaffected": 0,
        "decorations_removed": 0,
        "decorations_removed_by_type": {},
        "aligned_baseline_deltas": [],
        "aligned_blocks": 0,
        "aligned_line_count_match": 0,
        "aligned_overflow": [],
        "aligned_shrunk": [],
        "aligned_font_ratios": [],
        "aligned_spacing_em": [],
        "aligned_fill_ratios": [],
        "aligned_before_spacing_em": [],
        "aligned_before_fill_ratios": [],
        "aligned_bold_leads": [],
    }


def _measure(fonts):
    def measure(text, size, run):
        font = fonts["bold"] if run.get("bold") and "bold" in fonts else fonts["normal"]
        return font.text_length(text, fontsize=size)

    return measure


def _summary(audit):
    values = sorted(audit["aligned_baseline_deltas"])

    def percentile(at):
        return values[min(len(values) - 1, round((len(values) - 1) * at))] if values else 0

    spacing = sorted(audit["aligned_spacing_em"])
    before_spacing = sorted(audit["aligned_before_spacing_em"])

    def at(values, percentile):
        return values[min(len(values) - 1, round((len(values) - 1) * percentile))] if values else 0

    return {
        "baseline_p50": round(percentile(0.5), 3),
        "baseline_p95": round(percentile(0.95), 3),
        "line_count_rate": round(audit["aligned_line_count_match"] / max(1, audit["aligned_blocks"]), 4),
        "overflow_blocks": len(set(audit["aligned_overflow"])),
        "shrunk_blocks": len(set(audit["aligned_shrunk"])),
        "mean_font_ratio": round(statistics.fmean(audit["aligned_font_ratios"]), 4)
        if audit["aligned_font_ratios"]
        else 1,
        "spacing_em_p50": round(at(spacing, 0.5), 4),
        "spacing_em_p95": round(at(spacing, 0.95), 4),
        "spacing_em_max": round(max(spacing, default=0), 4),
        # A document can have no aligned blocks (scanned pages, labels only); fmean([]) raises.
        "mean_fill_ratio": round(statistics.fmean(audit["aligned_fill_ratios"]), 4) if audit["aligned_fill_ratios"] else 0,
        "before_spacing_em_p50": round(at(before_spacing, 0.5), 4),
        "before_spacing_em_p95": round(at(before_spacing, 0.95), 4),
        "before_spacing_em_max": round(max(before_spacing, default=0), 4),
        "before_mean_fill_ratio": round(statistics.fmean(audit["aligned_before_fill_ratios"]), 4)
        if audit["aligned_before_fill_ratios"]
        else 0,
        "bold_lead_blocks": len(set(audit["aligned_bold_leads"])),
    }


def render_aligned(
    source,
    root,
    document,
    cache,
    language,
    fingerprint,
    check=lambda: None,
    *,
    image_text=True,
    refresh_outline=False,
    progress=lambda *_: None,
):
    started = time.perf_counter()
    tasks, regions = tasks_for(document, cache, language, fingerprint, image_text, "balanced")
    audit = _audit()
    output = Path(root) / "translated-aligned.pending.pdf"
    with fitz.open(source) as pdf, ExitStack() as resources:
        policies = {page: "shared_rows_only" for page in regions if overlap_policy(regions[page])}
        signatures = incremental.signatures(source, len(pdf), tasks, regions, "aligned", policies)
        prior = incremental.previous(
            root,
            signatures,
            pdf_name=PDF_NAME,
            audit_name=AUDIT_NAME,
            pages_name=PAGES_NAME,
        )
        graft = None
        if prior:
            resources.enter_context(prior[0])
            graft = fitz.Graftmap(pdf)
            if signatures == prior[1] and not refresh_outline:
                result = {**prior[2], "rendered_pages": [], "reused_pages": list(range(1, len(pdf) + 1))}
                result["seconds"] = round(time.perf_counter() - started, 3)
                write_json(Path(root) / AUDIT_NAME, result)
                return {key: value for key, value in result.items() if key != "pages"}
        archive, css, folder = prepare_fonts(
            root,
            ["".join(run["text"] for run in task["runs"]) for rows in tasks.values() for task in rows],
            check,
        )
        font_files = {key: folder / f"{key}.otf" for key in ("normal", "bold")}
        fonts = {key: fitz.Font(fontfile=str(path)) for key, path in font_files.items() if path.is_file()}
        measure = _measure(fonts)
        for index in range(len(pdf)):
            check()
            page = pdf[index]
            if (
                prior
                and signatures[index] == prior[1][index]
                and all(
                    getattr(page, key) == getattr(prior[0][index], key)
                    for key in ("mediabox", "cropbox", "rotation")
                )
            ):
                incremental.graft_content(pdf, prior[0], index, graft)
                record = prior[2]["pages"][index]
                page = apply_links(pdf[index], record.get("links", []))
                audit["pages"].append(record)
                incremental.add_counts(audit, record["stats"])
                for key in (
                    "aligned_baseline_deltas",
                    "aligned_overflow",
                    "aligned_shrunk",
                    "aligned_font_ratios",
                    "aligned_spacing_em",
                    "aligned_fill_ratios",
                    "aligned_before_spacing_em",
                    "aligned_before_fill_ratios",
                    "aligned_bold_leads",
                ):
                    audit[key].extend(record.get("aligned", {}).get(key, []))
                audit["aligned_blocks"] += record.get("aligned", {}).get("blocks", 0)
                audit["aligned_line_count_match"] += record.get("aligned", {}).get("line_count_match", 0)
                audit["reused_pages"].append(index + 1)
                progress(index + 1, len(pdf))
                continue
            before = incremental.start_counts(audit)
            aligned_before = {
                key: len(audit[key])
                for key in (
                    "aligned_baseline_deltas",
                    "aligned_overflow",
                    "aligned_shrunk",
                    "aligned_font_ratios",
                    "aligned_spacing_em",
                    "aligned_fill_ratios",
                    "aligned_before_spacing_em",
                    "aligned_before_fill_ratios",
                    "aligned_bold_leads",
                )
            }
            block_before = audit["aligned_blocks"]
            match_before = audit["aligned_line_count_match"]
            audit["rendered_pages"].append(index + 1)
            lines = native_lines(page)
            regions[index + 1] = bounded_tables(page, regions[index + 1])
            images = visible_images(page) if tasks[index + 1] else []
            tables = ruled_tables(page, regions[index + 1]) if tasks[index + 1] else []
            bounds = fitz.Rect(0, 0, page.cropbox.width, page.cropbox.height)
            prepared, masks, records = [], [], []
            for task in tasks[index + 1]:
                task["color"] = text_color(fitz.Rect(task["box"]), lines, exact=True)
                check()
                box = fitz.Rect(task["box"]) & bounds
                obstacles = region_obstacles(box, task, regions[index + 1], tables)
                native = owned_lines(box, lines, obstacles)
                if not native:
                    key = "label_fallback" if task["label"] else "render_fallback"
                    audit[key].append(task["id"])
                    records.append({"id": task["id"], "status": "uneditable", "bbox": list(box)})
                    continue
                placement = None
                if task["label"]:
                    try:
                        placement = fit(
                            box, task["runs"], css, archive, task["size"], False, task["color"], True, check
                        )
                        target = box
                    except Exception:
                        placement = None
                else:
                    source_lines = source_line_slots(box, lines, obstacles + images)
                    if source_lines:
                        runs = [{**run, **({"bold": True} if task["bold"] else {})} for run in task["runs"]]
                        plan = plan_lines(runs, source_lines, max(1, task["size"]), measure)
                        if plan["lines"]:
                            target, placement = render_placement(plan, folder, task["color"])
                            audit["aligned_blocks"] += 1
                            audit["aligned_line_count_match"] += len(plan["lines"]) == len(source_lines)
                            audit["aligned_font_ratios"].append(plan["scale"])
                            audit["aligned_spacing_em"].append(plan["spacing_em"])
                            audit["aligned_fill_ratios"].append(plan["fill_ratio"])
                            audit["aligned_before_spacing_em"].append(plan["before_spacing_em"])
                            audit["aligned_before_fill_ratios"].append(plan["before_fill_ratio"])
                            if task["type"] in {"text", "abstract", "list"} and any(
                                run.get("bold") for run in runs
                            ):
                                audit["aligned_bold_leads"].append(task["id"])
                            audit["aligned_baseline_deltas"].extend(
                                abs(item["source_baseline"] - item["target_baseline"])
                                for item in placement["aligned"]
                            )
                            if plan["overflow"]:
                                audit["aligned_overflow"].append(task["id"])
                            if plan["scale"] < 0.999:
                                audit["aligned_shrunk"].append(task["id"])
                if placement is None:
                    audit["label_fallback" if task["label"] else "render_fallback"].append(task["id"])
                    continue
                placement.update(owner=task["id"], label=task["label"])
                prepared.append((target, placement))
                masks.extend(native)
                records.append(
                    {
                        "id": task["id"],
                        "status": "placed",
                        "label": task["label"],
                        "type": task.get("type", "label"),
                        "bbox": list(box),
                        "redactions": [list(rect) for rect in native],
                        "placements": [
                            {
                                "bbox": list(target),
                                "scale": placement["scale"],
                                "text": placement["text"],
                                "glyph_boxes": placement["boxes"],
                                "glyphs": placement.get("glyphs", []),
                                "fonts": placement["fonts"],
                                "font_size": placement.get("font_size", task["size"] * placement["scale"]),
                                "leading": placement.get("leading", 1),
                                "aligned": placement.get("aligned"),
                                "outlier": placement.get("outlier", False),
                                "outlier_reason": placement.get("outlier_reason"),
                                "truncated": False,
                            }
                        ],
                    }
                )
            page, links, decorations = finish_page(
                page, prepared, masks, records, lines, regions[index + 1], tables, images, audit
            )
            aligned = {
                key: audit[key][aligned_before[key] :]
                for key in (
                    "aligned_baseline_deltas",
                    "aligned_overflow",
                    "aligned_shrunk",
                    "aligned_font_ratios",
                    "aligned_spacing_em",
                    "aligned_fill_ratios",
                    "aligned_before_spacing_em",
                    "aligned_before_fill_ratios",
                    "aligned_bold_leads",
                )
            }
            aligned.update(
                blocks=audit["aligned_blocks"] - block_before,
                line_count_match=audit["aligned_line_count_match"] - match_before,
            )
            audit["pages"].append(
                {
                    "page": index + 1,
                    "records": records,
                    "links": links,
                    "decorations": decorations,
                    "stats": incremental.delta(audit, before),
                    "aligned": aligned,
                }
            )
            progress(index + 1, len(pdf))
            for _, placement in prepared:
                placement["doc"].close()
        translated_outline(pdf, document, cache, language, fingerprint)
        check()
        save_pdf(pdf, output, check)
    publish(output, Path(root) / PDF_NAME)
    audit["seconds"] = round(time.perf_counter() - started, 3)
    audit["metrics"] = _summary(audit)
    write_json(Path(root) / AUDIT_NAME, audit)
    path = Path(root) / PDF_NAME
    write_json(
        Path(root) / PAGES_NAME,
        {
            "version": incremental.VERSION,
            "fit_revision": "aligned-1",
            "signatures": signatures,
            "file_size": path.stat().st_size,
            "mtime_ns": path.stat().st_mtime_ns,
        },
    )
    return {key: value for key, value in audit.items() if key != "pages"}
