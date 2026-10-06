"""Whole-word scientific terms with limited inflections; no substring match inside another word."""
import re
from .paper_text_normalization import expand_ligatures

ORDINARY = frozenset(
    (
        "the a an and of in for to with on our this we is are as by from that these using "
        "action chunking bimanual appendix abstract introduction conclusion conclusions experiments experiment "
        "ablation ablations acknowledgement acknowledgements references results discussion method methods "
        "supplementary additional related work approach evaluation training test testing learning problem "
        "limitations implementation figure table robot robots manipulation policy policies"
    ).split()
)
FRAGMENTS = frozenset(
    "ne rst nal nally nd xed eld elds ow ows oor cient ciently ect ective erent erence tion tions".split()
)


def fragment(source):
    words = re.findall(r"[A-Za-z]+", expand_ligatures(source))
    return bool(words and any(w.islower() and w in FRAGMENTS for w in words))


def automatic_term_valid(row):
    source = expand_ligatures(row.get("source", "")).strip()
    if fragment(source):
        return False
    if row.get("kind") == "name" and (
        source.casefold() in ORDINARY or re.fullmatch(r"[IVX]+(?:-[A-Z])?", source)
    ):
        return False
    return True


def term_pattern(term, plural=True):
    source = expand_ligatures(term).strip()
    # Chinese has no whitespace word delimiters; surrounding Latin words still have boundaries.
    if re.search(r"[\u3400-\u9fff]", source):
        return re.compile(re.escape(source), re.I)
    parts = re.split(r"[\s‐‑–—-]+", source)
    last = parts.pop() if parts else ""
    if not plural:
        body = r"[\s‐‑–—-]+".join(map(re.escape, [*parts, last]))
        return re.compile(r"(?<![A-Za-z0-9_])" + body + r"(?![A-Za-z0-9_])", re.I)
    if re.search(r"[^aeiou]ies$", last, re.I):
        last = last[:-3] + "y"
    elif len(last) > 3 and last.lower().endswith("s") and not last.lower().endswith(("ss", "us", "is")):
        last = last[:-1]
    base = re.escape(last)
    if re.search(r"[^aeiou]y$", last, re.I):
        ending = re.escape(last[:-1]) + r"(?:y|ies)"
    elif re.search(r"(?:ss|x|z|ch|sh)$", last, re.I):
        ending = base + "(?:es)?"
    else:
        ending = base + "s?"
    body = r"[\s‐‑–—-]+".join([*(re.escape(p) for p in parts), ending])
    return re.compile(r"(?<![A-Za-z0-9_])" + body + r"(?![A-Za-z0-9_])", re.I)


def occurs(term, text, plural=True):
    return bool(term and term_pattern(term, plural).search(expand_ligatures(text)))
