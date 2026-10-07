"""Reuse page content only; the original page tree, links and annotation objects stay owned by the source."""
import json
from pathlib import Path
import pymupdf as fitz
from .paper_blocks_model import digest

VERSION = "layout-x14-1"
LISTS = ("layout_overflow", "layout_truncated", "render_fallback", "label_fallback")
COUNTS = (
    "residual_source_chars",
    "zero_width_source_chars",
    "links_reanchored",
    "link_borders_hidden",
    "links_unaffected",
    "decorations_removed",
)
MAPS = ("decorations_removed_by_type",)
FIT_REVISION = "explicit-glyph-floor-1"


def signatures(source, count, tasks, regions, density, policies=None):
    stat = Path(source).stat()
    identity = [str(Path(source).resolve()), stat.st_size, stat.st_mtime_ns]
    return [
        digest(
            [VERSION, identity, tasks[p], regions[p], density]
            + ([policies[p]] if policies and policies.get(p) else [])
        )
        for p in range(1, count + 1)
    ]


def previous(
    root,
    expected,
    *,
    pdf_name="translated-layout.pdf",
    audit_name="layout-audit.json",
    pages_name="layout-pages.json",
    version=VERSION,
):
    root = Path(root)
    try:
        value = json.loads((root / pages_name).read_text())
        audit = json.loads((root / audit_name).read_text())
        path = root / pdf_name
        if (
            value["version"] != version
            or value["file_size"] != path.stat().st_size
            or value.get("mtime_ns") != path.stat().st_mtime_ns
        ):
            return None
        pdf = fitz.open(path)
        if len(pdf) != len(expected) or len(audit["pages"]) != len(expected):
            pdf.close()
            return None
        cached_signatures = list(value["signatures"])
        if value.get("fit_revision") != FIT_REVISION:
            for index, page in enumerate(audit["pages"]):
                if any(
                    p.get("truncated") or p["text"].rstrip().endswith("…")
                    for r in page["records"]
                    if r["status"] == "placed"
                    for p in r["placements"]
                ):
                    cached_signatures[index] = None
        return pdf, cached_signatures, audit
    except (OSError, ValueError, KeyError):
        return None


def graft_content(target, source, index, graft, source_index=None, copy_group=True):
    """MuPDF's pinned 1.26.5 object graft API avoids rasterization and resource rescans.

    Copy exactly Contents/Resources/Group, never page geometry or Annots. This also
    keeps widgets, replies, named destinations and internal link page references.
    """
    mu = fitz.mupdf
    left = mu.pdf_lookup_page_obj(
        fitz._as_pdf_document(source), index if source_index is None else source_index
    )
    right = mu.pdf_lookup_page_obj(fitz._as_pdf_document(target), index)
    values = {}
    for key in ("Contents", "Resources", "Group") if copy_group else ("Contents", "Resources"):
        value = mu.pdf_dict_get_inheritable(left, mu.pdf_new_name(key))
        values[key] = mu.pdf_graft_mapped_object(graft.this, value) if value.m_internal else None
    for key, value in values.items():
        if value is None:
            mu.pdf_dict_dels(right, key)
        else:
            mu.pdf_dict_puts(right, key, value)
    target._reset_page_refs()


def start_counts(audit):
    return {
        **{key: len(audit[key]) if key in LISTS else audit[key] for key in (*LISTS, *COUNTS)},
        **{key: dict(audit[key]) for key in MAPS},
    }


def delta(audit, before):
    counts = {
        key: audit[key][before[key] :] if key in LISTS else audit[key] - before[key]
        for key in (*LISTS, *COUNTS)
    }
    return {
        **counts,
        **{
            key: {
                name: value - before[key].get(name, 0)
                for name, value in audit[key].items()
                if value != before[key].get(name, 0)
            }
            for key in MAPS
        },
    }


def add_counts(audit, stats):
    for key in LISTS:
        audit[key].extend(stats[key])
    for key in COUNTS:
        audit[key] += stats[key]
    for key in MAPS:
        for name, value in stats[key].items():
            audit[key][name] = audit[key].get(name, 0) + value
