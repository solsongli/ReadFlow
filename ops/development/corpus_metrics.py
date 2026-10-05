"""Geometry-based diagnostics for a corpus; flags are review candidates, not ground truth."""
from collections import Counter, defaultdict
import re
import unicodedata
import pymupdf as fitz
from backend.library_mvp.paper_blocks_model import SKIP, REFERENCE
from backend.library_mvp.paper_blocks_labels import translation_units
from backend.library_mvp.paper_blocks_lines import lines
from backend.library_mvp.paper_blocks_extract import geometry
from backend.library_mvp.paper_blocks_paragraphs import sentence_end
from .corpus_classification import classification
from backend.library_mvp.paper_blocks_sections import canonical, reference_entry
from .corpus_boundaries import appendix_boundary, position


def characters(text):
    return len(re.sub(r"\s", "", unicodedata.normalize("NFKC", text)))


def fraction(inner, outer):
    a, b = fitz.Rect(inner), fitz.Rect(outer)
    r = a & b
    return max(0, r.width) * max(0, r.height) / max(0.01, a.width * a.height)


def measure(pdf, document):
    blocks = document["blocks"]
    counts, sizes = Counter(), Counter()
    by_page, raw = defaultdict(list), {}
    for block in blocks:
        counts[block["type"]] += 1
        sizes[block["type"]] += characters(block["text"])
        for anchor in block["anchors"]:
            by_page[anchor["page"]].append((block, anchor["bbox"]))
    raw_total, excluded, covered, crop_chars = 0, 0, 0, 0
    algorithm_markers, uncontained_code = [], []
    for page in pdf:
        geometry(page)
        page_number = page.number + 1
        raw[page_number] = lines(page)
        for row in raw[page_number]:
            count = characters(row["text"])
            raw_total += count
            owners = [b for b, box in by_page[page_number] if fraction(row["bbox"], box) >= 0.65]
            if any(
                b["type"] in {"reference", "header", "footer"}
                and any(s["text"] == row["text"] and s["bbox"] == row["bbox"] for s in b.get("source_lines", []))
                for b in owners
            ):
                excluded += count
            elif owners:
                covered += count
                if any(b.get("asset") for b in owners):
                    crop_chars += count
            if re.match(r"^\s*(?:Algorithm|Listing|算法)\s*\d+\b", row["text"], re.I):
                marker = {"page": page_number, "bbox": row["bbox"], "text": row["text"]}
                algorithm_markers.append(marker)
                if not any(b["type"] in {"algorithm", "code"} for b in owners):
                    uncontained_code.append(marker)
    selected = [b for b in translation_units(blocks) if b["type"] not in SKIP and b["text"].strip()]
    translation_total = sum(characters(b["text"]) for b in selected)
    ocr_characters = sum(characters(b["text"]) for b in selected if b.get("source") == "ocr")
    translated = translation_total - ocr_characters
    denominator = raw_total - excluded
    short = [
        b
        for b in blocks
        if b["type"] == "text"
        and len(re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]", b["text"])) <= 3
        and not sentence_end(b["text"])
    ]
    single, jumps = [], []
    prior = None
    for block in blocks:
        if block["type"] in {"header", "footer", "figure", "table", "caption", "formula", "algorithm", "code"}:
            continue
        if prior and prior["type"] == block["type"] == "text":
            a, b = prior["anchors"][-1], block["anchors"][0]
            same_column = min(a["bbox"][2], b["bbox"][2]) - max(a["bbox"][0], b["bbox"][0]) > 20
            gap = b["bbox"][1] - a["bbox"][3]
            if (
                a["page"] == b["page"]
                and same_column
                and -5 <= gap <= max(prior.get("size", 10), 10)
                and not sentence_end(prior["text"])
                and re.match(r"^[a-z]", block["text"])
            ):
                if len(prior.get("source_lines", [])) == 1 or len(block.get("source_lines", [])) == 1:
                    single.append(
                        {
                            "previous": prior["id"],
                            "next": block["id"],
                            "page": b["page"],
                            "chars": characters(prior["text"] + block["text"]),
                        }
                    )
            if a["page"] == b["page"] and same_column and b["bbox"][1] < a["bbox"][1] - 25:
                jumps.append(
                    {
                        "previous": prior["id"],
                        "next": block["id"],
                        "page": b["page"],
                        "chars": characters(prior["text"] + block["text"]),
                    }
                )
        prior = block
    figures = [b for b in blocks if b["type"] in {"figure", "table"}]
    linked = {b.get("caption_id") for b in figures}
    orphans = [b for b in blocks if b["type"] == "caption" and b["id"] not in linked]
    without = [b for b in figures if not b.get("caption_id")]
    refs = [a["page"] for b in blocks if b["type"] == "reference" for a in b["anchors"]]
    boundary = appendix_boundary(pdf, raw, min(refs)) if refs else None
    untranslatable = [
        b
        for b in blocks
        if boundary
        and b["type"] in {"reference", "author"}
        and position(pdf, raw, b["page"], b["bbox"][0], b["bbox"][1])
        >= position(pdf, raw, boundary[0], boundary[3], boundary[1])
        and not any(reference_entry(s["text"]) for s in b.get("source_lines", []))
        and len(b["text"].split()) >= 8
    ]
    headings = {
        (b["page"], canonical(b.get("outline_title", b["text"]))) for b in blocks if b["type"] == "heading"
    }
    toc = pdf.get_toc()
    matched = sum((page, canonical(title)) in headings for _, title, page in toc)
    examples = lambda rows: [{"id": b["id"], "page": b["page"], "text": b["text"][:160]} for b in rows]
    return {
        **classification(pdf, document, raw, by_page, characters, fraction, appendix_boundary),
        "types": dict(counts),
        "figure_text_labels": sum(len(b.get("figure_text", [])) for b in blocks),
        "figure_text_characters": sum(characters(r["text"]) for b in blocks for r in b.get("figure_text", [])),
        "type_characters": dict(sizes),
        "native_characters": raw_total,
        "excluded_reference_margin_characters": excluded,
        "translation_denominator": denominator,
        "translatable_characters": translated,
        "ocr_translatable_characters": ocr_characters,
        "translation_total_characters": translation_total,
        "translatable_ratio": round(translated / max(1, denominator), 4),
        "native_covered_characters": covered,
        "native_crop_characters": crop_chars,
        "native_coverage_ratio": round(covered / max(1, denominator), 4),
        "reference_pages": [min(refs), max(refs)] if refs else None,
        "appendix_boundary": boundary,
        "post_reference_untranslated_characters": sum(characters(b["text"]) for b in untranslatable),
        "post_reference_examples": examples(untranslatable),
        "short_fragments": len(short),
        "short_fragment_characters": sum(characters(b["text"]) for b in short),
        "short_fragment_examples": examples(short),
        "single_line_fragments": len(single),
        "single_line_details": single,
        "reading_order_jumps": len(jumps),
        "reading_order_details": jumps,
        "orphan_captions": len(orphans),
        "orphan_caption_characters": sum(characters(b["text"]) for b in orphans),
        "orphan_caption_examples": examples(orphans),
        "uncaptioned_figures": len(without),
        "outline_items": len(toc),
        "outline_matched": matched,
        "outline_ratio": matched / len(toc) if toc else None,
        "algorithm_markers": algorithm_markers,
        "uncontained_algorithms": uncontained_code,
        "algorithm_crops": counts["algorithm"] + counts["code"],
    }


def summary(records):
    keys = (
        "post_reference_untranslated_characters",
        "short_fragment_characters",
        "orphan_caption_characters",
        "reference_leak_characters",
        "cropped_prose_characters",
        "author_prose_characters",
        "program_leak_characters",
    )
    categories = {
        key: {"characters": sum(r[key] for r in records), "papers": sum(r[key] > 0 for r in records)}
        for key in keys
    }
    for field in ("single_line_details", "reading_order_details"):
        categories[field] = {
            "characters": sum(d["chars"] for r in records for d in r[field]),
            "papers": sum(bool(r[field]) for r in records),
        }
    return sorted(
        ({"category": k, **v} for k, v in categories.items()), key=lambda r: (-r["characters"], -r["papers"])
    )
