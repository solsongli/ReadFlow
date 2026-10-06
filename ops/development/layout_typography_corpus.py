"""Read-only saved-translation typography comparison; only explicitly allowed inputs.

PYTHONPATH=. <bundled-python> -m ops.development.layout_typography_corpus
  --library-root <research-library> --output /tmp/readflow-x10 --reuse-baseline

No extraction, model requests, credentials, or writes to the source library.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont
from backend.library_mvp.layout_metrics import typography_metrics
from backend.library_mvp.paper_blocks_layout import render_layout
from .layout_corpus import audit

INPUTS = ("blocks.json", "translations.json", "terms.json", "result.json", "selection.json")
PAPERS = {"c6ca524e": ("SAM", [1, 4]), "353c37df": ("OpenVLA", [3]), "2e2fe258": ("ACT", [2, 3])}


def regular(path):
    if not path.is_file() or any(p.is_symlink() for p in [path, *path.parents]):
        raise ValueError("Expected a regular source file without symlinks")
    return path


def file_hash(path):
    with regular(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def copy_inputs(library, output):
    selected = []
    for folder in sorted((library / "paper-blocks").iterdir()):
        if not folder.is_dir() or folder.is_symlink() or not (folder / "blocks.json").is_file():
            continue
        document = json.loads(regular(folder / "blocks.json").read_text())
        entry = next((v for k, v in PAPERS.items() if folder.name.startswith(k)), None)
        title = " ".join(b["text"] for b in document["blocks"] if b["type"] == "title").casefold()
        if not entry and "diffusion policy" in title:
            entry = ("DiffusionPolicy", [2])
        if not entry:
            continue
        name, pages = entry
        dest = output / name
        dest.mkdir(parents=True, exist_ok=True)
        if any(p.is_symlink() for p in [dest, *dest.parents]):
            raise ValueError("Output must not traverse symbolic links")
        checks = {}
        for filename in INPUTS:
            source = folder / filename
            if not source.exists():
                continue
            content = regular(source).read_bytes()
            checks[filename] = hashlib.sha256(content).hexdigest()
            (dest / filename).write_bytes(content)
        pdf = regular(library / "blobs" / folder.name[:2] / (folder.name + ".pdf"))
        if pdf.resolve() == (dest / "source.pdf").resolve():
            raise ValueError("Output must be separate from the source library")
        pdf_hash = file_hash(pdf)
        target = dest / "source.pdf"
        if not target.is_file() or file_hash(target) != pdf_hash:
            shutil.copyfile(pdf, target)
        selected.append(
            {"name": name, "sha256": folder.name, "pages": pages, "checksums": checks, "pdf_sha256": pdf_hash}
        )
    return selected


def sheets(root, name, pages):
    font_path = Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")
    font = ImageFont.truetype(str(font_path), 18) if font_path.is_file() else ImageFont.load_default()
    with tempfile.TemporaryDirectory(prefix="readflow-type-pages-") as temporary:
        for number in pages:
            sheet = Image.new("RGB", (1800, 1000), "#eeeeee")
            draw = ImageDraw.Draw(sheet)
            files = [
                root / "source.pdf",
                root / "before/translated-layout.pdf",
                root / "after/translated-layout.pdf",
            ]
            for index, pdf in enumerate(files):
                prefix = Path(temporary) / f"{number}-{index}"
                subprocess.run(
                    [
                        "pdftoppm",
                        "-f",
                        str(number),
                        "-l",
                        str(number),
                        "-singlefile",
                        "-scale-to",
                        "940",
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
                    image.thumbnail((580, 950))
                    sheet.paste(image.convert("RGB"), (index * 600 + 10, 40))
                label = ("原文页", "旧版原版式 0.9.15", "新版原版式 0.9.16")[index]
                draw.text((index * 600 + 10, 10), f"{label} · {name} p.{number}", font=font, fill="black")
            sheet.save(root / f"comparison-p{number}.png")


def evaluate(root, reuse):
    document = json.loads((root / "blocks.json").read_text())
    cache = json.loads((root / "translations.json").read_text())
    selection = json.loads((root / "selection.json").read_text())
    metrics = {}
    for name, density in (("before", "legacy-balanced"), ("after", "balanced")):
        dest = root / name
        dest.mkdir(exist_ok=True)
        if not (reuse and (dest / "translated-layout.pdf").is_file()):
            render_layout(
                root / "source.pdf",
                dest,
                document,
                cache,
                selection["language"],
                selection["fingerprint"],
                density=density,
            )
        report = json.loads((dest / "layout-audit.json").read_text())
        metrics[name] = {
            **typography_metrics(document, report),
            "seconds": report["seconds"],
            "geometry": audit(root / "source.pdf", dest / "translated-layout.pdf", report),
            "render_fallback": len(report["render_fallback"]),
            "layout_truncated": len(report["layout_truncated"]),
        }
    return metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("/tmp/readflow-x10"))
    parser.add_argument(
        "--reuse-baseline", action="store_true", help="Reuse PDFs already generated under output"
    )
    options = parser.parse_args()
    library, output = options.library_root.resolve(), options.output.resolve()
    if output == library or library in output.parents:
        raise ValueError("Output must be outside the read-only library")
    records = copy_inputs(library, output)
    summary = []
    for record in records:
        root = output / record["name"]
        metrics = evaluate(root, options.reuse_baseline)
        summary.append({"name": record["name"], **metrics})
        sheets(root, record["name"], record["pages"])
        for name, expected in record["checksums"].items():
            source = library / "paper-blocks" / record["sha256"] / name
            if hashlib.sha256(regular(source).read_bytes()).hexdigest() != expected:
                raise ValueError("Read-only source changed during comparison")
        pdf = library / "blobs" / record["sha256"][:2] / (record["sha256"] + ".pdf")
        if file_hash(pdf) != record["pdf_sha256"]:
            raise ValueError("Read-only PDF changed during comparison")
        print(json.dumps(summary[-1]), flush=True)
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    (output / "source-checksums.json").write_text(json.dumps(records, indent=2) + "\n")


if __name__ == "__main__":
    main()
