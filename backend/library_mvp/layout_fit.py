"""Public fitting port; compact/diagnostic baseline and coordinated balanced type."""
from .layout_legacy import attempt, css_for, legacy_fit
from .layout_balanced import balanced_fit


def fit(
    rect,
    runs,
    fonts,
    archive,
    size,
    bold=False,
    color="rgb(0,0,0)",
    label=False,
    check=lambda: None,
    density="balanced",
    plan=None,
):
    if density != "balanced" or label:
        legacy_density = "balanced" if density == "legacy-balanced" else density
        return legacy_fit(rect, runs, fonts, archive, size, bold, color, label, check, legacy_density)
    return balanced_fit(rect, runs, fonts, archive, size, bold, color, check, plan)
