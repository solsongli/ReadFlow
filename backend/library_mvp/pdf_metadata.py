"""Conservative metadata and first-page fallbacks; no network or full-document extraction."""
import re
from .pdf_identity import placeholder_author, filename_title, arxiv_identity
from .pdf_title_tex import normalize_title, prefer_clean_title

TOOLS = re.compile(
    r"^(?:latex\b|hyperref\b|microsoft\b|acrobat\b|adobe\b|ghostscript\b|pdftex\b|libreoffice\b|word$|"
    r"pdfcreator\b|wkhtmltopdf\b|canva$|scanner$|unknown$|anonymous$|untitled$)",
    re.I,
)


def useful(value, limit):
    if not isinstance(value, str):
        return ""
    value = value.strip()
    if (
        not value
        or len(value) > limit
        or TOOLS.search(value)
        or any(ord(c) < 32 and c not in "\n\t" for c in value)
    ):
        return ""
    return value


def pdf_metadata(metadata):
    author = metadata.get("author", "")
    author = author.strip() if isinstance(author, str) and len(author) <= 2000 else ""
    parts = re.split(r"\s*(?:;|；|、|，|\||\n|\band\b|&)\s*", author)
    if len(parts) == 1 and "," in author:
        comma = [part.strip() for part in author.split(",")]
        # Preserve "Zhang, Wei"; split unambiguous full-name lists.
        if all(len(part.split()) >= 2 for part in comma):
            parts = comma
    authors = list(
        dict.fromkeys(value for part in parts if (value := useful(part, 200)) and not placeholder_author(value))
    )[:100]
    keywords = useful(metadata.get("keywords"), 2000)
    tags = list(dict.fromkeys(value for part in re.split("[,;；、\n]", keywords) if (value := useful(part, 80))))[
        :20
    ]
    subject = useful(metadata.get("subject"), 10000)
    abstract = re.sub(r"^(?:abstract|摘要)\s*[:：]\s*", "", subject, flags=re.I)
    if abstract == subject and (len(subject) < 80 or not re.search(r"[.!?。！？](?:\s|$)", subject)):
        abstract = ""
    return {"authors": authors, "tags": tags, "abstract": abstract}


def suggest_pdf_metadata(document, filename):
    from .pdf_frontmatter import page_rows, detect_title
    from .pdf_authors import detect_authors

    metadata = document.metadata or {}
    fields = pdf_metadata(metadata)
    original_title = str(metadata.get("title") or "").strip()[:1000]
    first = document[0]
    rows = page_rows(first)
    title = detect_title(first, rows)
    title["source"] = "first_page"
    authors = (
        detect_authors(first, rows, title)
        if not fields["authors"]
        else {"values": fields["authors"], "confidence": 1.0}
    )
    if not rows and len(document) > 1:
        title = {**detect_title(document[1]), "source": "second_page"}
    if filename_title(original_title, filename) or not useful(original_title, 1000):
        fields["title"] = (
            title["value"] if title["confidence"] >= 0.85 else original_title or filename.rsplit(".", 1)[0]
        )
    else:
        fields["title"] = prefer_clean_title(original_title, title["value"], title["confidence"])
    fields["title"] = normalize_title(fields["title"])
    if not fields["authors"] and authors["confidence"] >= 0.85:
        fields["authors"] = authors["values"]
    identity = arxiv_identity(filename, first.get_text())
    if identity:
        fields.update(doi=identity["doi"], url=identity["url"], date=identity["date"])
    return {"fields": fields, "title": title, "authors": authors, "arxiv": identity}
