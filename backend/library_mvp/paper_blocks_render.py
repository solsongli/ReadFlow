"""Data-only Typst template and escaped XeLaTeX export; never evaluates PDF/model text as source."""
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import zipfile
import pymupdf as fitz
from .paper_blocks_model import cache_key, REFERENCE
from .paper_blocks_inline import rich_text, source_runs
from .paper_blocks_storage import write_json
from .store import StoreError

TEMPLATE = r"""
#set page(paper: "a4", margin: (x: 22mm, y: 20mm), numbering: "1")
#let doc = json("render-data.json")
#set text(font: ("Source Han Serif SC", "Noto Serif CJK SC"), size: 10.5pt, lang: doc.language.split("-").first())
#set par(justify: true, leading: 0.75em)
#let rich(runs) = {
  for r in runs {
    if r.kind == "super" { super(r.text) }
    else if r.kind == "sub" { sub(r.text) }
    else { r.text }
  }
}
#for b in doc.blocks {
  let content = rich(b.runs)
  if b.kind == "title" {
    align(center, text(size: 19pt, weight: "bold", content)); v(0.7em)
  } else if b.kind == "author" {
    align(center, text(size: 10pt, content)); v(0.5em)
  } else if b.kind == "heading" {
    heading(level: 1, numbering: none, text(size: 12pt, weight: "bold", content))
  } else if b.asset != none {
    block(width: 100%, breakable: false, {
      align(center, image(b.asset, width: b.width * 1mm))
      if b.text != "" { v(0.25em); block(text(size: 9pt, content)) }
    })
    v(0.6em)
  } else if b.kind == "caption" or b.kind == "footnote" {
    block(text(size: 9pt, content)); v(0.35em)
  } else {
    block(content); v(0.45em)
  }
}
"""


def runtime_paths():
    binary = os.environ.get("READFLOW_TYPST_BIN") or os.environ.get("TYPST_BIN") or shutil.which("typst")
    fonts = os.environ.get("READFLOW_FONT_DIRS") or os.environ.get("RETAIN_PDF_TYPST_FONT_DIRS", "")
    packages = os.environ.get("READFLOW_TYPST_PACKAGES") or os.environ.get("TYPST_PACKAGE_PATH", "")
    if not binary:
        repo = Path(__file__).resolve().parents[2]
        for relative in (
            "frontend/desktop/dist-readflow/linux-unpacked/resources/backend",
            "frontend/desktop/linux/linux-unpacked/resources/backend",
        ):
            bundled = repo / relative
            if (bundled / "typst/bin/typst").is_file():
                binary, fonts, packages = (
                    str(bundled / "typst/bin/typst"),
                    str(bundled / "fonts"),
                    str(bundled / "typst-packages"),
                )
                break
    if not binary or not Path(binary).is_file():
        raise StoreError("renderer_unavailable", "内置 Typst 不可用，请检查应用资源路径。", 503)
    return binary, fonts, packages


