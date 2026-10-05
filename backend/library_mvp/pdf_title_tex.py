"""Small, non-executing TeX-to-Unicode normalizer for bibliographic titles."""
from difflib import SequenceMatcher
import re
import unicodedata

COMMANDS = dict(
    zip(
        "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega".split(),
        "αβγδεζηθικλμνξοπρστυφχψω",
    )
)
COMMANDS.update(dict(zip("Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega".split(), "ΓΔΘΛΞΠΣΥΦΨΩ")))
COMMANDS.update(
    {
        "varepsilon": "ε",
        "vartheta": "ϑ",
        "varphi": "φ",
        "varpi": "ϖ",
        "varrho": "ϱ",
        "varsigma": "ς",
        "times": "×",
        "cdot": "·",
        "pm": "±",
        "mp": "∓",
        "infty": "∞",
        "leq": "≤",
        "geq": "≥",
        "neq": "≠",
        "approx": "≈",
        "to": "→",
        "rightarrow": "→",
        "leftarrow": "←",
        "leftrightarrow": "↔",
        "in": "∈",
        "notin": "∉",
        "nabla": "∇",
    }
)
SUB = str.maketrans("0123456789+-=()aehijklmnoprstuvx", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ")
SUPER = str.maketrans("0123456789+-=()in", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁱⁿ")
FORMAT = re.compile(
    r"\\(?:textbf|textit|textrm|textsf|texttt|text|emph|mathrm|mathbf|mathit|mathsf|operatorname|mbox)\s*\{([^{}]*)\}"
)


def normalize_title(value):
    value = str(value or "").replace("$", "")
    for _ in range(16):
        cleaned = FORMAT.sub(r"\1", value)
        if cleaned == value:
            break
        value = cleaned
    value = re.sub(r"\\([A-Za-z]+)", lambda m: COMMANDS.get(m[1], m[0]), value)
    # Escaped underscores are literal. Only simple scripts, never arbitrary TeX, are interpreted.
    value = re.sub(
        r"(?<!\\)([_^])(?:\{([^{}]*)\}|([A-Za-z0-9+−=()-]))",
        lambda m: (m[2] if m[2] is not None else m[3]).translate(SUB if m[1] == "_" else SUPER),
        value,
    )
    value = re.sub(r"\\([%&#_{}])", r"\1", value)
    value = value.replace(r"\(", "").replace(r"\)", "").replace(r"\[", "").replace(r"\]", "")
    return re.sub(r"\s+", " ", value).strip()


def prefer_clean_title(metadata, detected, confidence):
    original, page = normalize_title(metadata), normalize_title(detected)
    comparable = lambda text: re.sub(r"[^\w]", "", unicodedata.normalize("NFKC", text).casefold())
    if confidence < 0.85 or SequenceMatcher(None, comparable(original), comparable(page)).ratio() < 0.92:
        return original
    noise = lambda text: len(re.findall(r"[\\{}$�∗†‡]", text))
    return page if noise(page) < noise(original) else original
