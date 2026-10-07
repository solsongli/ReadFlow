"""ReadFlow page-preserving PDF renderer. Text-only, line-level redactions plus fitted HTML."""
from collections import defaultdict
from contextlib import ExitStack
from pathlib import Path
import re
import time
import pymupdf as fitz
from .layout_fonts import prepare_fonts
from .layout_text import TRANSLATABLE, allocate, plain
from .layout_geometry import (
    area,
    free_rects,
    native_lines,
    owned_lines,
    text_color,
    visible_images,
)
from .layout_fit import fit
from .layout_balanced import plan_page, close_plans
from .layout_cleanup import finish_page
from .layout_links import apply_links
from .layout_regions import ruled_tables
from .layout_ownership import bounded_tables, source_boxes, region_obstacles, flow_slots, overlap_policy
from .layout_squeeze import suspected_squeeze
from .layout_glyphs import display_runs
from .layout_save import save_pdf
from . import layout_incremental as incremental
from .paper_blocks_model import cache_key
from .paper_blocks_inline import normalize_render_runs, source_runs, rich_text, restore_lead_bold
from .paper_blocks_labels import translated_labels
from .paper_blocks_storage import write_json


def value_runs(block, cache, language, fingerprint):
    value = cache.get(cache_key(block, language, fingerprint))
    if not rich_text(value):
        return None
    runs = (
        value.get("runs") or [{"kind": "text", "text": value["text"]}]
        if isinstance(value, dict)
        else source_runs(block, value)
    )
    return restore_lead_bold(block, normalize_render_runs(runs))


def tasks_for(document, cache, language, fingerprint, image_text, density="balanced"):
    tasks, regions = defaultdict(list), defaultdict(list)
    for block in document["blocks"]:
        for a in block["anchors"]:
            regions[a["page"]].append(
                {
                    "id": block["id"],
                    "type": block["type"],
                    "bbox": a["bbox"],
                    "text": block.get("text", ""),
                    "line_boxes": source_boxes(block, a),
                    "caption_id": block.get("caption_id"),
                }
            )
        runs = value_runs(block, cache, language, fingerprint) if block["type"] in TRANSLATABLE else None
        runs = display_runs(runs) if runs else None
        if runs:
            parts = allocate(runs, [area(fitz.Rect(a["bbox"])) for a in block["anchors"]])
            for index, anchor in enumerate(block["anchors"]):
                tasks[anchor["page"]].append(
                    {
                        "id": block["id"],
                        "box": anchor["bbox"],
                        "runs": parts[index],
                        "size": block.get("text_size", block.get("size", 10)),
                        "type": block["type"],
                        "bold": (block.get("bold", True) if density == "balanced" else True)
                        if block["type"] in {"title", "heading"}
                        else False,
                        "label": False,
                    }
                )
        if image_text and block["type"] in {"figure", "table"}:
            for label in translated_labels(block, cache, language, fingerprint):
                if label.get("translation") and label.get("bbox"):
                    tasks[block["page"]].append(
                        {
                            "id": label["id"],
                            "parent": block["id"],
                            "box": label["bbox"],
                            "runs": [{"kind": "text", "text": label["translation"]}],
                            "size": label.get("size", 8),
                            "bold": False,
                            "label": True,
                        }
                    )
    return tasks, regions


def translated_outline(pdf, document, cache, language, fingerprint):
    toc = pdf.get_toc(simple=False)
    key = lambda value: re.sub(r"\W", "", value).casefold()
    headings = {
        key(b.get("outline_title", b["text"])): b for b in document["blocks"] if b["type"] == "heading"
    }
    for index, entry in enumerate(toc):
        block = headings.get(key(entry[1]))
        if block:
            value = cache.get(cache_key(block, language, fingerprint))
            if rich_text(value):
                pdf.set_toc_item(index, title=rich_text(value))
    if not toc:
        toc = [
            [1, rich_text(cache.get(cache_key(b, language, fingerprint))) or b["text"], b["page"]]
            for b in document["blocks"]
            if b["type"] == "heading"
        ]
        if toc:
            pdf.set_toc(toc)


