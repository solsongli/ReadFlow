"""Verified built-in CPU sessions. Missing local assets never trigger downloads."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import threading


def model_root():
    explicit = os.environ.get("READFLOW_MODELS_DIR")
    if explicit:
        return Path(explicit)
    # Packaged code and source/preview use exactly the same pinned manifest.
    packaged = Path(__file__).resolve().parents[2] / "models"
    if packaged.is_dir():
        return packaged
    source = Path(__file__).resolve().parents[2] / ".model-cache/runtime/models"
    return source


def available():
    root = model_root()
    return all(
        (root / name).is_file() for name in ("manifest.json", "layout.onnx", "ocr-det.onnx", "ocr-rec.onnx")
    )


def revision():
    try:
        return json.loads((model_root() / "manifest.json").read_text(encoding="utf-8"))["revision"] if available() else None
    except (OSError, ValueError, KeyError):
        return None


def cpu_priority():
    # Linux applies this to the current worker, whose inference threads inherit it.
    if hasattr(os, "setpriority"):
        try:
            os.setpriority(os.PRIO_PROCESS, threading.get_native_id(), 10)
        except OSError:
            pass


class DocumentModels:
    def __init__(self, root=None):
        self.root = Path(root or model_root())
        self.sessions = {}
        self.lock = threading.RLock()
        manifest = json.loads((self.root / "manifest.json").read_text(encoding="utf-8"))
        self.revision = manifest["revision"]
        for entry in manifest["files"]:
            if not entry["path"].startswith("models/"):
                continue
            file = self.root / entry["path"].removeprefix("models/")
            if (
                file.is_symlink()
                or not file.is_file()
                or hashlib.sha256(file.read_bytes()).hexdigest() != entry["sha256"]
            ):
                raise ValueError("Built-in document component failed verification")
        # Source/CI staging is isolated from the host Python; production installs these
        # same verified wheels in its private runtime's site-packages.
        site = self.root.parent / "site"
        if site.is_dir() and importlib.util.find_spec("onnxruntime") is None:
            sys.path.insert(0, str(site))
        os.environ["ORT_DISABLE_TELEMETRY"] = "1"
        os.environ["OPENBLAS_NUM_THREADS"] = "1"
        import onnxruntime as ort

        ort.disable_telemetry_events()
        self.ort = ort

    def session(self, name):
        with self.lock:
            if name not in self.sessions:
                cpu_priority()
                options = self.ort.SessionOptions()
                options.intra_op_num_threads = 2
                options.inter_op_num_threads = 1
                options.execution_mode = self.ort.ExecutionMode.ORT_SEQUENTIAL
                options.log_severity_level = 3
                options.add_session_config_entry("session.intra_op.allow_spinning", "0")
                options.add_session_config_entry("session.inter_op.allow_spinning", "0")
                self.sessions[name] = self.ort.InferenceSession(
                    str(self.root / (name + ".onnx")), options, providers=["CPUExecutionProvider"]
                )
            return self.sessions[name]

    def run(self, name, inputs):
        # No two document inference jobs contend for more than two CPU threads.
        with self.lock:
            return self.session(name).run(None, inputs)
