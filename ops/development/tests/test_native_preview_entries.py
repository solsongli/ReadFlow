"""Isolated program-copy tests; never starts Electron or touches a real profile."""
from pathlib import Path
import importlib.util
import tempfile
import unittest
from unittest.mock import patch

ENTRY = Path(__file__).resolve().parents[1] / "native_retain_preview.py"
spec = importlib.util.spec_from_file_location("preview_entries_fixture", ENTRY)
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewEntriesTests(unittest.TestCase):
    def test_prepare_removes_stale_shells_and_bundles_but_keeps_profile(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            desktop = repo / "frontend/desktop"
            source = desktop / "linux/linux-unpacked"
            (source / "resources/backend").mkdir(parents=True)
            (source / "retain-pdf-desktop").write_text("fixture executable; never run")
            for name in ["main.js", "preload.js", "splash.html", "package.json"]:
                (desktop / name).write_text("fixture")
            for name in ["src/main", "assets"]:
                (desktop / name).mkdir(parents=True)
            web = repo / "frontend/web"
            web.mkdir()
            for name in ["reader.html", "workbench.html", "runtime-config.js"]:
                (web / name).write_text("fixture")
            (web / "dist").mkdir()
            (web / "dist/workbench.bundle.js").write_text("fixture")
            root = Path(tmp) / "preview"
            target = root / "runtime/resources/app/app/frontend"
            (target / "dist").mkdir(parents=True)
            (target / "stale.html").write_text("obsolete")
            (target / "dist/stale.bundle.js").write_text("obsolete")
            (root / "profile").mkdir()
            sentinel = root / "profile/synthetic-data"
            sentinel.write_text("preserve")
            with patch.multiple(preview, REPO=repo, DESKTOP=desktop, SOURCE=source), patch.object(preview, "alive", return_value=False):
                preview.prepare(root)
            self.assertEqual(sorted(p.name for p in target.glob("*.html")), ["reader.html", "workbench.html"])
            self.assertFalse((target / "dist/stale.bundle.js").exists())
            self.assertTrue((target / "dist/workbench.bundle.js").exists())
            self.assertEqual(sentinel.read_text(), "preserve")

    def test_preview_url_points_directly_to_workbench(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            log = root / "native-fixture.log"
            log.write_text("local gateway listening on http://127.0.0.1:9\n")
            with patch.object(preview, "ROOT", root):
                self.assertEqual(preview.url({"log": str(log)}), "http://127.0.0.1:9/workbench.html")

    def test_spawn_environment_always_points_to_repository_research_service(self):
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "runtime").mkdir()
            child = Mock(pid=12345)
            child.poll.return_value = None
            with patch.object(preview.sys, "argv", ["preview", "start"]), \
                 patch.object(preview, "own_root", return_value=root), \
                 patch.object(preview, "state", return_value=None), \
                 patch.object(preview, "alive", return_value=False), \
                 patch.object(preview, "prepare", return_value=root / "runtime/fake-shell"), \
                 patch.object(preview, "ready", return_value=True), \
                 patch.object(preview, "url", return_value="http://127.0.0.1:9/workbench.html"), \
                 patch.object(preview, "tick", return_value="fixture"), \
                 patch.object(preview.os, "environ", {}), \
                 patch.object(preview.subprocess, "Popen", return_value=child) as spawn:
                self.assertEqual(preview.main(), 0)
            child_env = spawn.call_args.kwargs["env"]
            self.assertEqual(child_env["RETAIN_PDF_RESEARCH_CODE_ROOT"], str(preview.REPO))
            self.assertEqual(child_env["RETAIN_PDF_START_PAGE"], "workbench.html")
            self.assertEqual(child_env["RETAIN_PDF_RESEARCH_CONNECTOR_PORT"], "")
