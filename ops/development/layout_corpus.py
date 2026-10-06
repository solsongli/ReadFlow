"""Serial fake layout-PDF audit. Existing corpus and block manifests are read-only."""
import argparse
from collections import Counter
import json
from pathlib import Path
import subprocess
import tempfile
import time
import pymupdf as fitz
from PIL import Image, ImageDraw
from backend.library_mvp.paper_blocks_layout import render_layout
from backend.library_mvp.paper_blocks_model import cache_key
from backend.library_mvp.layout_metrics import typography_metrics
from .reader_inline_fixtures import fake
from .layout_graphics_audit import non_text_drawings, image_signature, same_images


def signature_image(page):
    return Counter(
        (tuple(round(v, 2) for v in image["bbox"]), bytes(image["digest"]).hex())
        for image in page.get_image_info(hashes=True)
    )


def audit(source, target, report):
    metrics = {
        "pages": 0,
        "media_mismatches": 0,
        "crop_mismatches": 0,
        "rotation_mismatches": 0,
        "image_mismatches": 0,
        "drawing_mismatches": 0,
        "link_mismatches": 0,
        "annotation_mismatches": 0,
        "glyph_overflow": 0,
        "original_images": 0,
        "output_images": 0,
        "original_drawings": 0,
        "output_drawings": 0,
        "residual_source_chars": report["residual_source_chars"],
    }
    with fitz.open(source) as original, fitz.open(target) as translated:
        metrics["pages"] = len(original)
        metrics["page_mismatch"] = len(original) != len(translated)
        for left, right in zip(original, translated):
            for key in ("mediabox", "cropbox", "rotation"):
                field = {"mediabox": "media", "cropbox": "crop", "rotation": "rotation"}[key]
                metrics[field + "_mismatches"] += getattr(left, key) != getattr(right, key)
            images, clipped = image_signature(left)
            new_images, new_clipped = image_signature(right)
            # A new page-wide text Form contributes a page-wide clip without
            # painting images. If every image invocation retains its hash and
            # geometry, use the source visibility baseline instead of that clip.
            if same_images(signature_image(left), signature_image(right)):
                new_images, new_clipped = images, clipped
                metrics["raw_image_identity_pages"] = metrics.get("raw_image_identity_pages", 0) + 1
            metrics["clipped_image_records"] = metrics.get("clipped_image_records", 0) + clipped
            metrics["output_clipped_image_records"] = metrics.get("output_clipped_image_records", 0) + new_clipped
            metrics["image_mismatches"] += not same_images(images, new_images)
            metrics["original_images"] += sum(images.values())
            metrics["output_images"] += sum(new_images.values())
            drawings, glyphs = non_text_drawings(left)
            new_drawings, new_glyphs = non_text_drawings(right)
            metrics["type3_glyph_paints"] = metrics.get("type3_glyph_paints", 0) + glyphs
            metrics["output_type3_glyph_paints"] = metrics.get("output_type3_glyph_paints", 0) + new_glyphs
            metrics["drawing_mismatches"] += len(drawings) != len(new_drawings)
            metrics["original_drawings"] += len(drawings)
            metrics["output_drawings"] += len(new_drawings)
            clean_links = lambda page: [
                {k: str(v) for k, v in link.items() if k not in {"xref", "id"}} for link in page.get_links()
            ]
            metrics["link_mismatches"] += clean_links(left) != clean_links(right)
            metrics["annotation_mismatches"] += [a.type for a in left.annots()] != [a.type for a in right.annots()]
            placed = [
                placement
                for record in report["pages"][left.number]["records"]
                if record["status"] == "placed"
                for placement in record["placements"]
            ]
            fonts = {name for placement in placed for name in placement.get("fonts", [])}
            source_fonts = {
                span["font"]
                for block in left.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]
                for line in block.get("lines", [])
                for span in line["spans"]
            }
            allowed = [fitz.Rect(p["bbox"]) + (-1, -1, 1, 1) for p in placed]
            for block in right.get_text("rawdict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]:
                for line in block.get("lines", []):
                    for span in line["spans"]:
                        if span["font"] not in fonts or span["font"] in source_fonts:
                            continue
                        for char in span["chars"]:
                            if char["c"].strip() and not any(
                                box.contains(fitz.Rect(char["bbox"])) for box in allowed
                            ):
                                metrics["glyph_overflow"] += 1
    return metrics


def sheets(source, target, pages, output, labels=("Original", "Fake layout translation")):
    with tempfile.TemporaryDirectory(prefix="readflow-x7-raster-") as temporary:
        root = Path(temporary)
        for number in pages:
            sheet = Image.new("RGB", (1240, 920), "#ececec")
            draw = ImageDraw.Draw(sheet)
            for index, pdf in enumerate((source, target)):
                prefix = root / f"{number}-{index}"
                subprocess.run(
                    [
                        "pdftoppm",
                        "-f",
                        str(number),
                        "-l",
                        str(number),
                        "-singlefile",
                        "-scale-to",
                        "860",
                        "-png",
                        str(pdf),
                        str(prefix),
                    ],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=90,
                )
                with Image.open(prefix.with_suffix(".png")) as image:
                    image.thumbnail((600, 860))
                    sheet.paste(image.convert("RGB"), (10 + 620 * index, 35))
                draw.text(
                    (10 + 620 * index, 10),
                    labels[index] + f" p.{number}",
                    fill="black",
                )
            sheet.save(output / f"comparison-p{number}.png")


def worker(options):
    directory = options.output
    directory.mkdir(parents=True, exist_ok=True)
    document = fake(json.loads(options.manifest.read_text()))
    cache = {}
    for block in document["blocks"]:
        if block.get("translation"):
            cache[cache_key(block, "zh-CN", "layout-fake")] = {
                "text": block["translation"],
                "runs": block.get("translation_runs", []),
            }
        for label in block.get("figure_text", []):
            if label.get("translation"):
                cache[cache_key(label, "zh-CN", "layout-fake")] = {"text": label["translation"]}
    outcome = render_layout(options.source, directory, document, cache, "zh-CN", "layout-fake",
                            density=options.density)
    report = json.loads((directory / "layout-audit.json").read_text())
    metrics = {
        "name": options.name,
        **audit(options.source, directory / "translated-layout.pdf", report),
        "typography": typography_metrics(document, report),
        **{k: len(v) if isinstance(v, list) else v for k, v in outcome.items()},
        "translated_input_pages": len(document["pages"]),
    }
    (directory / "metrics.json").write_text(json.dumps(metrics, indent=2))
    pages = {
        "2406.09246": [1, 2, 10, 21],
        "2303.04137": [1, 2, 4, 16],
        "2304.02643": [1, 2, 5, 16],
        "SafeVLA": [1, 4, 6, 18],
        "yakubenko-halogen-lithium-10p": [1, 3, 6, 10],
    }.get(options.name)
    if pages:
        sheets(options.source, directory / "translated-layout.pdf", pages, directory)
    print(json.dumps(metrics), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("/tmp/readflow-x7/corpus"))
    parser.add_argument("--blocks-root", type=Path, default=Path("/tmp/readflow-x5/after"))
    parser.add_argument("--source", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--name")
    parser.add_argument("--density", choices=("balanced", "compact"), default="balanced")
    parser.add_argument("--only", help="Comma-separated subset; omit only for the final full corpus pass")
    options = parser.parse_args()
    if options.source:
        return worker(options)
    import sys

    options.output.mkdir(parents=True, exist_ok=True)
    records = []
    for metrics_file in sorted(options.blocks_root.glob("*/metrics.json")):
        previous = json.loads(metrics_file.read_text())
        source = Path(previous["source"])
        if any(p.is_symlink() for p in [source, *source.parents]):
            raise ValueError("Corpus source is not a regular file")
        name = metrics_file.parent.name
        if options.only and name not in options.only.split(","):
            continue
        dest = options.output / name
        dest.mkdir(exist_ok=True)
        with (dest / "worker.log").open("w") as log:
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "ops.development.layout_corpus",
                    "--source",
                    str(source),
                    "--manifest",
                    str(metrics_file.parent / "blocks.json"),
                    "--name",
                    name,
                    "--output",
                    str(dest),
                    "--density", options.density,
                ],
                stdout=log,
                stderr=log,
                timeout=600,
            )
        if result.returncode:
            records.append({"name": name, "error": result.returncode})
        else:
            records.append(json.loads((dest / "metrics.json").read_text()))
        print(json.dumps(records[-1]), flush=True)
        (options.output / "summary.json").write_text(json.dumps(records, indent=2))
    if any(
        r.get("error")
        or any(
            r.get(key)
            for key in (
                "page_mismatch",
                "media_mismatches",
                "crop_mismatches",
                "rotation_mismatches",
                "image_mismatches",
                "drawing_mismatches",
                "link_mismatches",
                "annotation_mismatches",
                "glyph_overflow",
                "residual_source_chars",
            )
        )
        for r in records
    ):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
