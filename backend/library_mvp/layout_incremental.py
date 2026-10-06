"""Reuse page content only; the original page tree, links and annotation objects stay owned by the source."""
import json
from pathlib import Path
import pymupdf as fitz
from .paper_blocks_model import digest

VERSION = "layout-x10-1"
LISTS = ("layout_overflow", "layout_truncated", "render_fallback", "label_fallback")
COUNTS = ("residual_source_chars", "zero_width_source_chars")


def signatures(source, count, tasks, regions, density):
    stat = Path(source).stat()
    identity = [str(Path(source).resolve()), stat.st_size, stat.st_mtime_ns]
    return [digest([VERSION, identity, tasks[p], regions[p], density]) for p in range(1, count + 1)]


def previous(root, expected):
    root = Path(root)
    try:
        value = json.loads((root / "layout-pages.json").read_text())
        audit = json.loads((root / "layout-audit.json").read_text())
        path = root / "translated-layout.pdf"
        if (
            value["version"] != VERSION
            or value["file_size"] != path.stat().st_size
            or value.get("mtime_ns") != path.stat().st_mtime_ns
        ):
            return None
        pdf = fitz.open(path)
        if len(pdf) != len(expected) or len(audit["pages"]) != len(expected):
            pdf.close()
            return None
        return pdf, value["signatures"], audit
    except (OSError, ValueError, KeyError):
        return None


def graft_content(target, source, index, graft):
    """MuPDF's pinned 1.26.5 object graft API avoids rasterization and resource rescans.

    Copy exactly Contents/Resources/Group, never page geometry or Annots. This also
    keeps widgets, replies, named destinations and internal link page references.
    """
    mu = fitz.mupdf
    left = mu.pdf_lookup_page_obj(fitz._as_pdf_document(source), index)
    right = mu.pdf_lookup_page_obj(fitz._as_pdf_document(target), index)
    values = {}
    for key in ("Contents", "Resources", "Group"):
        value = mu.pdf_dict_get_inheritable(left, mu.pdf_new_name(key))
        values[key] = mu.pdf_graft_mapped_object(graft.this, value) if value.m_internal else None
    for key, value in values.items():
        if value is None:
            mu.pdf_dict_dels(right, key)
        else:
            mu.pdf_dict_puts(right, key, value)
    target._reset_page_refs()


def start_counts(audit):
    return {key: len(audit[key]) if key in LISTS else audit[key] for key in (*LISTS, *COUNTS)}


def delta(audit, before):
    return {
        key: audit[key][before[key] :] if key in LISTS else audit[key] - before[key]
        for key in (*LISTS, *COUNTS)
    }


def add_counts(audit, stats):
    for key in LISTS:
        audit[key].extend(stats[key])
    for key in COUNTS:
        audit[key] += stats[key]
