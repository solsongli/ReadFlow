"""One natural-break probe, shared type planning, then bounded leading adjustment."""
import pymupdf as fitz
from .layout_legacy import attempt, legacy_fit
from .layout_flow import rich_html, title_lines
from .layout_text import plain
from .layout_typography import allocate_leading, capacity, page_groups, source_style, uniform_sizes


def css_for(fonts, size, bold, color, leading, style):
    # Story ignores letter-spacing and word-spacing. Keep tracking at zero;
    # CJK natural wrapping + at most 1.7em leading do the actual adaptation.
    top = max(0.0, 0.35 - (leading - 1.05) / 2)
    indent = style.get("indent", 0)
    hanging = max(0, -indent)
    return fonts + (
        f"body{{margin:0;padding:{top:.5f}em 0 0 {hanging:.4f}pt;font-family:RF;"
        f"font-size:{size:.4f}pt;line-height:{leading:.5f};color:{color};"
        f"font-weight:{'bold' if bold else 'normal'}}}"
        f"div{{margin:0;padding:0;white-space:normal;text-align:{style.get('align', 'left')};"
        f"text-indent:{indent:.4f}pt}}sup,sub{{font-size:65%;line-height:0}}"
    )


def probe(rect, runs, fonts, archive, size, bold, color, style):
    tall = fitz.Rect(0, 0, rect.width, max(rect.height, size * (len(plain(runs)) + 10)))
    return attempt(tall, runs, css_for(fonts, size, bold, color, 1.05, style), archive, 1, rich_html)


def extent(result):
    boxes = result[2]
    return max((b[3] for b in boxes), default=0) - min((b[1] for b in boxes), default=0)


def line_count(result, size):
    # PDF extraction may put a superscript in its own line. It still belongs
    # to the surrounding HTML line and must not inflate the leading budget.
    centers = sorted((b[1] + b[3]) / 2 for b in result[2])
    rows = []
    for center in centers:
        if not rows or center - rows[-1] > size * 0.7:
            rows.append(center)
    return len(rows)


def plan_page(tasks, width, lines, fonts, archive, check):
    groups = page_groups(tasks, width)
    columns = {}
    for task in tasks:
        if task.get("type") not in {"text", "abstract", "list"}:
            continue
        key = groups[id(task)][0]
        box = fitz.Rect(task["box"])
        columns[key] = columns[key] | box if key in columns else box
    plans, samples = {}, []
    try:
        for task in tasks:
            if task["label"]:
                continue
            check()
            column = columns.get(groups[id(task)][0])
            center = (column.x0 + column.x1) / 2 if column is not None else None
            if task.get("type") == "title":
                center = width / 2
            style = source_style(task, lines, center)
            runs = (
                title_lines(task["runs"], style["source_lines"])
                if task.get("type") == "title"
                else task["runs"]
            )
            box = fitz.Rect(task["box"])
            size = max(1, task["size"])
            result = probe(box, runs, fonts, archive, size, task["bold"], task["color"], style)
            needed = capacity(size, box.height, extent(result), line_count(result, size)) if result else size
            samples.append({"group": groups[id(task)], "source": size, "capacity": needed})
            plans[id(task)] = {
                "style": style,
                "runs": runs,
                "probe": result,
                "box": tuple(box),
                "source_size": size,
                "group": groups[id(task)],
            }
        sizes = uniform_sizes(samples)
        for identity, plan in plans.items():
            plan["size"] = min(plan["source_size"], sizes[plan["group"]])
            if abs(plan["size"] - plan["source_size"]) > 0.01 and plan["probe"]:
                plan["probe"][0].close()
                plan["probe"] = None
        return plans
    except BaseException:
        close_plans(plans)
        raise


def close_plans(plans):
    for plan in plans.values():
        result = plan.pop("probe", None)
        if result:
            result[0].close()


def pack(result, size, leading, runs, outlier=False):
    return {
        "doc": result[0],
        "scale": 1.0,
        "boxes": result[2],
        "fonts": result[3],
        "overflow": False,
        "truncated": False,
        "text": plain(runs),
        "leading": leading,
        "font_size": size,
        "outlier": outlier,
    }


