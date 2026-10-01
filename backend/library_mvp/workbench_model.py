"""Pure helpers for the ReadFlow workbench read model (no I/O, no database)."""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Iterable

# Greek letters are common in model names (π0, α-zero); keep them readable in citekeys.
GREEK = {"α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta",
         "η": "eta", "θ": "theta", "κ": "kappa", "λ": "lambda", "μ": "mu", "ν": "nu", "ξ": "xi",
         "π": "pi", "ρ": "rho", "σ": "sigma", "τ": "tau", "φ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega"}
# Title words skipped when picking the citekey's title part (Better BibTeX style).
STOPWORDS = frozenset("a an the of on in for to toward towards and with via from by at as into over under using".split())
TITLE_SPLIT = re.compile(r"[\s:,.;!?/()\[\]{}\"“”'‘’—–]+")
YEAR = re.compile(r"(?<!\d)(1[5-9]\d\d|2[01]\d\d)(?!\d)")
CITEKEY = re.compile(r"^[A-Za-z0-9_:\-.]{1,100}$")

# Bibliographic fields that name where a work appeared, in preference order.
VENUE_FIELDS = ("publicationTitle", "proceedingsTitle", "conferenceName", "bookTitle", "repository",
                "container-title", "event-title", "collection-title", "university", "institution", "publisher")
SHORT_VENUE_FIELDS = ("journalAbbreviation", "container-title-short", "shortTitle-venue")
ACRONYM = re.compile(r"\(([A-Z][A-Za-z\-]{1,15})\)")


def ascii_slug(value: str) -> str:
    """Lowercase ASCII letters and digits only; accents folded, Greek spelled out."""
    lowered = "".join(GREEK.get(char, char) for char in (value or "").lower())
    folded = unicodedata.normalize("NFKD", lowered)
    return "".join(char for char in folded if char.isascii() and char.isalnum())


def last_name(author: str) -> str:
    author = (author or "").strip()
    if "," in author:
        return author.split(",", 1)[0].strip()
    parts = author.split()
    return parts[-1] if parts else ""


def year_of(date: str) -> str:
    match = YEAR.search(date or "")
    return match.group(1) if match else ""


def first_title_word(title: str) -> str:
    for token in TITLE_SPLIT.split(title or ""):
        slug = ascii_slug(token)
        if slug and slug not in STOPWORDS:
            return slug
    return ""


def base_citekey(authors: list[str], date: str, title: str) -> str:
    name = ascii_slug(last_name(authors[0])) if authors else ""
    return (name or "anon") + year_of(date) + first_title_word(title)


def _suffix(index: int) -> str:
    return chr(ord("a") + index) if index < 26 else str(index + 1)


def assign_citekeys(entries: Iterable[tuple[str, str]], pinned: dict[str, str]) -> dict[str, str]:
    """Give every item a unique key. ``entries`` is (item_id, base key) in creation order.

    Pinned keys always win; later collisions get a, b, c… suffixes so earlier papers keep
    their key when newer ones arrive.
    """
    result = dict(pinned)
    used = set(pinned.values())
    for identity, base in entries:
        if identity in result:
            continue
        candidate, index = base, 0
        while candidate in used:
            candidate = base + _suffix(index)
            index += 1
        used.add(candidate)
        result[identity] = candidate
    return result


def valid_citekey(value: str) -> bool:
    return bool(CITEKEY.match(value))


def _source_fields(raw: Any) -> dict:
    """Return the flat field dict from a stored Zotero/CSL/Connector source record."""
    if not isinstance(raw, dict):
        return {}
    item = raw.get("item") if isinstance(raw.get("item"), dict) else raw
    data = item.get("data") if isinstance(item.get("data"), dict) else item
    return data if isinstance(data, dict) else {}


def _first_text(fields: dict, names: Iterable[str]) -> str:
    for name in names:
        value = fields.get(name)
        if isinstance(value, list):
            value = value[0] if value else ""
        if isinstance(value, str) and value.strip():
            return value.strip()[:300]
    return ""


def venue_from_source(raw: Any, *, doi: str = "", url: str = "") -> str:
    venue = _first_text(_source_fields(raw), VENUE_FIELDS)
    if venue:
        return venue
    if (doi or "").lower().startswith("10.48550/arxiv") or "arxiv.org" in (url or "").lower():
        return "arXiv"
    return ""


def short_venue(venue: str, raw: Any = None) -> str:
    """A compact label for list columns; the full venue stays available for citations."""
    short = _first_text(_source_fields(raw), SHORT_VENUE_FIELDS)
    if short:
        return short
    acronym = ACRONYM.search(venue or "")
    if acronym:
        return acronym.group(1)
    return venue or ""


def source_kind(source_id: str) -> str:
    """Map a stored import source id to a stable label the UI can translate."""
    value = (source_id or "").lower()
    if not value:
        return "pdf"
    if "connector" in value:
        return "connector"
    if "csl" in value:
        return "csl-json"
    if "zotero" in value:
        return "zotero"
    return "import"


def matches_query(row: dict, query: str) -> bool:
    """Case-insensitive substring search across the fields people actually type."""
    needle = query.casefold()
    haystack = [row["title"], row["title_translated"], row["doi"], row["venue"], row["citekey"], row["year"],
                *row["authors"], *row["tags"]]
    return any(needle in (value or "").casefold() for value in haystack)
