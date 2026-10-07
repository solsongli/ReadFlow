"""Geometry-only quality checks for line-aligned PDFs."""
from collections import defaultdict
import json
from pathlib import Path
import pymupdf as fitz

FORBIDDEN_START = set("，。、；：？！）》」』”’")
MISSING = {"☒", "\ufffd"}
TYPES = {"text", "abstract", "list", "caption", "footnote"}


def _fragments(page, box):
    output = []
    for block in page.get_text("rawdict", clip=fitz.Rect(box))["blocks"]:
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if "sourcehanserif" not in span["font"].casefold():
                    continue
                for char in span.get("chars", []):
                    rect = fitz.Rect(char["bbox"])
                    output.append(
                        {
                            "text": char["c"],
                            "x0": rect.x0,
                            "x1": rect.x1,
                            "y0": rect.y0,
                            "y1": rect.y1,
                            "size": span["size"],
                            "bold": "bold" in span["font"].casefold(),
                        }
                    )
    return output


def _rows(chars):
    rows = []
    for char in sorted(chars, key=lambda value: (value["y0"], value["x0"])):
        match = next(
            (
                row
                for row in reversed(rows)
                if (
                    abs((row["y0"] + row["y1"] - char["y0"] - char["y1"]) / 2)
                    <= max(1, char["size"] * 0.35)
                    or max(0, min(row["y1"], char["y1"]) - max(row["y0"], char["y0"]))
                    / max(0.01, min(row["y1"] - row["y0"], char["y1"] - char["y0"]))
                    >= 0.45
                )
            ),
            None,
        )
        if match is None:
            rows.append({"y0": char["y0"], "y1": char["y1"], "chars": [char]})
        else:
            match["y0"] = min(match["y0"], char["y0"])
            match["y1"] = max(match["y1"], char["y1"])
            match["chars"].append(char)
    for row in rows:
        row["chars"].sort(key=lambda value: value["x0"])
    return sorted(rows, key=lambda value: value["y0"])


def _row_text(row):
    return "".join(char["text"] for char in row["chars"]).strip()


def _line_has_scatter(row):
    chars = [char for char in row["chars"] if not char["text"].isspace()]
    return any(
        right["x0"] - left["x1"] > max(left["size"], right["size"])
        for left, right in zip(chars, chars[1:])
    )


def _lead_gap(row):
    chars = [char for char in row["chars"] if not char["text"].isspace()]
    last_bold = max((index for index, char in enumerate(chars) if char["bold"]), default=-1)
    if last_bold < 0 or last_bold + 1 >= len(chars):
        return False
    left, right = chars[last_bold], chars[last_bold + 1]
    return not right["bold"] and right["x0"] - left["x1"] > max(left["size"], right["size"])


def _planned_rows(record):
    rows, loose, rich = [], [], True
    for placement in record["placements"]:
        size = placement.get("font_size", 10)
        glyphs = placement.get("glyphs")
        if not glyphs:
            rich = False
            glyphs = [
                {"bbox": box, "text": "x", "bold": False, "kind": "text"}
                for box in placement.get("glyph_boxes", [])
            ]
        grouped = defaultdict(list)
        for glyph in glyphs:
            box = glyph["bbox"]
            value = {
                "text": glyph["text"],
                "x0": box[0],
                "x1": box[2],
                "y0": box[1],
                "y1": box[3],
                "size": size * (0.66 if glyph.get("kind") in {"super", "sub"} else 1),
                "bold": glyph.get("bold", False),
            }
            if "line" in glyph:
                grouped[glyph["line"]].append(value)
            else:
                loose.append(value)
        for _, chars in sorted(grouped.items()):
            chars.sort(key=lambda value: value["x0"])
            rows.append(
                {
                    "y0": min(char["y0"] for char in chars),
                    "y1": max(char["y1"] for char in chars),
                    "chars": chars,
                }
            )
    return [*rows, *_rows(loose)], rich


def inspect_layout(root):
    root = Path(root)
    document = json.loads((root / "blocks.json").read_text())
    audit = json.loads((root / "layout-aligned-audit.json").read_text())
    blocks = {block["id"]: block for block in document["blocks"]}
    bad = defaultdict(set)
    counts = defaultdict(int)
    with fitz.open(root / "translated-aligned.pdf") as pdf:
        for page_record in audit["pages"]:
            page = pdf[page_record["page"] - 1]
            for record in page_record["records"]:
                block = blocks.get(record["id"])
                if record.get("status") != "placed" or record.get("label") or not block:
                    continue
                rows, rich = _planned_rows(record)
                for row in rows[:-1]:
                    if _line_has_scatter(row):
                        counts["scattered_lines"] += 1
                        bad[record["id"]].add("scatter")
                detail_rows = rows if rich else _rows(_fragments(page, record["bbox"]))
                for row in detail_rows:
                    text = _row_text(row)
                    if text[:1] in FORBIDDEN_START:
                        counts["forbidden_starts"] += 1
                        bad[record["id"]].add("kinsoku")
                    missing = sum(char["text"] in MISSING for char in row["chars"])
                    counts["missing_glyphs"] += missing
                    if missing:
                        bad[record["id"]].add("missing")
                    if block["id"] in audit.get("aligned_bold_leads", []) and _lead_gap(row):
                        counts["lead_gaps"] += 1
                        bad[record["id"]].add("lead_gap")
                source_size = max(0.01, block.get("text_size", block.get("size", 10)))
                ratios = [placement.get("font_size", source_size) / source_size for placement in record["placements"]]
                if ratios and min(ratios) < 0.75:
                    counts["tiny_blocks"] += 1
                    bad[record["id"]].add("tiny")
                cached_text = "".join(placement.get("text", "") for placement in record["placements"])
                hidden = sum(ord(char) < 32 and char not in "\t\r\n" for char in cached_text)
                counts["missing_glyphs"] += hidden
                if hidden:
                    bad[record["id"]].add("missing")
    for key in ("scattered_lines", "tiny_blocks", "missing_glyphs", "forbidden_starts", "lead_gaps"):
        counts[key] += 0
    return {
        **counts,
        "remaining": [
            {
                "id": block_id,
                "page": blocks[block_id]["page"],
                "type": blocks[block_id]["type"],
                "reasons": sorted(reasons),
            }
            for block_id, reasons in sorted(bad.items(), key=lambda pair: (blocks[pair[0]]["page"], pair[0]))
        ],
    }
