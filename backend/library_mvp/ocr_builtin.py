"""Expose immutable built-in OCR through the existing settings/jobs contract."""
from contextlib import contextmanager
import json
import threading
from .document_models import DocumentModels, available, model_root
from .store import StoreError

BUILTIN_ID = "readflow-ocr-mobile-cpu"


class BuiltinOcrModules:
    def __init__(self, optional):
        self.optional = optional
        self.lock = optional.lock
        self.active = optional.active
        self.inference_lock = threading.Lock()
        self.models = None

    def __getattr__(self, name):
        return getattr(self.optional, name)

    def list(self):
        ready = available()
        size = 0
        if ready:
            entries = json.loads((model_root() / "manifest.json").read_text(encoding="utf-8"))["files"]
            size = sum(e["bytes"] for e in entries if e["path"].startswith("models/ocr-"))
        return [
            {
                "id": BUILTIN_ID,
                "builtin": True,
                "engine_version": "ReadFlow CPU 1",
                "model_version": "PP-OCRv5 mobile",
                "status": "ready" if ready else "error",
                "error": None if ready else "内置 OCR 资源缺失，请重新安装 ReadFlow。",
                "files": [],
                "download_enabled": False,
                "total_bytes": size,
            }
        ] + self.optional.list()

    @contextmanager
    def runtime_lease(self, identity):
        if identity != BUILTIN_ID:
            with self.optional.runtime_lease(identity) as runtime:
                yield runtime
            return
        if not available():
            raise StoreError("OCR_NOT_READY", "内置 OCR 资源缺失。", 409)
        yield {"builtin": True, "parser_version": "readflow-ppocr5-1", "module": {}, "owner": self}

    def remove(self, identity):
        if identity == BUILTIN_ID:
            raise StoreError("OCR_BUNDLED", "内置 OCR 随应用更新，无需单独移除。", 409)
        return self.optional.remove(identity)


def run_builtin(page, runtime, cancelled):
    import fitz
    from PIL import Image
    from .document_ocr import DocumentOcr

    def check():
        if cancelled.is_set():
            from .ocr_jobs import OcrCancelled

            raise OcrCancelled()

    owner = runtime["owner"]
    with owner.inference_lock:
        if owner.models is None:
            owner.models = DocumentModels()
        scale = min(2.5, 2600 / max(page.rect.width, page.rect.height))
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        result = DocumentOcr(owner.models).recognize(image, check)
    for row in result:
        row["bbox"] = [v / scale for v in row["bbox"]]
    return result
