"""Keep the original transparency group scoped to the original page background.

Adding several HTML Form XObjects to a page transparency group can make Poppler
lose images while MuPDF still paints them. A normal Form around the existing
content preserves its resources/group and leaves translated text outside it.
Coordinates remain in the unchanged page's native PDF user space.
"""


def inherited(pdf, xref, key):
    for _ in range(30):
        kind, value = pdf.xref_get_key(xref, key)
        if kind != "null":
            return value
        kind, parent = pdf.xref_get_key(xref, "Parent")
        if kind != "xref":
            break
        xref = int(parent.split()[0])
    return "null"


def isolate_background(page):
    pdf = page.parent
    group = pdf.xref_get_key(page.xref, "Group")[1]
    if group == "null":
        return
    resources = inherited(pdf, page.xref, "Resources")
    media = inherited(pdf, page.xref, "MediaBox")
    content = b"\n".join(pdf.xref_stream(xref) for xref in page.get_contents())
    form = pdf.get_new_xref()
    pdf.update_object(
        form, f"<< /Type /XObject /Subtype /Form /BBox {media} /Resources {resources} /Group {group} >>"
    )
    pdf.update_stream(form, b"q\n" + content + b"\nQ")
    stream = pdf.get_new_xref()
    pdf.update_object(stream, "<<>>")
    pdf.update_stream(stream, b"q /RFOriginal Do Q")
    pdf.xref_set_key(page.xref, "Contents", f"{stream} 0 R")
    pdf.xref_set_key(page.xref, "Resources", f"<< /XObject << /RFOriginal {form} 0 R >> >>")
    pdf.xref_set_key(page.xref, "Group", "null")
