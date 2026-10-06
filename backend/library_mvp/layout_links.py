"""Change only link geometry/border keys. Original actions, destinations and flags survive."""
import pymupdf as fitz
from .layout_geometry import overlap
from .layout_link_text import native_label, glyph_index, anchor


def pdf_matrix(page):
    # PyMuPDF 1.26.5's transformation_matrix omits CropBox translation for
    # rotated pages. Reconstruct the native transform without changing Rotate
    # or consulting cached link rectangles after temporary page mutations.
    if not page.rotation:
        return page.transformation_matrix
    crop, media = page.cropbox, page.mediabox
    scale = page.rect.width / (crop.height if page.rotation in (90, 270) else crop.width)
    return fitz.Matrix(scale, 0, 0, -scale, -crop.x0 * scale, (media.y1 - crop.y0) * scale)


def plan_links(page, lines, records, prepared):
    links = page.get_links()
    indices, output = {}, []
    for link in links:
        rect = fitz.Rect(link["from"]) * page.derotation_matrix
        owners = [
            r
            for r in records
            if r["status"] == "placed"
            and not r.get("label")
            and any(overlap(rect, mask) > 0.2 for mask in r["redactions"])
        ]
        identity = owners[0]["id"] if len({r["id"] for r in owners}) == 1 else None
        result = {"xref": link["xref"], "source_rect": list(rect), "status": "unaffected"}
        if owners:
            source = native_label(rect, lines)
            if identity and identity not in indices:
                indices[identity] = glyph_index(prepared, identity)
            target = anchor(indices[identity], source) if identity else None
            result.update(
                status="reanchored" if target is not None else "border_hidden",
                rect=list(target) if target is not None else list(rect),
            )
        output.append(result)
    return output


def apply_links(page, records):
    pdf = page.parent
    inverse = ~pdf_matrix(page)
    for record in records:
        status, xref = record["status"], record["xref"]
        if status == "unaffected":
            continue
        if status == "reanchored":
            rect = fitz.Rect(record["rect"]) * inverse
            pdf.xref_set_key(xref, "Rect", "[" + " ".join(f"{v:.6f}" for v in rect) + "]")
            if pdf.xref_get_key(xref, "QuadPoints")[0] != "null":
                values = [rect.x0, rect.y1, rect.x1, rect.y1, rect.x0, rect.y0, rect.x1, rect.y0]
                pdf.xref_set_key(xref, "QuadPoints", "[" + " ".join(map(str, values)) + "]")
        else:
            pdf.xref_set_key(xref, "Border", "[0 0 0]")
            pdf.xref_set_key(xref, "BS", "<< /W 0 >>")
        # An old appearance uses the old rectangle. The viewer can draw
        # reanchored borders from the preserved C/BS/Border keys itself.
        pdf.xref_set_key(xref, "AP", "null")
    return pdf.reload_page(page)
