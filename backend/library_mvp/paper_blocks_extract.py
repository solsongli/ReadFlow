"""CPU-only extraction. No layout model, OCR or upstream translation code is used."""
import collections
import math
import re
from pathlib import Path
import pymupdf as fitz
from . import paper_blocks_model as model
from .paper_blocks_graphics import graphics, assign_figure_text
from .paper_blocks_lines import lines
from .paper_blocks_text import text_blocks, mark_margins, word_frequencies
from .paper_blocks_paragraphs import join_paragraphs
from .paper_blocks_equations import equation_parts


def geometry(page):
    rotation = page.rotation
    display = page.rect
    transform = page.rotation_matrix
    page.set_rotation(0)
    pdf_to_page = page.transformation_matrix
    return {
        "page": page.number + 1,
        "rotation": rotation,
        "width": display.width,
        "height": display.height,
        "cropbox": list(page.cropbox),
        "mediabox": list(page.mediabox),
        "pdf_to_page": list(pdf_to_page),
        "page_to_display": list(transform),
    }


def anchor(box, meta):
    rect = fitz.Rect(box)
    pdf = rect * ~fitz.Matrix(meta["pdf_to_page"])
    visible = rect * fitz.Matrix(meta["page_to_display"])
    return {
        "page": meta["page"],
        "bbox": list(rect),
        "pdf_bbox": list(pdf),
        "view_bbox": [
            visible.x0 / meta["width"],
            visible.y0 / meta["height"],
            visible.x1 / meta["width"],
            visible.y1 / meta["height"],
        ],
    }


def extract(path, directory, sha, check=lambda: None):
    pages, all_rows, stats = [], [], []
    with fitz.open(path) as doc:
        for page in doc:
            check()
            meta = geometry(page)
            rows = lines(page)
            meta["text_status"] = "native_text" if rows else "needs_ocr"
            sizes = [round(r["size"], 1) for r in rows for _ in range(min(80, len(r["text"])))]
            body = collections.Counter(sizes).most_common(1)[0][0] if sizes else 10
            stats.append((meta, rows, body))
            pages.append(meta)
        body_sizes = collections.Counter(
            round(r["size"], 1)
            for meta, rows, _ in stats
            for r in rows
            if not r["sideways"]
            and len(r["text"]) > 35
            and r["bbox"][2] - r["bbox"][0] > fitz.Rect(meta["cropbox"]).width * 0.25
            for _ in range(min(80, len(r["text"])))
        )
        body_size = body_sizes.most_common(1)[0][0] if body_sizes else 10
        mark_margins(stats)
        words = word_frequencies([r for _, rows, _ in stats for r in rows])
        in_references = False
        for index, (meta, raw, body) in enumerate(stats):
            check()
            page = doc[index]
            rows = text_blocks(raw, body_size, index + 1, page.rect.width, page.rect.height, words)
            rows = equation_parts(rows, words)
            images = graphics(page, rows)
            rows = assign_figure_text(rows, images, words)
            ordered = model.reading_order(rows + images, page.rect.width)
            saw_title, saw_abstract, abstract_active = False, False, False
            for row in ordered:
                if row["type"] == "title":
                    saw_title = True
                if re.match(r"^(Abstract\b|摘要)", row["text"], re.I):
                    saw_abstract = abstract_active = True
                    row["type"] = "abstract"
                elif (
                    index == 0
                    and saw_title
                    and not saw_abstract
                    and row["type"] in {"text", "heading"}
                    and row["bbox"][1] < page.rect.height * 0.45
                ):
                    row["type"] = "author"
                elif row["type"] == "heading":
                    abstract_active = False
                elif abstract_active and row["type"] == "text":
                    row["type"] = "abstract"
                if model.REFERENCE.match(row["text"]):
                    in_references = True
                elif model.APPENDIX.match(row["text"]):
                    in_references = False
                    row["type"] = "heading"
                if in_references and row["type"] not in {
                    "header",
                    "footer",
                    "footnote",
                    "figure",
                    "table",
                    "formula",
                    "caption",
                }:
                    row["type"] = "reference"
                row["anchors"] = [
                    {
                        **anchor(row["bbox"], meta),
                        "first_indent": row.get("first_indent", False),
                        "paragraph_gap": row.get("paragraph_gap", False),
                    }
                ]
                all_rows.append(row)
        merged = join_paragraphs(all_rows, words)
        blocks = []
        for row in merged:
            check()
            row["id"] = model.block_id(row["anchors"], row["text"])
            row["page"] = row["anchors"][0]["page"]
            row["protected"] = model.protected_ranges(row["text"], row.pop("math_parts", []))
            row["extractor"] = model.EXTRACTOR_VERSION
            row["confidence"] = "heuristic"
            if row["type"] in {"figure", "table", "formula"}:
                clip = fitz.Rect(row["bbox"]) & doc[row["page"] - 1].rect
                if clip.width > 1 and clip.height > 1:
                    name = row["id"]
                    with fitz.open() as cut:
                        target = cut.new_page(width=clip.width, height=clip.height)
                        target.show_pdf_page(target.rect, doc, row["page"] - 1, clip=clip)
                        target.set_rotation(pages[row["page"] - 1]["rotation"])
                        cut.save(Path(directory) / f"{name}.pdf", garbage=4, deflate=True)
                        target.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(Path(directory) / f"{name}.png")
                    row["asset"] = f"{name}.pdf"
                    row["thumbnail"] = f"{name}.png"
            blocks.append(row)
        for block in blocks:
            if block.get("caption_text"):
                caption = next(
                    (
                        c
                        for c in blocks
                        if c["type"] == "caption" and c["page"] == block["page"] and c["text"] == block["caption_text"]
                    ),
                    None,
                )
                block["caption_id"] = caption["id"] if caption else None
        return {
            "schema_version": model.SCHEMA_VERSION,
            "extractor_version": model.EXTRACTOR_VERSION,
            "sha256": sha,
            "pages": pages,
            "blocks": blocks,
            "capabilities": {"layout": "heuristic", "ocr": False},
            "warnings": ["本阶段依赖 PDF 文字层；部分页面没有可提取文字，尚未接入 OCR。"]
            if any(p["text_status"] == "needs_ocr" for p in pages)
            else [],
        }
