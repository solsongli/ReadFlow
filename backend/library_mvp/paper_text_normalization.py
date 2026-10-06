"""Expand presentation ligatures, never flatten mathematical superscripts or change geometry."""
import unicodedata
from types import MappingProxyType

LIGATURES = MappingProxyType(
    str.maketrans(
        {chr(c): unicodedata.normalize("NFKC", chr(c)) for c in (*range(0xFB00, 0xFB07), 0x0132, 0x0133)}
    )
)
TEXT_KEYS = frozenset({"text", "lead", "source_start", "source_end", "outline_title", "caption_text"})


def expand_ligatures(text):
    return text.translate(LIGATURES) if isinstance(text, str) else text


def normalized_document(value):
    """Existing IDs remain stable. Rebase protected offsets when a glyph expands to several letters."""
    if isinstance(value, list):
        return [normalized_document(v) for v in value]
    if not isinstance(value, dict):
        return value
    original = value.get("text")
    result = {k: expand_ligatures(v) if k in TEXT_KEYS else normalized_document(v) for k, v in value.items()}
    if isinstance(original, str) and original != result["text"]:
        for key in ("protected", "math_parts"):
            for old, new in zip(value.get(key, []), result.get(key, [])):
                if isinstance(old, dict) and type(old.get("start")) is int and type(old.get("end")) is int:
                    new["start"] = len(expand_ligatures(original[: old["start"]]))
                    new["end"] = len(expand_ligatures(original[: old["end"]]))
    return result
