"""Bounded leading, without growing beyond the source font size or block rectangle."""


def balanced_leading(height, size, lines):
    if lines < 2 or size <= 0:
        return 1.05
    # Preserve the padding used for CJK ascent/descent, and a little bottom air.
    return max(1.05, min(1.5, (height / size - 0.7) / lines))
