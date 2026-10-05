"""Audit bibliography bounds in reading order, without trusting the extracted block type."""
import re
from backend.library_mvp.paper_blocks_model import REFERENCE
from backend.library_mvp.paper_blocks_sections import canonical, reference_entry


def position(pdf, raw, page, x, y):
    width = pdf[page - 1].rect.width
    narrow = [r for r in raw.get(page, []) if width * 0.24 < r["bbox"][2] - r["bbox"][0] < width * 0.56]
    split = (
        sum(r["bbox"][0] < width * 0.42 for r in narrow) >= 2
        and sum(r["bbox"][0] > width * 0.45 for r in narrow) >= 2
    )
    wide = [r for r in raw.get(page, []) if r["bbox"][2] - r["bbox"][0] > width * 0.65 and not r.get("sideways")]
    band = sum(r["bbox"][1] <= y + 0.1 for r in wide) if split else 0
    return (page, band, int(split and x > width * 0.45), y)


def appendix_boundary(pdf, raw, start):
    outline = pdf.get_toc()
    reference = next((r for r in raw.get(start, []) if REFERENCE.match(r["text"].strip())), None)
    begin = (
        position(pdf, raw, start, reference["bbox"][0], reference["bbox"][1]) if reference else (start, 0, 0, 0)
    )
    candidates = []
    for _, title, page in outline:
        if page < start or REFERENCE.match(title):
            continue
        target = canonical(title)
        hit = next((r for r in raw.get(page, []) if canonical(r["text"]) == target), None)
        if hit:
            box = hit["bbox"]
            if position(pdf, raw, page, box[0], box[1]) > begin:
                candidates.append((page, box[1], "outline", box[0]))
    metadata = re.compile(
        r"^(?:acknowledg(?:e)?ments?|author contributions|data availability|funding|"
        r"figure legends|publisher[’']s note|competing interests)\b",
        re.I,
    )
    for page, rows in raw.items():
        for row in rows:
            box = row["bbox"]
            if position(pdf, raw, page, box[0], box[1]) <= begin:
                continue
            value = row["text"].strip()
            explicit = re.match(
                r"^(?:appendix|appendices|supplementary (?:material|information)|附录)\b", value, re.I
            )
            letter = re.match(r"^[A-Z](?:\.\d+)*[.\s]+[A-Z][A-Za-z ]{3,}", value)
            styled = (
                reference
                and not row.get("sideways")
                and not reference_entry(value)
                and pdf[page - 1].rect.height * 0.08 < box[1] < pdf[page - 1].rect.height * 0.9
                and row.get("bold")
                and row.get("size", 0) >= reference.get("size", 10) * 0.95
            )
            if len(value) < 150 and (
                styled
                or explicit
                or metadata.match(value)
                or letter
                and row.get("bold")
                and not reference_entry(value)
            ):
                candidates.append((page, box[1], "native_heading", box[0]))
    return min(candidates, key=lambda p: position(pdf, raw, p[0], p[3], p[1]), default=None)
