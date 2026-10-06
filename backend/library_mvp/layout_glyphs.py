"""Equivalent display glyphs for unsupported combining circles; cache text stays untouched."""
from .layout_text import plain, slice_runs


def display_runs(runs):
    text = plain(runs)
    result, start = [], 0
    for index in range(len(text) - 1):
        if text[index] in "123456789" and text[index + 1] == "\u20dd":
            result.extend(slice_runs(runs, start, index))
            original = slice_runs(runs, index, index + 1)[0]
            result.append({**original, "text": chr(0x2460 + int(text[index]) - 1)})
            start = index + 2
    result.extend(slice_runs(runs, start, len(text)))
    return result
