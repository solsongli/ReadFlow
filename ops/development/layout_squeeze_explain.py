"""Offline, per-warning capacity proof at the source-size floor. No requests or credentials."""
from pathlib import Path
import pymupdf as fitz
from backend.library_mvp.paper_blocks_layout import tasks_for
from backend.library_mvp.layout_fonts import prepare_fonts
from backend.library_mvp.layout_legacy import attempt, css_for
from backend.library_mvp.layout_text import plain


def explain(folder, document, cache, selection, report, warnings):
    tasks, _ = tasks_for(document, cache, selection["language"], selection["fingerprint"], True)
    archive, fonts, _ = prepare_fonts(
        Path(folder), [plain(t["runs"]) for page in tasks.values() for t in page]
    )
    records = {
        (page["page"], r["id"], tuple(r["bbox"])): r
        for page in report["pages"]
        for r in page["records"]
        if r["status"] == "placed"
    }
    explained = []
    for warning in warnings:
        box = fitz.Rect(warning["bbox"])
        task = next(
            (t for t in tasks[warning["page"]] if t["id"] == warning["id"] and tuple(t["box"]) == tuple(box)),
            None,
        )
        if task is None:
            explained.append({**warning, "reason": "无法定位原始锚点，需人工核对"})
            continue
        css = css_for(fonts, task["size"] * 0.55, task["bold"], "rgb(0,0,0)", 0.94)
        fitted = attempt(box, task["runs"], css, archive, minimum=1)
        complete_fits = fitted is not None
        if fitted:
            fitted[0].close()
        source_ellipsis = plain(task["runs"]).rstrip().endswith("…")
        if source_ellipsis:
            reason = "缓存译文本身含省略号，离线排版不补造内容"
        elif not complete_fits:
            reason = "完整原锚点在 55% 字号下仍无法容纳完整译文/结构化字形"
        else:
            record = records[(warning["page"], warning["id"], tuple(box))]
            actual = [fitz.Rect(p["bbox"]) for p in record["placements"]]
            smaller = sum(p.width * p.height for p in actual) < box.width * box.height * 0.99
            reason = "图表/公式/相邻文字保护占用可写区域" if smaller else "完整区域仍省略，需检查字形/样式适配"
        explained.append(
            {
                **warning,
                "reason": reason,
                "complete_fits_at_floor": complete_fits,
                "source_font_size": task["size"],
                "input_chars": len(plain(task["runs"])),
            }
        )
    return explained
