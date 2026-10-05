"""Independent NumPy DB connected components and CTC decoding; no OpenCV or OCR wrapper."""
import math
from PIL import Image


def components(probability, threshold=0.3):
    import numpy as np

    parents, spans, previous = [], [], []

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for y, row in enumerate(probability):
        changes = np.diff(np.pad((row > threshold).astype(np.int8), (1, 1)))
        starts, ends = np.flatnonzero(changes == 1), np.flatnonzero(changes == -1)
        current, left = [], 0
        for x0, x1 in zip(starts.tolist(), ends.tolist()):
            index = len(parents)
            parents.append(index)
            spans.append((x0, y, x1, float(row[x0:x1].sum())))
            while left < len(previous) and previous[left][1] < x0:
                left += 1
            for p0, p1, parent in previous[left:]:
                if p0 > x1:
                    break
                parents[root(index)] = root(parent)
            current.append((x0, x1, index))
        previous = current
    groups = {}
    for index, (x0, y, x1, score) in enumerate(spans):
        key = root(index)
        box = groups.setdefault(key, [x0, y, x1, y + 1, 0.0, 0])
        box[0], box[1] = min(box[0], x0), min(box[1], y)
        box[2], box[3] = max(box[2], x1), max(box[3], y + 1)
        box[4] += score
        box[5] += x1 - x0
    return [
        {"bbox": b[:4], "confidence": b[4] / b[5]}
        for b in groups.values()
        if b[2] - b[0] >= 4 and b[3] - b[1] >= 2 and b[5] >= 8 and b[4] / b[5] >= 0.55
    ]


def decode_ctc(scores, dictionary):
    import numpy as np

    indexes = scores.argmax(axis=1)
    keep = (indexes != 0) & np.r_[True, indexes[1:] != indexes[:-1]]
    selected = indexes[keep]
    if not len(selected) or int(selected.max()) >= len(dictionary):
        return "", 0.0
    text = "".join(dictionary[int(index)] for index in selected)
    return text.strip(), float(scores[np.flatnonzero(keep), selected].mean())


class DocumentOcr:
    def __init__(self, models):
        self.models = models
        self.dictionary = [""] + (models.root / "ocr-dict.txt").read_text().splitlines() + [" "]

    def recognize(self, image, check=lambda: None):
        import numpy as np

        check()
        image = image.convert("RGB")
        width, height = image.size
        scale = min(1.0, 1280 / max(width, height))
        dw, dh = max(32, round(width * scale / 32) * 32), max(32, round(height * scale / 32) * 32)
        resized = image.resize((dw, dh), Image.Resampling.BILINEAR)
        data = np.asarray(resized, np.float32)[:, :, ::-1] / 255
        data = (data - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
        detected = self.models.run("ocr-det", {"x": data.transpose(2, 0, 1)[None]})[0][0, 0]
        result = []
        for row in sorted(components(detected), key=lambda r: (r["bbox"][1], r["bbox"][0]))[:1500]:
            check()
            x0, y0, x1, y1 = row["bbox"]
            # DB shrinks its training polygons. Expand using area/perimeter, without a polygon dependency.
            pad = 1.5 * (x1 - x0) * (y1 - y0) / max(1, (x1 - x0) + (y1 - y0)) / 2
            box = [
                max(0, (x0 - pad) * width / dw),
                max(0, (y0 - pad) * height / dh),
                min(width, (x1 + pad) * width / dw),
                min(height, (y1 + pad) * height / dh),
            ]
            crop = image.crop(tuple(box))
            if crop.width < 2 or crop.height < 2:
                continue
            rw = min(1600, max(16, math.ceil(48 * crop.width / crop.height)))
            crop = crop.resize((rw, 48), Image.Resampling.BILINEAR)
            pixels = np.asarray(crop, np.float32)[:, :, ::-1] / 127.5 - 1
            padded = np.zeros((1, 3, 48, max(32, math.ceil(rw / 32) * 32)), np.float32)
            padded[0, :, :, :rw] = pixels.transpose(2, 0, 1)
            scores = self.models.run("ocr-rec", {"x": padded})[0][0]
            text, confidence = decode_ctc(scores, self.dictionary)
            if text and confidence >= 0.5:
                result.append({"text": text, "bbox": box, "confidence": round(confidence, 4), "source": "ocr"})
        return result
