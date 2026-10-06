"""Offline, conservative block checks. Warnings are review aids, not quality guarantees."""
from collections import Counter
import re
import unicodedata
from .paper_terms import occurs, relevant
from .paper_markers import has_markers
from .paper_quality_text import quantities, paired_numbers, term_present, prose_pair


def citations(text):
    return Counter(re.sub(r"\s+", "", m) for m in re.findall(r"\[\s*\d+(?:\s*[,;–—-]\s*\d+)*\s*\]", text))


def numbers(text):
    return quantities(text)


def checks(block, value, language="zh-CN", terms=()):
    if value is None:
        return ["placeholders"]
    source, translated = block["text"], value["text"]
    issues = ["internal_markers"] if value.get("marker_issues") or has_markers(value) else []
    if citations(source) != citations(translated):
        issues.append("citations")
    before, after = paired_numbers(block, value)
    if before != after:
        issues.append("numbers")
    for term in relevant(terms, [block]):
        if not term_present(term, translated):
            issues.append("terminology")
            break
    if language != "zh-CN":
        return issues
    source, translated = prose_pair(block, translated)
    for part in block.get("protected", []):
        source = source.replace(part["text"], "")
        translated = translated.replace(part["text"], "")
    for term in terms:
        if term["source"] in block.get("first_terms", []) and term["target"] in translated:
            translated = re.sub(
                r"[（(]\s*" + re.escape(term["source"]) + r"\s*[)）]", "", translated, flags=re.I
            )
        if term.get("keep") or term["source"] == term["target"]:
            source = re.sub(re.escape(term["source"]), "", source, flags=re.I)
            translated = re.sub(re.escape(term["target"]), "", translated, flags=re.I)
    source = re.sub(r"https?://\S+|`[^`]+`", "", source)
    translated = re.sub(r"https?://\S+|`[^`]+`", "", translated)
    latin = len(re.findall(r"[A-Za-z]", translated))
    chinese = len(re.findall(r"[\u3400-\u9fff]", translated))
    if len(re.findall(r"[A-Za-z]", source)) > 15 and latin > 15 and latin / max(1, latin + chinese) > 0.65:
        issues.append("untranslated")
    if len(source.strip()) >= 60 and not 0.12 <= len(translated.strip()) / len(source.strip()) <= 2.4:
        issues.append("length")
    return issues


def summary(values):
    quality = [v["qa"] for v in values if isinstance(v, dict) and isinstance(v.get("qa"), dict)]
    return {
        "checked": len(quality),
        "retried": sum(bool(q.get("retried")) for q in quality),
        "needs_review": sum(bool(q.get("issues")) for q in quality),
    }
