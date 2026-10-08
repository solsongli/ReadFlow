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

    def test_download_closes_before_rename_and_models_only_skips_wheels(self):
        # The first Windows build failed renaming a still-open temporary file (WinError 32).
        import io
        from unittest import mock
        from ops.models import fetch as fetcher

        good, bad = b"model-bytes", b"wrong-bytes"
        files = [
            {"path": "models/a.onnx", "kind": "model", "url": "https://example.test/a",
             "bytes": len(good), "sha256": hashlib.sha256(good).hexdigest()},
            {"path": "packages/x.whl", "kind": "wheel", "url": "https://example.test/x",
             "bytes": 1, "sha256": "0" * 64},
        ]
        opened = []

        class Response(io.BytesIO):
            url = "https://example.test/a"

        def urlopen(url, timeout):
            opened.append(url)
            return Response(good if url.endswith("/a") else bad)

        with tempfile.TemporaryDirectory() as root:
            manifest = Path(root) / "manifest.json"
            manifest.write_text(json.dumps({"files": files}))
            cache = Path(root) / "cache"
            with mock.patch.object(fetcher, "MANIFEST", manifest), \
                    mock.patch.object(fetcher.urllib.request, "urlopen", urlopen):
                fetcher.fetch(cache, models_only=True)
                self.assertEqual(opened, ["https://example.test/a"])
                self.assertEqual((cache / "models/a.onnx").read_bytes(), good)
                self.assertEqual(sorted(p.name for p in (cache / "models").iterdir()), ["a.onnx"])
                files[0]["sha256"] = "f" * 64
                manifest.write_text(json.dumps({"files": files}))
                with self.assertRaises(ValueError):
                    fetcher.fetch(cache, models_only=True)
                self.assertEqual(sorted(p.name for p in (cache / "models").iterdir()), ["a.onnx"])


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