def render_layout(
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
    density="balanced",
    progress=lambda *_: None,
):
    started = time.perf_counter()
    tasks, regions = tasks_for(document, cache, language, fingerprint, image_text, density)
    audit = {
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
    }
    output = Path(root) / "translated-layout.pending.pdf"
    with fitz.open(source) as pdf, ExitStack() as resources:
        policies = {p: "shared_rows_only" for p in regions if overlap_policy(regions[p])}
        signatures = incremental.signatures(source, len(pdf), tasks, regions, density, policies)
        prior = incremental.previous(root, signatures)
        graft = None
        if prior:
            resources.enter_context(prior[0])
            graft = fitz.Graftmap(pdf)
            if signatures == prior[1] and not refresh_outline:
                audit = {
                    **prior[2],
                    "rendered_pages": [],
                    "reused_pages": list(range(1, len(pdf) + 1)),
                    "seconds": round(time.perf_counter() - started, 3),
                }
                audit["suspected_squeeze"] = suspected_squeeze(audit["pages"])
                write_json(Path(root) / "layout-audit.json", audit)
                return {key: value for key, value in audit.items() if key != "pages"}
        archive, fonts, _ = prepare_fonts(
            root, [plain(t["runs"]) for page in tasks.values() for t in page], check
        )
        for index in range(len(pdf)):
            check()
            page = pdf[index]
            if (
                prior
                and signatures[index] == prior[1][index]
                and all(
                    getattr(page, k) == getattr(prior[0][index], k)
                    for k in ("mediabox", "cropbox", "rotation")
                )
            ):
                incremental.graft_content(pdf, prior[0], index, graft)
                record = prior[2]["pages"][index]
                page = apply_links(pdf[index], record.get("links", []))
                audit["pages"].append(record)
                incremental.add_counts(audit, record["stats"])
                audit["reused_pages"].append(index + 1)
                progress(index + 1, len(pdf))
                continue
            before = incremental.start_counts(audit)
            audit["rendered_pages"].append(index + 1)
            lines = native_lines(page)
            regions[index + 1] = bounded_tables(page, regions[index + 1])
            images = visible_images(page) if tasks[index + 1] else []
            tables = ruled_tables(page, regions[index + 1]) if tasks[index + 1] else []
            bounds = fitz.Rect(0, 0, page.cropbox.width, page.cropbox.height)
            prepared, masks, records = [], [], []
            for task in tasks[index + 1]:
                task["color"] = text_color(fitz.Rect(task["box"]), lines, exact=density == "balanced")
            plans = (
                plan_page(tasks[index + 1], bounds.width, lines, fonts, archive, check)
                if density == "balanced"
                else {}
            )
            try:
                for task in tasks[index + 1]:
                    check()
                    box = fitz.Rect(task["box"]) & bounds
                    obstacles = region_obstacles(box, task, regions[index + 1], tables)
                    native = owned_lines(box, lines, obstacles)
                    # Bitmap-only OCR text cannot be removed without changing the original image.
                    if not native:
                        key = "label_fallback" if task["label"] else "render_fallback"
                        audit[key].append(task["id"])
                        records.append({"id": task["id"], "status": "uneditable", "bbox": list(box)})
                        continue
                    # Inline math/raster figures have no text to redact. Keep their
                    # location out of the writing area, but still remove owned text
                    # behind them using text-only redaction.
                    writing_obstacles = obstacles + ([] if task["label"] else images)
                    slots = flow_slots(box, writing_obstacles, native, task["size"])
                    if not slots:
                        audit["label_fallback" if task["label"] else "render_fallback"].append(task["id"])
                        continue
                    plan = plans.get(id(task))
                    chunks = allocate(plan["runs"] if plan else task["runs"], [area(r) for r in slots])
                    fragments = []
                    for slot, chunk in zip(slots, chunks):
                        if not plain(chunk):
                            continue
                        try:
                            placement = fit(
                                slot,
                                chunk,
                                fonts,
                                archive,
                                max(1, task["size"]),
                                task["bold"],
                                task["color"],
                                task["label"],
                                check,
                                density=density,
                                plan=plan,
                            )
                        except Exception:
                            check()
                            placement = None
                        if placement is None:
                            for _, previous in fragments:
                                previous["doc"].close()
                            fragments = []
                            break
                        placement.update(owner=task["id"], label=task["label"])
                        fragments.append((slot, placement))
                    if not fragments:
                        audit["label_fallback" if task["label"] else "render_fallback"].append(task["id"])
                        continue
                    masks.extend(native)
                    prepared.extend(fragments)
                    if any(p["overflow"] for _, p in fragments):
                        audit["layout_overflow"].append(task["id"])
                    if any(p["truncated"] for _, p in fragments):
                        audit["layout_truncated"].append(task["id"])
                    records.append(
                        {
                            "id": task["id"],
                            "status": "placed",
                            "label": task["label"],
                            "type": task.get("type", "label"),
                            "group": list(plan["group"]) if plan else None,
                            "bbox": list(box),
                            "redactions": [list(r) for r in native],
                            "placements": [
                                {
                                    "bbox": list(r),
                                    "scale": p["scale"],
                                    "text": p["text"],
                                    "glyph_boxes": p["boxes"],
                                    "fonts": p["fonts"],
                                    "font_size": p.get("font_size", task["size"] * p["scale"]),
                                    "leading": p.get("leading", 1.05),
                                    "outlier": p.get("outlier", False),
                                    "outlier_reason": p.get("outlier_reason"),
                                    "truncated": p["truncated"],
                                }
                                for r, p in fragments
                            ],
                        }
                    )
                page, links, decorations = finish_page(
                    page, prepared, masks, records, lines, regions[index + 1], tables, images, audit
                )
                audit["pages"].append(
                    {
                        "page": index + 1,
                        "records": records,
                        "links": links,
                        "decorations": decorations,
                        "stats": incremental.delta(audit, before),
                    }
                )
                progress(index + 1, len(pdf))
            finally:
                close_plans(plans)
                for _, placement in prepared:
                    placement["doc"].close()
        translated_outline(pdf, document, cache, language, fingerprint)
        check()
        save_pdf(pdf, output, check)
    check()
    output.replace(Path(root) / "translated-layout.pdf")
    for key in ("layout_overflow", "layout_truncated", "render_fallback", "label_fallback"):
        audit[key] = list(dict.fromkeys(audit[key]))
    audit["seconds"] = round(time.perf_counter() - started, 3)
    audit["suspected_squeeze"] = suspected_squeeze(audit["pages"])
    write_json(Path(root) / "layout-audit.json", audit)
    path = Path(root) / "translated-layout.pdf"
    write_json(
        Path(root) / "layout-pages.json",
        {
            "version": incremental.VERSION,
            "fit_revision": incremental.FIT_REVISION,
            "signatures": signatures,
            "file_size": path.stat().st_size,
            "mtime_ns": path.stat().st_mtime_ns,
        },
    )
    return {key: value for key, value in audit.items() if key != "pages"}
