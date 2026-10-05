import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from backend.library_mvp.document_models import DocumentModels, available
from ops.models.fetch import verified, safe_target, MANIFEST


class ManifestTests(unittest.TestCase):
    def test_components_pinned_and_no_opencv_or_gpu(self):
        manifest = json.loads(MANIFEST.read_text())
        self.assertEqual(manifest["python"], "3.11")
        for entry in manifest["files"]:
            self.assertRegex(entry["sha256"], r"^[a-f0-9]{64}$")
            self.assertGreater(entry["bytes"], 0)
            self.assertTrue(entry["url"].startswith("https://"))
            self.assertNotIn("opencv", entry["path"])
            self.assertNotIn("gpu", entry["path"])
            self.assertTrue(entry["license"])
        self.assertIn("models/layout.onnx", [e["path"] for e in manifest["files"]])

    def test_hash_size_and_path_guards(self):
        with tempfile.TemporaryDirectory() as root:
            file = Path(root) / "asset"
            file.write_bytes(b"test")
            entry = {"bytes": 4, "sha256": hashlib.sha256(b"test").hexdigest()}
            self.assertTrue(verified(file, entry))
            file.write_bytes(b"oops")
            self.assertFalse(verified(file, entry))
            for name in ("../outside", "/absolute", "a\\b"):
                with self.assertRaises(ValueError):
                    safe_target(Path(root), name)
            if os.environ.get("READFLOW_REQUIRE_MODELS") == "1":
                self.assertTrue(available(), "CI must download the pinned CPU models")


@unittest.skipUnless(
    available(), "Pinned models absent; run python3 ops/models/fetch.py --stage .model-cache/runtime"
)
class CpuModelTests(unittest.TestCase):
    def test_all_models_execute_on_cpu_with_two_threads(self):
        models = DocumentModels()
        import numpy as np

        for name, shape in [
            ("layout", (1, 3, 480, 480)),
            ("ocr-det", (1, 3, 64, 64)),
            ("ocr-rec", (1, 3, 48, 320)),
        ]:
            session = models.session(name)
            self.assertEqual(session.get_providers(), ["CPUExecutionProvider"])
            self.assertEqual(session.get_session_options().intra_op_num_threads, 2)
            inputs = {
                i.name: np.zeros(shape, np.float32) if len(i.shape) == 4 else np.ones((1, 2), np.float32)
                for i in session.get_inputs()
            }
            self.assertGreater(len(models.run(name, inputs)), 0)
