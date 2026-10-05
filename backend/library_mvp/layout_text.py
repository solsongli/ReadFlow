"""Pure text allocation and escaped HTML; never interprets model-authored markup."""
import html
import re
import unicodedata

TRANSLATABLE = frozenset({"text", "title", "heading", "abstract", "list", "caption", "footnote"})


def plain(runs):
    return "".join(r.get("text", "") for r in runs)


def html_runs(runs):
    output = []
    for run in runs:
        text = html.escape(str(run.get("text", "")), quote=True).replace("\n", "<br>")
        tag = {"super": "sup", "sub": "sub"}.get(run.get("kind"))
        output.append(f"<{tag}>{text}</{tag}>" if tag else text)
    return "<div>" + "".join(output) + "</div>"


def slice_runs(runs, start, end):
    result, offset = [], 0
    for run in runs:
        text = run.get("text", "")
        piece = text[max(0, start - offset) : max(0, end - offset)]
        if piece:
            result.append({"kind": run.get("kind", "text"), "text": piece})
        offset += len(text)
    return result


def cjk(char):
    return "\u2e80" <= char <= "\u9fff" or "\uf900" <= char <= "\ufaff" or ord(char) >= 0x20000


def word_char(char):
    return not cjk(char) and (char.isalnum() or char in "_-'’" or unicodedata.category(char).startswith("M"))


def boundaries(text):
    return [
        i for i in range(1, len(text) + 1) if i == len(text) or not (word_char(text[i - 1]) and word_char(text[i]))
    ]


def allocate(runs, areas):
    text = plain(runs)
    cuts = boundaries(text)
    total = sum(max(1, a) for a in areas)
    result, start, accumulated = [], 0, 0
    for index, area in enumerate(areas):
        accumulated += max(1, area)
        target = round(len(text) * accumulated / total)
        if index == len(areas) - 1:
            end = len(text)
        else:
            choices = [i for i in cuts if i >= start]
            punctuation = [
                i
                for i in choices
                if abs(i - target) <= max(8, (target - start) * 0.2) and re.match(r"[.!?。！？;；，,\s]", text[i - 1])
            ]
            end = min(punctuation or choices or [len(text)], key=lambda i: abs(i - target))
        result.append(slice_runs(runs, start, end))
        start = end
    return result


def truncated(runs, end):
    return slice_runs(runs, 0, end) + [{"kind": "text", "text": "…"}]
