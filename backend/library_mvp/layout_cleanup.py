"""Commit prevalidated overlays; annotations, link targets and non-text graphics remain owned by the source."""
from collections import Counter
import pymupdf as fitz
from .layout_geometry import native_lines, residual_counts
from .layout_page import isolate_background
from .layout_decorations import plan_decorations, erase_decorations
from .layout_links import plan_links, apply_links


def finish_page(page, prepared, masks, records, lines, regions, tables, images, audit):
    links = plan_links(page, lines, records, prepared)
    removed = []
    pdf = page.parent
    page_number, page_xref = page.number, page.xref
    if masks:
        original_annots = pdf.xref_get_key(page.xref, "Annots")[1]
        pdf.xref_set_key(page.xref, "Annots", "[]")
        page = pdf.reload_page(page)
        try:
            decorations = plan_decorations(page, lines, records, regions, tables, images)
            page, removed = erase_decorations(page, decorations)
            for rect in masks:
                page.add_redact_annot(rect, fill=None, cross_out=False)
            page.apply_redactions(
                images=fitz.PDF_REDACT_IMAGE_NONE,
                graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                text=fitz.PDF_REDACT_TEXT_REMOVE,
            )
            visible, zero = residual_counts(native_lines(page), masks)
            audit["residual_source_chars"] += visible
            audit["zero_width_source_chars"] += zero
            isolate_background(page)
            page = pdf.reload_page(page)
            bounds = fitz.Rect(0, 0, page.cropbox.width, page.cropbox.height)
            with fitz.open() as overlay:
                layer = overlay.new_page(width=bounds.width, height=bounds.height)
                for rect, placement in prepared:
                    layer.show_pdf_page(rect, placement["doc"], 0)
                page.show_pdf_page(bounds, overlay, 0)
        finally:
            pdf.xref_set_key(page_xref, "Annots", original_annots)
            page = pdf[page_number]
    page = apply_links(page, links)
    audit["links_reanchored"] += sum(l["status"] == "reanchored" for l in links)
    audit["link_borders_hidden"] += sum(l["status"] == "border_hidden" for l in links)
    audit["links_unaffected"] += sum(l["status"] == "unaffected" for l in links)
    audit["decorations_removed"] += len(removed)
    for key, value in Counter(r["type"] for r in removed).items():
        audit["decorations_removed_by_type"][key] = audit["decorations_removed_by_type"].get(key, 0) + value
    return page, links, removed
