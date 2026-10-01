from __future__ import annotations
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("native_preview_driver", ROOT / "ops/development/native_retain_preview.py")
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


def proc_stat(pid, ppid, stamp):
    fields = ["S", str(ppid)] + ["0"] * 17 + [stamp]
    return f"{pid} (synthetic process) " + " ".join(fields)


class PreviewOwnershipTests(unittest.TestCase):
    def test_electron_combined_process_title_is_recognized_by_kernel_executable(self):
        expected = driver.ROOT / "runtime/retain-pdf-desktop"
        title = (str(expected) + " --user-data-dir=" + str(driver.ROOT / "profile/chromium")
                 + " --remote-debugging-port=9229\0").encode()
        with patch.object(driver, "tick", return_value="original"), \
                patch.object(Path, "readlink", return_value=expected), \
                patch.object(Path, "read_bytes", return_value=title):
            self.assertTrue(driver.alive({"pid": 100, "start_ticks": "original"}))
        with patch.object(driver, "tick", return_value="original"), \
                patch.object(Path, "readlink", return_value=Path("/tmp/unrelated-app")), \
                patch.object(Path, "read_bytes", return_value=title):
            self.assertFalse(driver.alive({"pid": 100, "start_ticks": "original"}))

    def test_stop_skips_reused_child_pid_if_current_parent_changed(self):
        records = {
            "/proc/100/stat": proc_stat(100, 1, "original"),
            "/proc/100/task/100/children": "101 102",
            "/proc/101/stat": proc_stat(101, 100, "own-child"),
            "/proc/101/task/101/children": "",
            "/proc/102/stat": proc_stat(102, 999, "reused-unrelated"),
        }
        def read(path, *args, **kwargs):
            return records[str(path)]
        current = {100: "original", 101: "own-child", 102: "reused-unrelated"}
        def exited(pid, _signal):
            current.pop(pid, None)
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(driver, "alive", return_value=True), patch.object(Path, "read_text", read), \
                    patch.object(driver, "tick", side_effect=lambda pid: current.get(pid)), \
                    patch.object(driver.os, "kill", side_effect=exited) as kill:
                driver.stop(Path(temp), {"pid": 100, "start_ticks": "original"})
        self.assertEqual([call.args[0] for call in kill.call_args_list], [100, 101])
        self.assertEqual(current, {102: "reused-unrelated"})

    def test_stop_does_not_traverse_reused_main_pid(self):
        def read(path, *args, **kwargs):
            return proc_stat(100, 1, "new-unrelated")
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(driver, "alive", return_value=True), patch.object(Path, "read_text", read), \
                    patch.object(driver, "tick", return_value=None), patch.object(driver.os, "kill") as kill:
                driver.stop(Path(temp), {"pid": 100, "start_ticks": "original"})
        kill.assert_not_called()

    def test_unregistered_process_is_never_signaled(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(driver, "alive", return_value=False), patch.object(driver.os, "kill") as kill:
                driver.stop(Path(temp), {"pid": 100, "start_ticks": "stale"})
        kill.assert_not_called()
