"""Compare saved X10 copies with X10b; all inputs stay read-only and models are never called."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont
from backend.library_mvp.paper_blocks_layout import render_layout
from .layout_corpus import audit
from .layout_typography_corpus import sheets

PAGES = (("SAM", (1, 4)), ("OpenVLA", (3,)), ("ACT", (2, 3)), ("DiffusionPolicy", (2,)))


def regular(path):
    if not path.is_file() or any(p.is_symlink() for p in [path, *path.parents]):
        raise ValueError("Input must be regular, without symlink ancestors")
    return path


def digest(path):
    with regular(path).open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def copy_inputs(source, root):
    root.mkdir(parents=True, exist_ok=True)
    if any(p.is_symlink() for p in [root, *root.parents]):
        raise ValueError("Output cannot contain symlinks")
    copied = {}
    for name in (
        "source.pdf",
        "blocks.json",
        "translations.json",
        "terms.json",
        "selection.json",
        "result.json",
    ):
        file = source / name
        if file.exists():
            copied[name] = digest(file)
            shutil.copyfile(file, root / name)
    before, after = root / "before", root / "after"
    before.mkdir(exist_ok=True)
    after.mkdir(exist_ok=True)
    if before.is_symlink() or after.is_symlink():
        raise ValueError("Output subdirectories cannot be symlinks")
    for name in ("translated-layout.pdf", "layout-audit.json"):
        file = source / "after" / name
        copied["after/" + name] = digest(file)
        shutil.copyfile(file, before / name)
    for fonts in (source / "after").glob("layout-fonts-*"):
        if fonts.is_dir() and not fonts.is_symlink():
            shutil.copytree(fonts, after / fonts.name, dirs_exist_ok=True)
    return copied


def zoom(root):
    sheet = Image.new("RGB", (3600, 1200), "#eeeeee")
    draw = ImageDraw.Draw(sheet)
    font_path = Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")
    font = ImageFont.truetype(str(font_path), 24) if font_path.is_file() else ImageFont.load_default()
    for index, name in enumerate(
        ("source.pdf", "before/translated-layout.pdf", "after/translated-layout.pdf")
    ):
        # MuPDF does not paint Link borders. Poppler exposes the visible
        # frames, so this zoom actually shows the defect and its correction.
        with tempfile.TemporaryDirectory(prefix="readflow-link-zoom-") as temporary:
            prefix = Path(temporary) / "page"
            subprocess.run(
                [
                    "pdftoppm",
                    "-f",
                    "3",
                    "-l",
                    "3",
                    "-singlefile",
                    "-r",
                    "158.4",
                    "-png",
                    str(root / name),
                    str(prefix),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=90,
            )
            with Image.open(prefix.with_suffix(".png")) as full:
                image = full.crop(tuple(round(v * 2.2) for v in (40, 210, 575, 710)))
                sheet.paste(image.convert("RGB"), (index * 1200 + 10, 55))
        draw.text(
            (index * 1200 + 10, 12),
            ("原文", "0.9.16", "0.9.17")[index] + " · ACT 第 3 页链接区域",
            fill="black",
            font=font,
        )
    sheet.save(root / "links-p3-zoom.png")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("/tmp/readflow-x10"))
    parser.add_argument("--output", type=Path, default=Path("/tmp/readflow-x10b"))
    options = parser.parse_args()
    source, output = options.input.resolve(), options.output.resolve()
    if source == output or source in output.parents:
        raise ValueError("Output must be outside the read-only input")
    results = []
    for name, pages in PAGES:
        folder, root = source / name, output / name
        checksums = copy_inputs(folder, root)
        document = json.loads((root / "blocks.json").read_text())
        cache = json.loads((root / "translations.json").read_text())
        selection = json.loads((root / "selection.json").read_text())
        (root / "after/layout-pages.json").unlink(missing_ok=True)
        outcome = render_layout(
            root / "source.pdf",
            root / "after",
            document,
            cache,
            selection["language"],
            selection["fingerprint"],
        )
        report = json.loads((root / "after/layout-audit.json").read_text())
        metrics = audit(root / "source.pdf", root / "after/translated-layout.pdf", report)
        result = {
            "name": name,
            "checksums": checksums,
            "geometry": metrics,
            **{
                key: outcome[key]
                for key in (
                    "links_reanchored",
                    "link_borders_hidden",
                    "links_unaffected",
                    "decorations_removed",
                    "decorations_removed_by_type",
                    "seconds",
                )
            },
        }
        sheets(root, name, pages, labels=("原文", "0.9.16 原版式", "0.9.17 原版式"))
        if name == "ACT":
            zoom(root)
        for file, expected in checksums.items():
            if digest(folder / file) != expected:
                raise ValueError("Read-only source changed")
        (root / "metrics.json").write_text(json.dumps(result, indent=2) + "\n")
        results.append(result)
        print(json.dumps(result), flush=True)
    (output / "summary.json").write_text(json.dumps(results, indent=2) + "\n")
    if any(
        value
        for r in results
        for key, value in r["geometry"].items()
        if key.endswith("mismatches") or key in {"glyph_overflow", "residual_source_chars", "page_mismatch"}
    ):
        raise SystemExit("Original-layout integrity check failed; inspect summary.json")


if __name__ == "__main__":
    main()
