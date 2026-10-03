from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import httpx
from fastapi import FastAPI

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("research_library_launcher", ROOT / "ops/development/research_library.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherDataTests(unittest.TestCase):
    def test_new_root_is_marked_and_reopening_own_root_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = launcher.prepare_data_root(Path(tmp) / "new")
            marker = root / "library-mvp.json"
            self.assertEqual(json.loads(marker.read_text()), launcher.MARKER_VALUE)
            before = marker.read_bytes()
            self.assertEqual(launcher.prepare_data_root(root), root)
            self.assertEqual(marker.read_bytes(), before)

    def test_unknown_existing_directory_is_refused_without_altering_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "old"
            root.mkdir()
            sentinel = root / "legacy.sqlite"
            sentinel.write_bytes(b"synthetic legacy sentinel")
            with self.assertRaises(ValueError):
                launcher.prepare_data_root(root)
            self.assertEqual(sentinel.read_bytes(), b"synthetic legacy sentinel")
            self.assertFalse((root / "library-mvp.json").exists())

    def test_symlink_directory_and_invalid_marker_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            target = base / "target"
            target.mkdir()
            link = base / "link"
            link.symlink_to(target, target_is_directory=True)
            with self.assertRaises(ValueError):
                launcher.prepare_data_root(link)
            (target / "library-mvp.json").write_text('{"application":"other"}')
            with self.assertRaises(ValueError):
                launcher.prepare_data_root(target)


class LocalOriginTests(unittest.IsolatedAsyncioTestCase):
    async def request(self, headers=None, path="/healthz", method="GET"):
        app = FastAPI()
        @app.get("/")
        @app.get("/workbench.html")
        @app.get("/reader.html")
        @app.get("/healthz")
        async def health():
            return {"ok": True}
        launcher.add_local_browser_guard(app, 41030)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url="http://127.0.0.1:41030") as client:
            return await client.request(method, path, headers=headers)

    async def test_same_origin_is_allowed_and_headers_limit_external_access(self):
        response = await self.request({"Origin": "http://127.0.0.1:41030", "Sec-Fetch-Site": "same-origin"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("connect-src 'self'", response.headers["content-security-policy"])
        self.assertEqual(response.headers["referrer-policy"], "no-referrer")

    async def test_external_origin_host_and_other_local_port_are_rejected(self):
        for headers in [{"Origin": "https://example.org"},
                        {"Origin": "http://127.0.0.1:42000"},
                        {"Host": "attacker.example"},
                        {"Origin": "null"},
                        {"Sec-Fetch-Site": "cross-site"}]:
            response = await self.request(headers)
            self.assertEqual(response.status_code, 403)

    async def test_link_navigation_to_entry_is_allowed(self):
        for path in ["/", "/workbench.html"]:
            for site in ["cross-site", "same-site"]:
                response = await self.request({"Sec-Fetch-Site": site,
                    "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document"}, path=path)
                self.assertEqual(response.status_code, 200)
                self.assertIn("frame-ancestors 'none'", response.headers["content-security-policy"])

    async def test_navigation_exception_cannot_access_api_iframe_or_write(self):
        navigation = {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate",
                      "Sec-Fetch-Dest": "document"}
        self.assertEqual((await self.request(navigation)).status_code, 403)
        self.assertEqual((await self.request(navigation, path="/", method="POST")).status_code, 403)
        self.assertEqual((await self.request({**navigation, "Sec-Fetch-Dest": "iframe"}, path="/")).status_code, 403)
        self.assertEqual((await self.request({**navigation, "Host": "attacker.example"}, path="/")).status_code, 403)

    async def test_malformed_origin_is_rejected(self):
        response = await self.request({"Origin": "https://["})
        self.assertEqual(response.status_code, 403)

    async def test_reader_can_only_be_framed_by_the_same_origin(self):
        response = await self.request({"Origin": "http://127.0.0.1:41030", "Sec-Fetch-Site": "same-origin"}, path="/reader.html")
        self.assertEqual(response.status_code, 200)
        self.assertIn("frame-ancestors 'self'", response.headers["content-security-policy"])
        denied = await self.request({"Origin": "https://foreign.example", "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe"}, path="/reader.html")
        self.assertEqual(denied.status_code, 403)


if __name__ == "__main__":
    unittest.main()
