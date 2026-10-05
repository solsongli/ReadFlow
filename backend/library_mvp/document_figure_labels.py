"""Keep native figure/table labels at cell granularity instead of masking numeric rows."""
import pymupdf as fitz


def native_figure_labels(page, images):
    raw = page.get_text("rawdict", flags=fitz.TEXTFLAGS_TEXT)
    for image in images:
        previous = [r for r in image.get("figure_text", []) if r.get("source") != "ocr"]
        if not previous:
            continue
        region = image["bbox"]

        def owned(box):
            x, y = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
            if not (region[0] <= x <= region[2] and region[1] <= y <= region[3]):
                return False
            return any(r["bbox"][0] <= x <= r["bbox"][2] and r["bbox"][1] <= y <= r["bbox"][3] for r in previous)

        labels = [r for r in image["figure_text"] if r.get("source") == "ocr"]
        for block in raw["blocks"]:
            for line in block.get("lines", []):
                parts = []
                for span in line["spans"]:
                    chars = [c for c in span["chars"] if owned(c["bbox"])]
                    for char in chars:
                        if not char["c"].strip():
                            continue
                        parts.append(
                            {"text": char["c"], "bbox": char["bbox"], "font": span["font"], "size": span["size"]}
                        )
                groups = []
                for char in sorted(parts, key=lambda c: c["bbox"][0]):
                    last = groups[-1][-1] if groups else None
                    gap = char["bbox"][0] - last["bbox"][2] if last else 0
                    if not last or gap > max(char["size"], last["size"]) * 0.8:
                        groups.append([])
                    elif gap > char["size"] * 0.12:
                        groups[-1].append({**char, "text": " ", "bbox": char["bbox"]})
                    groups[-1].append(char)
                for group in groups:
                    box = fitz.Rect(group[0]["bbox"])
                    for char in group[1:]:
                        box |= fitz.Rect(char["bbox"])
                    text = "".join(c["text"] for c in group).strip()
                    if text:
                        labels.append(
                            {
                                "text": text,
                                "bbox": list(box),
                                "font": group[0]["font"],
                                "size": max(c["size"] for c in group),
                                "source": "native_text",
                            }
                        )
        # No native label is lost if a font exposes only inaccessible glyph information.
        image["figure_text"] = labels or image["figure_text"]
