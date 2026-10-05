"""Linear font-stream interning avoids whole-document quadratic stream comparisons."""
import hashlib
import re
import pymupdf as fitz


def save_pdf(pdf, path, check=lambda: None):
    streams = {}
    native = fitz._as_pdf_document(pdf)
    for xref in range(1, pdf.xref_length()):
        if xref % 256 == 0:
            check()
        try:
            entry = fitz.mupdf.ll_pdf_get_xref_entry(native.m_internal, xref)
            if entry.type not in {"n", "o"}:
                continue
            kind = pdf.xref_get_key(xref, "Type")[1]
        except Exception:
            # Sparse PDFs may contain free xref slots. This optional interning
            # step must not attempt to load them; the native saver compacts them.
            continue
        if kind not in {"/Font", "/FontDescriptor"}:
            continue
        for key in ("FontFile", "FontFile2", "FontFile3", "ToUnicode", "CIDToGIDMap"):
            typ, value = pdf.xref_get_key(xref, key)
            if typ != "xref":
                continue
            source = int(value.split()[0])
            if not pdf.xref_is_stream(source):
                continue
            data = pdf.xref_stream_raw(source)
            dictionary = re.sub(r"/Length\s+\d+\b(?!\s+\d+\s+R)", "", pdf.xref_object(source))
            identity = (dictionary, hashlib.sha256(data).digest())
            old = streams.setdefault(identity, source)
            if old != source:
                pdf.xref_set_key(xref, key, f"{old} 0 R")
    check()
    # Redaction already sanitizes edited streams; unchanged streams stay verbatim.
    # Compact unreachable objects only. MuPDF's global level 3/4 duplicate search
    # is quadratic; shared font streams are already interned above in linear time.
    pdf.save(path, garbage=2, deflate=True, clean=False)
