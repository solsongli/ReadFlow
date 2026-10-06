"""Legacy compact fitting, retained without changes to its typography behaviour."""
import pymupdf as fitz
from .layout_text import html_runs, plain, boundaries, truncated
from .layout_density import balanced_leading


def css_for(fonts, size, bold, color, leading):
    return (
        fonts
        + f"""body{{margin:0;padding:.35em 0 .2em;font-family:RF;font-size:{size:.4f}pt;
line-height:{leading};color:{color};font-weight:{"bold" if bold else "normal"}}}
div{{margin:0;padding:0;white-space:pre-wrap}}sup,sub{{font-size:65%;line-height:0}}"""
    )


def attempt(rect, runs, css, archive, minimum=0.55, markup=html_runs):
    document = fitz.open()
    page = document.new_page(width=rect.width, height=rect.height)
    try:
        spare, scale = page.insert_htmlbox(
            page.rect, markup(runs), css=css, archive=archive, scale_low=minimum
        )
        if spare < 0:
            document.close()
            return None
        text = page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)
        spans = [s for b in text["blocks"] for line in b.get("lines", []) for s in line["spans"]]
        if any(not (page.rect + (-1, -1, 1, 1)).contains(fitz.Rect(s["bbox"])) for s in spans):
            document.close()
            return None
        if any("\ufffd" in s["text"] or "\0" in s["text"] for s in spans):
            document.close()
            return None
        count = sum(len(b.get("lines", [])) for b in text["blocks"])
        return document, scale, [s["bbox"] for s in spans], sorted({s["font"] for s in spans}), count
    except Exception:
        document.close()
        raise


def legacy_fit(
    rect,
    runs,
    fonts,
    archive,
    size,
    bold=False,
    color="rgb(0,0,0)",
    label=False,
    check=lambda: None,
    density="balanced",
):
    for leading in (1.05, 0.94):
        check()
        result = attempt(rect, runs, css_for(fonts, size, bold, color, leading), archive)
        if result:
            if density == "balanced" and not label and not bold and result[1] >= 0.999:
                desired = balanced_leading(rect.height, size, result[4])
                for candidate in (desired, (desired + 1.05) / 2):
                    if candidate <= 1.06:
                        break
                    check()
                    grown = attempt(rect, runs, css_for(fonts, size, bold, color, candidate), archive, 1)
                    if grown:
                        result[0].close()
                        result, leading = grown, candidate
                        break
            return {
                "doc": result[0],
                "scale": result[1],
                "boxes": result[2],
                "fonts": result[3],
                "overflow": leading < 1,
                "truncated": False,
                "text": plain(runs),
                "leading": leading,
            }
        if label:
            return None
    # Preserve whole words; CJK characters and punctuation are valid cut positions.
    cuts = [0] + boundaries(plain(runs))
    low, high, best = 0, len(cuts) - 1, None
    css = css_for(fonts, size, bold, color, 0.94)
    while low <= high:
        check()
        middle = (low + high) // 2
        short = truncated(runs, cuts[middle])
        result = attempt(rect, short, css, archive)
        if result:
            if best:
                best["doc"].close()
            best = {
                "doc": result[0],
                "scale": result[1],
                "boxes": result[2],
                "fonts": result[3],
                "overflow": True,
                "truncated": True,
                "text": plain(short),
            }
            low = middle + 1
        else:
            high = middle - 1
    return best
