"""Figure labels have their own cache identities; numeric/scientific symbols stay untouched."""
import re
import unicodedata
from .paper_blocks_model import block_id, cache_key
from .paper_blocks_inline import rich_text

ELEMENTS = frozenset(
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Fe Cu Zn Br Ag I Au Hg Pb Sn Ti Co Ni Cr Mn Rb Cs Pd Pt".split()
)
UNITS = frozenset(
    "s ms us ns min h Hz kHz MHz GHz m cm mm nm km kg g mg mol K C F V mV A mA W kW Pa kPa MPa eV keV dB ppm rpm px dpi".split()
)


def translatable_label(text):
    value = unicodedata.normalize("NFKC", text.strip())
    if not value or len(value) > 2000:
        return False
    # A detector may join several numeric table cells to one OCR row. Such rows are
    # retained rather than placing one opaque translation box across their values.
    if len(re.findall(r"\d+(?:\.\d+)?", value)) >= 4 and sum(c.isdigit() for c in value) > sum(
        c.isalpha() for c in value
    ):
        return False
    if re.fullmatch(r"[\d\s.,%+−–—/():°×*^=<>±]+", value) or value in UNITS:
        return False
    if re.fullmatch(r"[\d.,\s±+-]*(?:" + "|".join(UNITS) + r")(?:[/²³^\d-]+)?", value):
        return False
    condensed = re.sub(r"[()\[\]{}·+−\-\s]", "", value)
    aliases = {"Me", "Et", "Pr", "Bu", "Ph", "Bn", "Boc", "Ac", "tBu", "nBu", "iPr", "R"}
    chemical = re.findall(r"(tBu|nBu|iPr|Boc|[A-Z][a-z]?)(\d*)", condensed)
    if (
        chemical
        and "".join(a + b for a, b in chemical) == condensed
        and all(a in ELEMENTS | aliases for a, _ in chemical)
    ):
        return False
    if len(value) <= 2 or re.search(r"[=∑∫√^_]|[α-ωΑ-Ω]", value):
        return False
    return bool(re.search(r"[A-Za-z]{3}|[\u4e00-\u9fff]", value))


def identify_labels(block):
    for label in block.get("figure_text", []):
        label["id"] = block_id([{"page": block["page"], "bbox": label["bbox"]}], label["text"])
        label["translatable"] = block["type"] not in {"algorithm", "code"} and translatable_label(
            label["text"]
        )


def translation_units(blocks):
    result = []
    for block in blocks:
        result.append(block)
        for label in block.get("figure_text", []):
            if label.get("translatable"):
                result.append(
                    {
                        **label,
                        "type": "figure_text",
                        "protected": [],
                        "page": block["page"],
                        "parent_id": block["id"],
                        "section": block.get("section", ""),
                    }
                )
    return result


def translated_labels(block, cache, language, fingerprint):
    return [
        {
            **label,
            "translation": rich_text(cache.get(cache_key(label, language, fingerprint)))
            if label.get("id") and label.get("translatable")
            else "",
            "qa": value.get("qa")
            if label.get("id")
            and isinstance(value := cache.get(cache_key(label, language, fingerprint)), dict)
            else None,
        }
        for label in block.get("figure_text", [])
    ]
