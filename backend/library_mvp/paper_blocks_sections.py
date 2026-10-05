"""Bound bibliography spans with PDF outline, typography, entry patterns and model evidence."""
import re
import unicodedata
from .paper_blocks_model import REFERENCE, APPENDIX
from .paper_blocks_text import merge
from .paper_blocks_typography import family, prose_font

IGNORED = frozenset({"header", "footer", "footnote", "figure", "table", "formula", "caption"})
ALPHA = re.compile(r"^[A-Z](?:\.\d+)*(?:\.?\s+)(?=[A-Z\u4e00-\u9fff])")
PREFIX = re.compile(r"^(?:\d+(?:\.\d+)*|[A-Z](?:\.\d+)*)\.?\s+")


def canonical(value):
    value = PREFIX.sub("", unicodedata.normalize("NFKC", value).strip())
    return re.sub(r"[^\w]", "", value).casefold()


def reference_entry(value):
    if re.match(r"^\s*\[\s*\d+[a-z]?\s*\]", value):
        return True
    year = re.search(r"\b(?:18|19|20)\d{2}[a-z]?\b", value)
    author = re.match(
        r"^(?:\d+\.\s*)?(?:[A-ZÀ-ÖØ-Þ][\w’'-]+(?:\s+[A-Z][\w’'-]+){0,3},\s*[A-Z]|[A-Z]\.\s*[A-Z][a-z]+)", value
    )
    chinese_author = re.match(r"^[\u4e00-\u9fff]{2,5}(?:[,，、][\u4e00-\u9fff]{2,5})*[.．，,]", value)
    return bool(year and (author or chinese_author))


def tag_outline(rows, page_number, outline, words):
    """Match the actual heading text: some PDF named destinations report inverted Y values."""
    for level, title, page, *_ in outline:
        if page != page_number:
            continue
        target = canonical(title)
        if not target:
            continue
        for row in sorted(list(rows), key=lambda r: r["type"] != "heading"):
            if row not in rows or row["type"] in IGNORED:
                continue
            group = [row]
            if canonical(row["text"]) != target:
                following = rows[rows.index(row) + 1 : rows.index(row) + 3]
                for other in following:
                    if other["type"] in IGNORED or not prose_font(row, other):
                        break
                    if abs(other["bbox"][0] - row["bbox"][0]) > row["size"] * 2:
                        break
                    if not -row["size"] * 0.3 <= other["bbox"][1] - group[-1]["bbox"][3] < row["size"]:
                        break
                    group.append(other)
                    if canonical(" ".join(r["text"] for r in group)) == target:
                        break
            if canonical(" ".join(r["text"] for r in group)) != target:
                continue
            for other in group[1:]:
                merge(row, other, words)
                rows.remove(other)
            row.update(type="heading", heading_level=max(1, min(6, level)), outline_title=title)
            break
    return rows


def heading_signal(row, styles):
    value = row["text"].strip()
    if APPENDIX.match(value):
        return "appendix"
    if reference_entry(value) or len(value) > 240:
        return None
    if ALPHA.match(value) and (row.get("bold") or row["type"] == "heading"):
        return "appendix"
    if row["type"] == "heading" and any(
        family(row.get("font")) == font
        and row.get("bold", False) == bold
        and abs(row.get("size", 0) - size) < max(0.5, size * 0.08)
        for font, size, bold in styles
    ):
        return "heading_style"
    return None


def classify_sections(rows):
    active, pending, styles = False, [], []
    originals = {id(row): row["type"] for row in rows}
    for row in rows:
        if row["type"] in IGNORED:
            continue
        value = row["text"].strip()
        if REFERENCE.match(value):
            active, pending = True, []
            styles.append((family(row.get("font")), row.get("size", 0), row.get("bold", False)))
            row["type"] = "reference"
            row["heading_level"] = row.get("heading_level", 1)
            continue
        if not active:
            if row["type"] == "heading":
                styles.append((family(row.get("font")), row.get("size", 0), row.get("bold", False)))
            continue
        reason = "outline" if row.get("outline_title") else heading_signal(row, styles)
        prediction = row.get("layout_type")
        strong_reference = prediction == "reference" and row.get("layout_confidence", 0) >= 0.85
        if reason == "heading_style" and strong_reference:
            reason = None
        if reason:
            # Pending fragments immediately before a confirmed heading still belong to the bibliography.
            active, pending = False, []
            row.update(type="heading", reference_end_reason=reason)
            if "heading_level" not in row:
                prefix = re.match(r"^[A-Z](?:\.\d+)*", value)
                row["heading_level"] = 1 + prefix.group().count(".") if prefix else 1
            continue
        if reference_entry(value) or strong_reference:
            pending = []
        else:
            pending.append(row)
        row["type"] = "reference"
        # Do not infer an endless bibliography from one References heading. Model text votes
        # support the same fallback, but cannot override actual [n]/author-year entries.
        required = 2 if pending and all(r.get("layout_type") == "text" for r in pending) else 3
        if len(pending) >= required:
            for candidate in pending:
                candidate["type"] = originals[id(candidate)]
            pending[0]["reference_end_reason"] = "non_reference_run"
            active, pending = False, []
    return rows
