"""Line-preserving Chinese layout. Pure planning is separated from PDF writing."""
from dataclasses import dataclass
import math
import re
import statistics
import pymupdf as fitz
from .layout_geometry import free_rects

OPENING = set("（〔［｛〈《「『【(［{<")
CLOSING = set("，。、；：！？）〕］｝〉》」』】,.!?;:)]}>")
TOKEN = re.compile(
    r"\[[^\]\n]{1,48}\]|https?://\S+|[A-Za-z0-9]+(?:[-–—./][A-Za-z0-9]+)*|[^\s]",
    re.UNICODE,
)


@dataclass
class Token:
    text: str
    runs: list
    space: bool = False


def tokens_from_runs(runs):
    chars, styles = [], []
    for run in runs:
        for char in run.get("text", ""):
            chars.append(char)
            styles.append({key: value for key, value in run.items() if key != "text"})
    text = "".join(chars)
    output, cursor = [], 0
    for match in TOKEN.finditer(text):
        start, end = match.span()
        fragments = []
        for at in range(start, end):
            style = styles[at]
            if (
                fragments
                and all(fragments[-1].get(key) == value for key, value in style.items())
                and all(key == "text" or key in style for key in fragments[-1])
            ):
                fragments[-1]["text"] += chars[at]
            else:
                fragments.append({**style, "text": chars[at]})
        output.append(Token(match.group(), fragments, bool(text[cursor:start])))
        cursor = end
    return output


def legal_break(tokens, at):
    if at <= 0 or at >= len(tokens):
        return True
    return tokens[at - 1].text[-1] not in OPENING and tokens[at].text[0] not in CLOSING


def token_width(token, size, measure):
    prefix = measure(" ", size, {"kind": "text"}) if token.space else 0
    return prefix + sum(measure(run["text"], size, run) for run in token.runs)


def partitions(tokens, capacities, size, measure):
    count = min(len(tokens), len(capacities))
    if count <= 1:
        return [tokens]
    widths = [token_width(token, size, measure) for token in tokens]
    total_width, total_capacity = sum(widths), sum(capacities[:count])
    output, start, cumulative = [], 0, 0.0
    for line in range(count - 1):
        cumulative += capacities[line] / max(1, total_capacity) * total_width
        candidates = range(start + 1, len(tokens) - (count - line - 1) + 1)
        boundary = min(
            (at for at in candidates if legal_break(tokens, at)),
            key=lambda at: abs(sum(widths[:at]) - cumulative),
            default=start + 1,
        )
        output.append(tokens[start:boundary])
        start = boundary
    output.append(tokens[start:])
    return output


def plan_lines(runs, source_lines, source_size, measure):
    tokens = tokens_from_runs(runs)
    if not tokens or not source_lines:
        return {"lines": [], "font_size": source_size, "scale": 1, "overflow": False}
    capacities = [max(1, line["x1"] - line["x0"]) for line in source_lines]
    groups = partitions(tokens, capacities, source_size, measure)
    ratios = [
        capacities[index] / max(0.01, sum(token_width(token, source_size, measure) for token in group))
        for index, group in enumerate(groups)
    ]
    scale = min(1, min(ratios, default=1))
    overflow = scale < 0.7
    scale = max(0.7, scale)
    if overflow:
        extra = dict(source_lines[-1])
        spacing = (
            statistics.median([b["baseline"] - a["baseline"] for a, b in zip(source_lines, source_lines[1:])])
            if len(source_lines) > 1
            else source_size * 1.2
        )
        extra["baseline"] += spacing
        extra["y0"] += spacing
        extra["y1"] += spacing
        source_lines = [*source_lines, extra]
        capacities.append(capacities[-1])
        groups = partitions(tokens, capacities, source_size * scale, measure)
    planned = []
    for index, (line, group) in enumerate(zip(source_lines, groups)):
        size = source_size * scale
        widths = [token_width(token, size, measure) for token in group]
        available = max(1, line["x1"] - line["x0"])
        justify = index < len(groups) - 1 and len(group) > 1
        gap = max(0, (available - sum(widths)) / (len(group) - 1)) if justify else 0
        x, pieces = line["x0"], []
        for token_index, (token, width) in enumerate(zip(group, widths)):
            if token_index and token.space:
                x += measure(" ", size, {"kind": "text"})
            for run in token.runs:
                run_width = measure(run["text"], size, run)
                pieces.append({**run, "x": x, "width": run_width})
                x += run_width
            if token_index < len(group) - 1:
                x += gap
        planned.append({**line, "pieces": pieces, "fill": min(1, (x - line["x0"]) / available)})
    return {"lines": planned, "font_size": source_size * scale, "scale": scale, "overflow": overflow}


