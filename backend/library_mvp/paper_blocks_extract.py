"""Owned block extraction; optional built-in CPU analysis enriches the native text geometry."""
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
from .paper_blocks_inline import line_math_parts
from .document_models import DocumentModels, available
from .document_layout import page_layout, fuse_layout
from .document_ocr_pages import scan_lines, image_labels
from .paper_blocks_labels import identify_labels
from .paper_blocks_programs import programs
from .paper_blocks_regions import refine_regions
from .document_figure_labels import native_figure_labels
from .paper_blocks_sections import tag_outline, classify_sections
from .paper_blocks_special import (
    mark_footnotes,
    mark_caption_continuations,
    join_captions,
    include_small_figure_labels,
)


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


def extract(path, directory, sha, check=lambda: None, *, models=None, enrich=True):
    pages, all_rows, stats = [], [], []
    warnings = []
    if models is None and enrich and available():
        try:
            models = DocumentModels()
        except (ValueError, OSError, ImportError):
            warnings.append("内置版面组件不可用，已使用文字层启发式提取。")
    with fitz.open(path) as doc:
        outline = doc.get_toc()
        for page in doc:
            check()
            meta = geometry(page)
            rows = lines(page)
            meta["text_status"] = "native_text" if rows else "needs_ocr"
            if models and sum(len(r["text"]) for r in rows) < 50:
                try:
                    recognized = scan_lines(page, models, directory, check)
                    if sum(len(r["text"]) for r in recognized) > sum(len(r["text"]) for r in rows):
                        rows = recognized
                        meta["text_status"] = "ocr"
                except Exception:
                    check()
                    warnings.append(f"第 {page.number + 1} 页 OCR 未完成，保留已有文字。")
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
        for index, (meta, raw, body) in enumerate(stats):
            check()
            page = doc[index]
            mark_footnotes(page, raw, body_size)
            rows = text_blocks(raw, body_size, index + 1, page.rect.width, page.rect.height, words)
            rows = tag_outline(rows, index + 1, outline, words, page)
            rows = equation_parts(rows, words)
            rows = mark_caption_continuations(model.reading_order(rows, page.rect.width), words)
            images = graphics(page, rows)
            if meta["text_status"] == "ocr":
                # A scan's page-sized bitmap is the paper, not one giant illustration.
                images = [
                    i
                    for i in images
                    if fitz.Rect(i["bbox"]).width * fitz.Rect(i["bbox"]).height
                    < page.rect.width * page.rect.height * 0.8
                ]
            regions = []
            if models:
                try:
                    regions = page_layout(page, models, directory)
                    rows, images = fuse_layout(rows, images, regions, page)
                    meta["layout_regions"] = regions
                except Exception:
                    warnings.append(f"第 {index + 1} 页版面分析失败，已使用启发式结果。")
            code = programs(page, raw)
            images = [
                i for i in images if not any(fitz.Rect(c["bbox"]).contains(fitz.Rect(i["bbox"])) for c in code)
            ]
            images = code + refine_regions(page, rows, images, regions)
            include_small_figure_labels(rows, images, body_size)
            rows = assign_figure_text(rows, images, words)
            if models:
                native_figure_labels(page, images)
            if models and meta["text_status"] != "ocr":
                try:
                    image_labels(page, images, models, directory, check)
                except Exception:
                    check()
                    warnings.append(f"第 {index + 1} 页部分图内文字未能识别。")
            ordered = model.reading_order(rows + images, page.rect.width)
            saw_title, saw_abstract, abstract_active = False, False, False
            for row in ordered:
                if row["type"] == "title":
                    saw_title = True
                if row["type"] == "abstract" or re.match(r"^(Abstract\b|摘要)", row["text"], re.I):
                    saw_abstract = abstract_active = True
                    row["type"] = "abstract"
                elif (
                    index == 0
                    and saw_title
                    and not saw_abstract
                    and row["type"] in {"text", "heading"}
                    and row["bbox"][3] < page.rect.height * 0.45
                ):
                    row["type"] = "author"
                elif row["type"] == "heading":
                    abstract_active = False
                elif abstract_active and row["type"] == "text":
                    row["type"] = "abstract"
                row["anchors"] = [
                    {
                        **anchor(row["bbox"], meta),
                        "first_indent": row.get("first_indent", False),
                        "paragraph_gap": row.get("paragraph_gap", False),
                    }
                ]
                all_rows.append(row)
        merged = join_paragraphs(join_captions(classify_sections(all_rows), words), words)
        blocks = []
        for row in merged:
            check()
            row["id"] = model.block_id(row["anchors"], row["text"])
            row["page"] = row["anchors"][0]["page"]
            identify_labels(row)
            parts = line_math_parts(row.get("source_lines"), row["text"], lambda a, b: model.joined(a, b, words))
            legacy = row.pop("math_parts", [])
            row["protected"] = model.protected_ranges(row["text"], legacy if parts is None else parts)
            row["extractor"] = model.EXTRACTOR_VERSION
            row.setdefault("source", "heuristic")
            row.setdefault("confidence", 0.5)
            if row["type"] in {"figure", "table", "formula", "algorithm", "code"}:
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
                        if c["type"] == "caption"
                        and c["page"] == block["page"]
                        and (
                            c["text"] == block["caption_text"]
                            or c["anchors"][0]["bbox"] == block.get("caption_bbox")
                        )
                    ),
                    None,
                )
                block["caption_id"] = caption["id"] if caption else None
        return {
            "schema_version": model.SCHEMA_VERSION,
            "extractor_version": model.EXTRACTOR_VERSION,
            "model_revision": models.revision if models else None,
            "sha256": sha,
            "pages": pages,
            "blocks": blocks,
            "capabilities": {"layout": "PP-DocLayout-S" if models else "heuristic", "ocr": bool(models)},
            "warnings": warnings
            + (["部分页面没有可提取文字层。"] if any(p["text_status"] == "needs_ocr" for p in pages) else []),
        }
