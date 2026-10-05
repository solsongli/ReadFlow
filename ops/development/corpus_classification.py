"""Independent region diagnostics, shared unchanged by before/after measurements."""
import re
from backend.library_mvp.paper_blocks_model import REFERENCE, SKIP
from backend.library_mvp.paper_blocks_programs import programs
from .corpus_boundaries import position


def classification(pdf, document, raw, by_page, chars, fraction, boundary_fn):
    starts = [(page, row) for page, rows in raw.items() for row in rows if REFERENCE.match(row["text"].strip())]
    start = min(starts, key=lambda p: (p[0], p[1]["bbox"][1]), default=None)
    boundary = boundary_fn(pdf, raw, start[0]) if start else None
    ref_leaks, cropped_prose, authors, code = [], [], [], []
    for page in pdf:
        number = page.number + 1
        layout = document["pages"][page.number].get("layout_regions", [])
        expected_programs = programs(page, raw[number])
        for row in raw[number]:
            box = row["bbox"]
            owners = [b for b, area in by_page[number] if fraction(box, area) >= 0.65]
            entry = {"page": number, "bbox": box, "characters": chars(row["text"]), "text": row["text"][:160]}
            is_reference = (
                start
                and number >= start[0]
                and (number > start[0] or (box[0] >= start[1]["bbox"][0] - 5 and box[1] >= start[1]["bbox"][1]))
            )
            if boundary and position(pdf, raw, number, box[0], box[1]) >= position(
                pdf, raw, boundary[0], boundary[3], boundary[1]
            ):
                is_reference = False
            if is_reference and any(
                b["type"] not in SKIP
                and any(s["text"] == row["text"] and s["bbox"] == row["bbox"] for s in b.get("source_lines", []))
                for b in owners
            ):
                ref_leaks.append(entry)
            prose = [
                r
                for r in layout
                if r["type"] in {"abstract", "text"} and r["confidence"] >= 0.85 and fraction(box, r["bbox"]) > 0.8
            ]
            if len(row["text"].split()) >= 8 and prose:
                if any(b["type"] == "figure" for b in owners):
                    cropped_prose.append(entry)
                if any(b["type"] == "author" for b in owners):
                    authors.append(entry)
            if any(fraction(box, r["bbox"]) > 0.8 for r in expected_programs):
                if not any(b["type"] in {"algorithm", "code"} for b in owners):
                    code.append(entry)
    result = {}
    for name, values in [
        ("reference_leak", ref_leaks),
        ("cropped_prose", cropped_prose),
        ("author_prose", authors),
        ("program_leak", code),
    ]:
        result[name + "_characters"] = sum(r["characters"] for r in values)
        result[name + "_details"] = values
    return result
