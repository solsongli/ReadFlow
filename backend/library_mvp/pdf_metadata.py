"""Conservative local PDF metadata extraction; never guesses authors from page text."""
import re

TOOLS = re.compile(r'^(?:latex\b|hyperref\b|microsoft\b|acrobat\b|adobe\b|ghostscript\b|pdftex\b|libreoffice\b|word$|'
                   r'pdfcreator\b|wkhtmltopdf\b|canva$|scanner$|unknown$|anonymous$|untitled$)', re.I)


def useful(value, limit):
    if not isinstance(value, str):
        return ''
    value = value.strip()
    if not value or len(value) > limit or TOOLS.search(value) or any(ord(c) < 32 and c not in '\n\t' for c in value):
        return ''
    return value


def pdf_metadata(metadata):
    author = metadata.get('author', '')
    author = author.strip() if isinstance(author, str) and len(author) <= 2000 else ''
    parts = re.split(r'\s*(?:;|；|、|，|\||\n|\band\b|&)\s*', author)
    if len(parts) == 1 and ',' in author:
        comma = [part.strip() for part in author.split(',')]
        # Preserve "Zhang, Wei"; split unambiguous full-name lists.
        if all(len(part.split()) >= 2 for part in comma):
            parts = comma
    authors = list(dict.fromkeys(value for part in parts if (value := useful(part, 200))))[:50]
    keywords = useful(metadata.get('keywords'), 2000)
    tags = list(dict.fromkeys(value for part in re.split('[,;；、\n]', keywords)
                              if (value := useful(part, 80))))[:20]
    subject = useful(metadata.get('subject'), 10000)
    abstract = re.sub(r'^(?:abstract|摘要)\s*[:：]\s*', '', subject, flags=re.I)
    if abstract == subject and (len(subject) < 80 or not re.search(r'[.!?。！？](?:\s|$)', subject)):
        abstract = ''
    return {'authors': authors, 'tags': tags, 'abstract': abstract}
