"""Normalize harmless scientific notation without forgiving changed quantities or prose."""
from collections import Counter
from decimal import Decimal, DecimalException
import re
import unicodedata
from .paper_blocks_inline import source_runs
from .paper_term_matching import occurs


def numeric_text(runs):
    return "".join((" " + r["text"] + " ") if r.get("kind") in {"super", "sub"} else r["text"] for r in runs)


def quantities(text):
    text = unicodedata.normalize("NFKC", text).replace("−", "-")
    words = {
        "a": 1,
        "an": 1,
        "one": 1,
        "two": 2,
        "three": 3,
        "four": 4,
        "five": 5,
        "six": 6,
        "seven": 7,
        "eight": 8,
        "nine": 9,
    }
    text = re.sub(
        r"\b(a|an|one|two|three|four|five|six|seven|eight|nine)\s+(?=billion\b|million\b|thousand\b)",
        lambda m: str(words[m[1]]) + " ",
        text,
        flags=re.I,
    )
    scale = {
        "billion": 10**9,
        "million": 10**6,
        "thousand": 1000,
        "B": 10**9,
        "M": 10**6,
        "k": 1000,
        "亿": 10**8,
        "万": 10000,
    }
    pattern = r"(?<![A-Za-z0-9_.])([-+]?\d+(?:,\d{3})*(?:\.\d+)?(?:[eE][-+]?\d+)?)(?:\+?(?:\s*)(billion\b|million\b|thousand\b|[BMk](?![a-zA-Z])|亿|万))?(\s*%)?"
    result = Counter()
    for match in re.finditer(pattern, text):
        try:
            number = Decimal(match[1].replace(",", "")) * scale.get(match[2], 1)
            # Keep scientific notation bounded; never expand an exponent into
            # millions of zeroes while checking untrusted document/model text.
            key = str(number.normalize()) + ("%" if match[3] else "")
        except DecimalException:
            key = match[0]
        result[key] += 1
    return result


def paired_numbers(block, value):
    source = numeric_text(source_runs(block))
    translated = numeric_text(value.get("runs") or [{"text": value["text"]}])
    # Repeating the same dataset/model name is not an extra measured quantity.
    # Only strip identifiers present unchanged on both sides; changed versions
    # still take part in the numeric comparison and remain review warnings.
    for name in re.findall(r"\b[A-Za-z][A-Za-z0-9]*[-_][A-Za-z0-9]*\d[A-Za-z0-9]*\b", source):
        if name in translated:
            source, translated = source.replace(name, ""), translated.replace(name, "")

    # A spaced model identifier (e.g. H 100) can legitimately become H100.
    def join_names(text, other):
        return re.sub(
            r"\b([A-Z])\s+(\d{2,})\b", lambda m: m[1] + m[2] if m[1] + m[2] in other else m[0], text
        )

    return quantities(join_names(source, translated)), quantities(join_names(translated, source))


def term_present(term, translated):
    if occurs(term["target"], translated, plural=not term.get("user")):
        return True
    if term.get("user"):
        return False
    if term.get("keep") and term["source"] == term["target"]:
        plural = re.fullmatch(r"([A-Z][A-Z0-9]{1,})s", term["source"])
        if plural and occurs(plural[1], translated):
            return True
        suffix = re.fullmatch(r"(.+)-(only|based)", term["source"])
        if suffix and occurs(suffix[1], translated):
            return bool(re.search(r"仅|只|only" if suffix[2] == "only" else r"基于|based", translated, re.I))
    return False


def prose_pair(block, translated):
    source = block["text"]
    for pattern in (r"https?://\S+", r"[A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+", r"`[^`]+`"):
        source, translated = re.sub(pattern, "", source), re.sub(pattern, "", translated)
    names = re.findall(
        r"\b(?:[A-Z][\w]+(?:-[A-Z][\w]+)+|[A-Z][a-z]+(?: [A-Z][a-z]+){1,3}|\w*[a-z][A-Z]\w*)\b", source
    )
    eligible = block["type"] == "author" or bool(re.match(r"Acknowledg", source, re.I))
    for name in names:
        if (eligible or "-" in name or re.search(r"[a-z][A-Z]", name)) and name in translated:
            source, translated = source.replace(name, ""), translated.replace(name, "")
    # Name catalogs have citations but no prose verbs; retaining dataset/person names is correct.
    if len(re.findall(r"\[\d", source)) >= 5 and not re.search(
        r"\b(is|are|was|were|we|our|has|have|can|using)\b", source, re.I
    ):
        return "", ""
    # A translated gloss can retain its English name in parentheses.
    if re.search(r"[\u3400-\u9fff]", translated):
        translated = re.sub(r"[（(][A-Za-z][A-Za-z -]+[)）]", "", translated)
    return source, translated
