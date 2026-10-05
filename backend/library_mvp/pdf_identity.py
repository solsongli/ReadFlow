"""Offline bibliographic identifiers and conservative placeholder detection."""
from pathlib import PurePosixPath
import re
import unicodedata

MODERN = r"(?:\d{2})(?:0[1-9]|1[0-2])\.\d{4,5}"
LEGACY = r"[a-z][a-z.-]+/\d{2}(?:0[1-9]|1[0-2])\d{3}"
ARXIV = re.compile(r"(?<![A-Za-z0-9.])(" + MODERN + "|" + LEGACY + r")(?:v\d+)?(?![\d.])", re.I)
PLACEHOLDER = re.compile(
    r"^(?:anonymous(?:\s+(?:submission|authors?|paper))?|authors?|unknown|submission|"
    r"paper\s*id|blind\s*review|double\s*blind(?:\s*submission)?)(?:\s*[:#-]?\s*\d+)?$",
    re.I,
)


def placeholder_author(value):
    return not value or bool(PLACEHOLDER.fullmatch(re.sub(r"[_-]", " ", str(value)).strip()))


def filename_title(value, filename=""):
    value = unicodedata.normalize("NFKC", str(value or "")).strip()
    stem = PurePosixPath(filename.replace("\\", "/")).stem
    clean = lambda v: re.sub(r"[\s_\-.]", "", v).casefold()
    if not value or stem and clean(value.removesuffix(".pdf")) == clean(stem):
        return True
    if ARXIV.fullmatch(value.removesuffix(".pdf")) or re.match(
        r"^(?:doi:|https?://doi\.org/)?10\.\d{4,9}/", value, re.I
    ):
        return True
    return bool(
        re.fullmatch(
            r"(?:paper|document|untitled|main|manuscript|submission|output|final|draft|fulltext)"
            r"(?:[ _-]?\d+)?(?:\.pdf)?",
            value,
            re.I,
        )
    )


def arxiv_identity(filename, page_text):
    explicit = list(
        re.finditer(
            r"(?:arxiv\s*:\s*|arxiv\.org/(?:abs|pdf)/|10\.48550/arxiv\.)(" + MODERN + "|" + LEGACY + r")(?:v\d+)?",
            page_text,
            re.I,
        )
    )
    ids = {match[1].lower() for match in explicit}
    match = ARXIV.search(PurePosixPath(filename.replace("\\", "/")).stem)
    identity = next(iter(ids)) if len(ids) == 1 else match[1].lower() if match and not ids else None
    if identity is None:
        return None
    number = identity.split("/")[-1]
    yy = int(number[:2])
    year = 1900 + yy if "/" in identity and yy >= 90 else 2000 + yy
    return {
        "id": identity,
        "doi": "10.48550/arXiv." + identity,
        "url": "https://arxiv.org/abs/" + identity,
        "venue": "arXiv",
        "date": str(year),
        "date_source": "identifier",
    }