def render(root, document, cache, language, fingerprint, check=lambda: None):
    binary, fonts, packages = runtime_paths()
    blocks, captions, warnings = [], {b["id"]: b for b in document["blocks"]}, []
    used = {b.get("caption_id") for b in document["blocks"] if b.get("asset")}
    for block in document["blocks"]:
        if block["type"] in ("header", "footer") or block["id"] in used:
            continue
        check()
        value = cache.get(cache_key(block, language, fingerprint), block["text"])
        rich_block = block
        asset, display_width = None, 120
        if block.get("asset"):
            try:
                # The bundled Typst 0.15.1 accepts single-page PDF images directly.
                with fitz.open(root / block["asset"]) as crop:
                    size = crop[0].rect
                    display_width = min(
                        166,
                        145 * size.width / max(1, size.height),
                        size.width * 25.4 / 72 * (1.05 if block["type"] == "formula" else 1.4),
                    )
                asset = block["asset"]
                caption = captions.get(block.get("caption_id"))
                if caption:
                    rich_block = caption
                    value = cache.get(cache_key(caption, language, fingerprint), caption["text"])
                else:
                    value = ""  # Formula text and figure labels are already present in the vector crop.
            except Exception:
                warnings.append(block["id"])
                value = block["text"] or block.get("caption_text") or "图形未能渲染，请查看原文。"
        blocks.append(
            {
                "id": block["id"],
                "kind": "heading" if REFERENCE.match(block["text"]) else block["type"],
                "text": rich_text(value),
                "runs": value.get("runs", []) if isinstance(value, dict) else source_runs(rich_block, value),
                "asset": asset,
                "width": display_width,
                "original": block["text"] or block.get("caption_text", ""),
            }
        )
    write_json(root / "render-data.json", {"blocks": blocks, "language": language})
    (root / "main.typ").write_text(TEMPLATE)
    env = {key: val for key, val in os.environ.items() if key in ("PATH", "LANG", "SYSTEMROOT", "TMPDIR")}
    env["RAYON_NUM_THREADS"] = "2"
    if packages:
        env["TYPST_PACKAGE_PATH"] = packages
        env["TYPST_PACKAGE_CACHE_PATH"] = packages
    command = [binary, "compile", "--root", str(root), "--ignore-system-fonts"]
    for directory in fonts.split(os.pathsep):
        if directory:
            command.extend(["--font-path", directory])
    command += [str(root / "main.typ"), str(root / "render-pending.pdf")]
    deadline = time.monotonic() + 90
    for _ in range(len(blocks) * 2 + 1):
        check()
        process = subprocess.Popen(command, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            while True:
                try:
                    _, error = process.communicate(timeout=0.2)
                    break
                except subprocess.TimeoutExpired:
                    check()
                    if time.monotonic() > deadline:
                        raise StoreError("render_timeout", "排版超时，已保留块译文，请重试。")
            if process.returncode == 0:
                break
            # Typst identifies the asset path in errors; remove only the failing asset, never interpolate text.
            failed = next((b for b in blocks if b["asset"] and b["asset"].encode() in error), None)
            if failed is None:
                raise StoreError("render_failed", "译文排版失败，已保留块译文，可导出工程或重试。")
            # If an individual PDF image is unsupported, try vector SVG once before using source text.
            converted = False
            if failed["asset"].endswith(".pdf"):
                try:
                    with fitz.open(root / failed["asset"]) as crop:
                        svg = crop[0].get_svg_image(text_as_path=True)
                    name = failed["id"] + ".svg"
                    (root / name).write_text(svg)
                    failed["asset"] = name
                    converted = True
                except Exception:
                    pass
            if not converted:
                warnings.append(failed["id"])
                failed.update(text=failed["original"], runs=[{"kind": "text", "text": failed["original"]}], asset=None)
            write_json(root / "render-data.json", {"blocks": blocks, "language": language})
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate()
    check()
    (root / "render-pending.pdf").replace(root / "translated.pdf")
    return warnings


def latex_escape(value):
    replacements = {
        "\\": r"\textbackslash{}",
        "{": r"\{",
        "}": r"\}",
        "$": r"\$",
        "#": r"\#",
        "%": r"\%",
        "&": r"\&",
        "_": r"\_",
        "^": r"\textasciicircum{}",
        "~": r"\textasciitilde{}",
    }
    return "".join(replacements.get(char, char) for char in value)


def latex_zip(root, document, cache, language, fingerprint):
    lines = [
        r"\documentclass[11pt,a4paper]{article}",
        r"\usepackage{xeCJK}",
        r"\setCJKmainfont{Source Han Serif SC}",
        r"\usepackage[margin=22mm]{geometry}",
        r"\usepackage{graphicx}",
        r"\begin{document}",
    ]
    assets = set()
    for block in document["blocks"]:
        if block["type"] in ("header", "footer"):
            continue
        value = latex_escape(rich_text(cache.get(cache_key(block, language, fingerprint), block["text"])))
        if block.get("asset"):
            assets.add(block["asset"])
            lines.append(
                r"\begin{center}\includegraphics[width=\linewidth,height=.45\textheight,keepaspectratio]{"
                + block["asset"]
                + r"}\end{center}"
            )
        elif block["type"] in ("title", "heading"):
            lines.append(r"\section*{" + value + "}")
        else:
            lines.append(value + "\n\n")
    lines.append(r"\end{document}")
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("main.tex", "\n".join(lines))
        for name in sorted(assets):
            archive.write(root / name, name)
    return output.getvalue()