def source_line_slots(box, lines, obstacles):
    output = []
    for line in lines:
        groups, current = [], None
        for span in line.get("spans", []):
            for char in span.get("chars", []):
                rect = fitz.Rect(char["bbox"])
                center = (rect.tl + rect.br) / 2
                if not fitz.Rect(box).contains(center) or any(
                    fitz.Rect(item).contains(center) for item in obstacles
                ):
                    if current:
                        groups.append(current)
                        current = None
                    continue
                current = rect if current is None else current | rect
        if current:
            groups.append(current)
        for rect in groups:
            for available in free_rects(rect & fitz.Rect(box), obstacles):
                spans = [
                    span for span in line.get("spans", []) if fitz.Rect(span["bbox"]).intersects(available)
                ]
                baseline = statistics.median(span["origin"][1] for span in spans) if spans else available.y1
                output.append(
                    {
                        "x0": available.x0,
                        "x1": available.x1,
                        "y0": available.y0,
                        "y1": available.y1,
                        "baseline": baseline,
                    }
                )
    return sorted(output, key=lambda row: (row["baseline"], row["x0"]))


def _color(value):
    values = [int(part) for part in re.findall(r"\d+", value or "")[:3]]
    return tuple(part / 255 for part in values) if len(values) == 3 else (0, 0, 0)


def render_placement(plan, folder, color):
    lines = plan["lines"]
    bounds = fitz.Rect(
        min(line["x0"] for line in lines),
        min(line["y0"] for line in lines),
        max(line["x1"] for line in lines),
        max(line["y1"] for line in lines),
    )
    document = fitz.open()
    page = document.new_page(width=bounds.width, height=bounds.height)
    files = {"normal": folder / "normal.otf", "bold": folder / "bold.otf"}
    names = {key: "RFAligned" + key.title() for key in files}
    for key, path in files.items():
        if path.is_file():
            page.insert_font(fontname=names[key], fontfile=str(path))
    boxes = []
    for line in lines:
        for piece in line["pieces"]:
            kind = piece.get("kind", "text")
            size = plan["font_size"] * (0.66 if kind in {"super", "sub"} else 1)
            baseline = line["baseline"] - bounds.y0
            if kind == "super":
                baseline -= plan["font_size"] * 0.34
            elif kind == "sub":
                baseline += plan["font_size"] * 0.18
            weight = "bold" if piece.get("bold") and files["bold"].is_file() else "normal"
            x = piece["x"] - bounds.x0
            page.insert_text(
                (x, baseline),
                piece["text"],
                fontsize=size,
                fontname=names[weight],
                fontfile=str(files[weight]),
                color=_color(color),
                overlay=True,
            )
            boxes.append([x, baseline - size, x + piece["width"], baseline + size * 0.2])
    return bounds, {
        "doc": document,
        "scale": 1,
        "text": "".join(piece["text"] for line in lines for piece in line["pieces"]),
        "boxes": boxes,
        "fonts": list(names.values()),
        "font_size": plan["font_size"],
        "leading": 1,
        "overflow": plan["overflow"],
        "truncated": False,
        "outlier": plan["scale"] < 0.999,
        "outlier_reason": "aligned_shrink" if plan["scale"] < 0.999 else None,
        "aligned": [
            {"source_baseline": line["baseline"], "target_baseline": line["baseline"]} for line in lines
        ],
    }
