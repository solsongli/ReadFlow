"""Local-only reader UI fixtures: vector crops plus explicitly fake Chinese layout text."""
import argparse
import json
from pathlib import Path
import pymupdf as fitz


def crops(source, manifest, output):
    output.mkdir(parents=True, exist_ok=True)
    with fitz.open(source) as pdf:
        for block in manifest["blocks"]:
            if not block.get("asset"):
                continue
            anchor = block["anchors"][0]
            area = fitz.Rect(anchor["bbox"]) & pdf[anchor["page"] - 1].rect
            with fitz.open() as cut:
                page = cut.new_page(width=area.width, height=area.height)
                page.show_pdf_page(page.rect, pdf, anchor["page"] - 1, clip=area)
                page.set_rotation(pdf[anchor["page"] - 1].rotation)
                cut.save(output / Path(block["asset"]).name, garbage=4, deflate=True)
                page.get_pixmap(matrix=fitz.Matrix(0.7, 0.7)).save(output / Path(block["asset"]).with_suffix(".png").name)


def fake(manifest):
    phrase = "这是一段离线示例译文，用于核对模型方法、实验结果与原论文布局。机器人根据观察执行动作，并在不同任务中评估泛化与安全性。"
    for block in manifest["blocks"]:
        if block["type"] in {"title", "abstract", "heading", "text", "list", "caption", "footnote"}:
            length = max(8, round(len(block["text"]) * 0.4))
            text = "【离线示例】" + (phrase * (length // len(phrase) + 1))[:length]
            block["translation_runs"] = [{"kind": "text", "text": text}]
            for part in block.get("protected", [])[:2]:
                if part.get("runs"):
                    block["translation_runs"].extend(part["runs"])
            block["translation"] = "".join(r["text"] for r in block["translation_runs"])
        for label in block.get("figure_text", []):
            if label.get("translatable"):
                label["translation"] = "示例标签"
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("/tmp/readflow-x6"))
    parser.add_argument("--corpus-dir", type=Path)
    parser.add_argument("--blocks-root", type=Path, default=Path("/tmp/readflow-x5/after"))
    parser.add_argument("--paper-data-root", type=Path)
    args = parser.parse_args()
    fixture = Path("frontend/web/tests/fixtures/blocks")
    crops(fixture / "paper.pdf", json.loads((fixture / "manifest.json").read_text()), args.output / "assets")
    with fitz.open(fixture / "paper.pdf") as pdf:
        matches = pdf[0].search_for("[1]")
        if matches:
            pdf[0].insert_link({"kind": fitz.LINK_GOTO, "from": matches[0], "page": 2, "to": fitz.Point(0, 50)})
        pdf.save(args.output / "paper-links.pdf", garbage=4, deflate=True)
    if args.corpus_dir or args.paper_data_root:
        for name, folder in [("2406.09246", "OpenVLA"), ("2303.04137", "DiffusionPolicy")]:
            source = (
                args.paper_data_root / folder / "source.pdf"
                if args.paper_data_root
                else args.corpus_dir / (name + ".pdf")
            )
            if any(p.is_symlink() for p in [source, *source.parents]):
                raise ValueError("Expected a regular, read-only corpus PDF")
            blocks = (
                args.paper_data_root / folder / "blocks.json"
                if args.paper_data_root
                else args.blocks_root / name / "blocks.json"
            )
            manifest = fake(json.loads(blocks.read_text()))
            target = args.output / name
            crops(source, manifest, target / "assets")
            (target / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False))
    print("Generated isolated fake reader fixtures; original PDFs remain read-only.")


if __name__ == "__main__":
    main()