def explicit_floor(rect, runs, fonts, archive, size, bold, color, check):
    # Story's automatic scale is based on line boxes. A superscript can still
    # violate the glyph-bounds guard at that scale. Before truncating, explicitly
    # lay out the full text at the allowed source-size floor and check its glyphs.
    check()
    floor = size * 0.55
    css = css_for(fonts, floor, bold, color, 1.05, {"align": "left", "indent": 0})
    for leading in (1.05, 0.94):
        adjusted = (
            css
            if leading == 1.05
            else css_for(fonts, floor, bold, color, leading, {"align": "left", "indent": 0})
        )
        full = attempt(rect, runs, adjusted, archive, 1, rich_html)
        if full:
            result = pack(full, floor, leading, runs, True)
            result.update(scale=0.55, overflow=leading < 1, outlier_reason="tight_geometry")
            return result
    return None


def balanced_fit(rect, runs, fonts, archive, source_size, bold, color, check, plan=None):
    style = plan["style"] if plan else {"align": "left", "indent": 0}
    size = plan["size"] if plan else source_size
    # A split slot cannot reuse the whole-block probe or its first-line indent.
    whole = bool(plan and tuple(rect) == plan["box"] and plain(runs) == plain(plan["runs"]))
    if plan and not whole:
        style = {**style, "indent": 0}
    result = plan.pop("probe", None) if whole else None
    if not result:
        check()
        result = probe(rect, runs, fonts, archive, size, bold, color, style)
    if not result:
        fallback = legacy_fit(rect, runs, fonts, archive, source_size, bold, color, False, check, "compact")
        if fallback and fallback["truncated"]:
            complete = explicit_floor(rect, runs, fonts, archive, source_size, bold, color, check)
            if complete:
                fallback["doc"].close()
                return complete
        if fallback:
            fallback.update(
                font_size=source_size * fallback["scale"], outlier=True, outlier_reason="unbreakable_or_dense"
            )
        return fallback
    height = extent(result)
    rows = line_count(result, size)
    boxes = result[2]
    usable = max(0, rect.height - min((b[1] for b in boxes), default=0))
    fits = max((b[3] for b in boxes), default=0) <= rect.height + 0.5
    if fits:
        leading = allocate_leading(usable, size, rows, height)
        if leading > 1.06:
            check()
            for candidate in (leading, max(1.05, leading - 0.07)):
                grown = attempt(
                    rect, runs, css_for(fonts, size, bold, color, candidate, style), archive, 1, rich_html
                )
                if grown:
                    result[0].close()
                    return pack(grown, size, candidate, runs)
        media = result[0][0].mediabox
        result[0][0].set_cropbox(
            fitz.Rect(0, 0, min(rect.width, media.width), min(rect.height, media.height))
        )
        return pack(result, size, 1.05, runs)
    result[0].close()
    # Only this tight/long block shrinks. Preserve the original .55 source
    # floor, not .55 of the already planned column font.
    check()
    minimum = min(1, source_size * 0.55 / size)
    small = attempt(rect, runs, css_for(fonts, size, bold, color, 1.05, style), archive, minimum, rich_html)
    if small:
        exceptional = small[1] < 0.98
        packed = pack(small, size * small[1], 1.05, runs, exceptional)
        packed["scale"] = small[1]
        if exceptional:
            packed["outlier_reason"] = (
                "obstacle_split"
                if plan and not whole
                else "long_translation"
                if rows > max(1, style.get("source_lines", 1))
                else "tight_geometry"
            )
        return packed
    # Existing guarded truncation handles exceptionally dense text and keeps
    # all rectangle/HTML safety checks. It never moves neighbouring paragraphs.
    last = legacy_fit(rect, runs, fonts, archive, source_size, bold, color, False, check, "compact")
    if last and last["truncated"]:
        complete = explicit_floor(rect, runs, fonts, archive, source_size, bold, color, check)
        if complete:
            last["doc"].close()
            return complete
    if last:
        last.update(
            font_size=source_size * last["scale"], outlier=True, outlier_reason="unbreakable_or_dense"
        )
    return last
