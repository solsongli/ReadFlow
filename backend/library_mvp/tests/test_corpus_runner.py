"""Native-worker failures cannot reuse a previous successful audit record."""
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
from ops.development.paper_blocks_corpus import run_one


class CorpusRunnerTests(unittest.TestCase):
    def test_native_crash_discards_stale_metrics(self):
        options = SimpleNamespace(limit_over=100, limit_pages=40, no_render=False, keep_assets=False)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "metrics.json").write_text('{"name":"old","pages":10}')
            with patch(
                "ops.development.paper_blocks_corpus.subprocess.run", return_value=SimpleNamespace(returncode=-6)
            ):
                result = run_one(Path("public.pdf"), root, "fixture", options)
            self.assertIn("exited -6", result["extraction_error"])
            self.assertNotIn("pages", result)
            self.assertEqual(json.loads((root / "metrics.json").read_text()), result)

    def test_clean_worker_record_and_explicit_options(self):
        options = SimpleNamespace(limit_over=100, limit_pages=40, no_render=True, keep_assets=True)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def execute(command, **kwargs):
                self.assertIn("--worker-pdf", command)
                self.assertIn("--no-render", command)
                self.assertIn("--keep-assets", command)
                self.assertEqual(kwargs["timeout"], 600)
                (root / "metrics.json").write_text('{"pages":1,"types":{"text":2}}')
                return SimpleNamespace(returncode=0)

            with patch("ops.development.paper_blocks_corpus.subprocess.run", side_effect=execute):
                result = run_one(Path("public.pdf"), root, "fixture", options)
            self.assertEqual(result["pages"], 1)
            self.assertEqual(result["name"], "fixture")
