from __future__ import annotations

import asyncio
import errno
import importlib.util
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import httpx
from fastapi import FastAPI

ROOT = Path(__file__).resolve().parents[3]
ENTRY = ROOT / "ops/development/native_library_service.py"
spec = importlib.util.spec_from_file_location("native_library_service", ENTRY)
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class NativeDataRootTests(unittest.TestCase):
    def test_new_store_is_owned_and_can_reopen_without_changing_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = service.prepare_data_root(Path(tmp) / "research-library")
            marker = root / "native-library-runtime.json"
            before = marker.read_bytes()
            self.assertEqual(json.loads(before), service.NATIVE_MARKER)
            self.assertEqual(service.prepare_data_root(root), root)
            self.assertEqual(marker.read_bytes(), before)

    def test_unknown_or_unmarked_existing_files_are_refused_without_writes(self):
        for filename in ["private.sqlite", "library.sqlite3", ".gitignore"]:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp) / "existing"
                root.mkdir()
                sentinel = root / filename
                sentinel.write_bytes(b"synthetic protected sentinel")
                with self.assertRaises(ValueError):
                    service.prepare_data_root(root)
                self.assertEqual(sentinel.read_bytes(), b"synthetic protected sentinel")
                self.assertFalse((root / "native-library-runtime.json").exists())

    def test_root_path_parent_symlink_and_wrong_marker_are_refused(self):
        with self.assertRaises(ValueError):
            service.prepare_data_root(Path("/"))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "root"
            root.mkdir()
            link = Path(tmp) / "linked"
            link.symlink_to(root, target_is_directory=True)
            with self.assertRaises(ValueError):
                service.prepare_data_root(link / "child")
            self.assertFalse((root / "child").exists())
            (root / "native-library-runtime.json").write_text('{"application":"other"}')
            with self.assertRaises(ValueError):
                service.prepare_data_root(root)


class InternalGuardTests(unittest.IsolatedAsyncioTestCase):
    async def request(self, headers=None, client=("127.0.0.1", 12345)):
        app = FastAPI()
        @app.get("/api/research/healthz")
        def health():
            return {"ok": True}
        service.add_internal_guard(app, "s" * 64)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=client),
                                     base_url="http://127.0.0.1:49000") as client:
            return await client.get("/api/research/healthz", headers=headers)

    async def test_direct_missing_wrong_token_and_remote_peer_are_rejected(self):
        for headers in [None, {"X-RetainPDF-Internal": "wrong"},
                        {"X-RetainPDF-Internal": "s" * 64, "Host": "remote.example"}]:
            self.assertEqual((await self.request(headers)).status_code, 403)
        response = await self.request({"X-RetainPDF-Internal": "s" * 64}, client=("192.0.2.1", 12345))
        self.assertEqual(response.status_code, 403)

    async def test_authenticated_gateway_is_allowed_without_cors(self):
        response = await self.request({"X-RetainPDF-Internal": "s" * 64,
                                       "Origin": "http://127.0.0.1:47500"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertNotIn("access-control-allow-origin", response.headers)


class ConnectorCoexistTests(unittest.TestCase):
    def test_busy_connector_port_keeps_the_owner_and_does_not_disable_library(self):
        with patch.object(service, "create_loopback_socket", side_effect=OSError(errno.EADDRINUSE, "fixture occupied")) as bind:
            port = 23119
            app = FastAPI()
            app.state.connector_status = {"status": "disabled"}
            connector, listener = service.prepare_connector(app, port)
            self.assertIsNone(connector)
            self.assertIsNone(listener)
            self.assertEqual(app.state.connector_status["status"], "busy")
            self.assertFalse(app.state.connector_status["real_connector_verified"])
            bind.assert_called_once_with(port)


class ConnectorBridgeConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_slow_connector_registration_keeps_research_health_responsive(self):
        import pymupdf

        entered = threading.Event()
        release = threading.Event()

        class SlowNativeBridge:
            def register(self, store, attachment_id):
                entered.set()
                if not release.wait(timeout=2):
                    raise RuntimeError("synthetic bridge was not released")
                return {"reader_ready": True, "native_document_id": store.get_attachment(attachment_id)["sha256"],
                        "native_bridge": {"status": "ready"}}

        with tempfile.TemporaryDirectory() as tmp:
            app = service.create_native_app(Path(tmp) / "research-library", internal_token="s" * 64,
                native_base="http://127.0.0.1:9", api_key="synthetic-test-native-key")
            original_bridge = app.state.native_bridge
            app.state.native_bridge = SlowNativeBridge()
            connector = listener = upload = None
            try:
                connector, listener = service.prepare_connector(app, 0)
                self.assertIsNotNone(connector)
                with pymupdf.open() as document:
                    page = document.new_page()
                    page.insert_text((40, 40), "Synthetic nonblocking Connector paper")
                    raw = document.tobytes()
                connector_base = f"http://127.0.0.1:{listener.getsockname()[1]}"
                connector_transport = httpx.ASGITransport(app=connector, client=("127.0.0.1", 12345))
                research_transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 12346))
                async with httpx.AsyncClient(transport=connector_transport, base_url=connector_base) as capture, \
                           httpx.AsyncClient(transport=research_transport, base_url="http://127.0.0.1:49000") as research:
                    upload = asyncio.create_task(capture.post("/connector/saveStandaloneAttachment?sessionID=ASYNC1",
                        content=raw, headers={"Content-Type": "application/pdf", "X-Zotero-Version": "6.0.99",
                        "X-Zotero-Connector-API-Version": "3", "X-Metadata": json.dumps({"id": "PDF1",
                        "title": "Synthetic captured PDF", "contentType": "application/pdf"})}))
                    started = await asyncio.wait_for(asyncio.to_thread(entered.wait, 1), timeout=1.5)
                    self.assertTrue(started)
                    health = await asyncio.wait_for(research.get("/api/research/healthz",
                        headers={"X-RetainPDF-Internal": "s" * 64}), timeout=0.5)
                    self.assertEqual(health.status_code, 200)
                    self.assertFalse(upload.done(), "PDF registration must remain pending while research health responds")
                    release.set()
                    result = await asyncio.wait_for(upload, timeout=1)
                    self.assertEqual(result.status_code, 201)
                    self.assertTrue(result.json()["reader_ready"])
            finally:
                release.set()
                if upload is not None and not upload.done():
                    await asyncio.wait_for(upload, timeout=3)
                if listener is not None:
                    listener.close()
                app.state.store.close()
                original_bridge.close()


class NativeProcessTests(unittest.TestCase):
    def test_real_selected_python_private_health_and_restart_persistence(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_root = Path(tmp) / "research-library"
            token = secrets.token_hex(32)
            env = {key: os.environ[key] for key in ("PATH", "LANG", "LC_ALL", "LD_LIBRARY_PATH") if key in os.environ}
            env.update({"RETAIN_PDF_RESEARCH_INTERNAL_TOKEN": token,
                        "RETAIN_PDF_RESEARCH_NATIVE_API_KEY": "synthetic-test-native-key",
                        "RETAIN_PDF_RESEARCH_CODE_ROOT": str(ROOT)})
            for run in range(2):
                child = subprocess.Popen([sys.executable, "-I", "-B", str(ENTRY), "--data-root", str(data_root),
                    "--native-base", "http://127.0.0.1:9", "--port", "0"],
                    env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    line = child.stdout.readline()
                    self.assertTrue(line.startswith(service.READY_PREFIX), line)
                    base = json.loads(line[len(service.READY_PREFIX):])["base_url"]
                    with self.assertRaises(HTTPError) as denied:
                        urlopen(base + "/api/research/healthz", timeout=2)
                    self.assertEqual(denied.exception.code, 403)
                    headers = {"X-RetainPDF-Internal": token}
                    with urlopen(Request(base + "/api/research/healthz", headers=headers), timeout=2) as response:
                        health = json.load(response)
                    self.assertEqual(health, {"ok": True, "version": "0.1.0", "data_mode": "isolated",
                                             "ai": {"status": "not-verified"}})
                    if run == 0:
                        request = Request(base + "/api/research/items", data=b'{"title":"Synthetic persistent paper"}',
                            headers={**headers, "Content-Type": "application/json"}, method="POST")
                        with urlopen(request, timeout=2) as response:
                            self.assertEqual(response.status, 201)
                    else:
                        with urlopen(Request(base + "/api/research/items", headers=headers), timeout=2) as response:
                            items = json.load(response)["items"]
                        self.assertEqual([item["title"] for item in items], ["Synthetic persistent paper"])
                finally:
                    child.terminate()
                    child.wait(timeout=8)
                    child.stdout.close()
                    child.stderr.close()


if __name__ == "__main__":
    unittest.main()

class UsedLibraryRestartTests(unittest.IsolatedAsyncioTestCase):
    async def test_used_library_restarts_with_annotations_canvas_ocr_and_agent_config(self):
        import base64
        import pymupdf
        from library_mvp.agent_config import AgentConfig
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'used-library'
            first = service.create_native_app(root, internal_token='a' * 64,
                                             native_base='http://127.0.0.1:9', api_key='fixture-native')
            async with first.router.lifespan_context(first):
                store = first.state.store
                with pymupdf.open() as pdf:
                    pdf.new_page().insert_text((50, 50), 'Restart fixture')
                    imported = store.add_pdf(pdf.tobytes(), filename='fixture.pdf')
                pixmap = pymupdf.Pixmap(pymupdf.csRGB, (0, 0, 20, 20), False)
                annotation = store.annotations.save(imported['item']['id'], {
                    'attachment_id': imported['attachment']['id'], 'page_index': 0,
                    'type': 'region', 'color': 'yellow', 'rects': [{'x': .1, 'y': .1, 'width': .2, 'height': .2}],
                    'image': base64.b64encode(pixmap.tobytes('png')).decode(),
                })
                canvas = store.canvases.create({'name': 'Restart canvas'})
                store.canvases.patch(canvas['id'], {'nodes': [{
                    'id': 'image-card', 'type': 'image', 'annotation_id': annotation['id'],
                    'x': 10, 'y': 10, 'width': 260, 'height': 180,
                }]})
                (root / 'optional-ocr' / 'fixture-module').mkdir(parents=True, exist_ok=True)
                (root / 'optional-ocr' / 'fixture-module' / 'model.bin').write_bytes(b'fixture')
                AgentConfig(root / 'agent-config.json').save({
                    'base_url': 'http://127.0.0.1:9/v1', 'model': 'fixture', 'api_key': '',
                })
                first.state.paper_blocks.storage.extract(imported['attachment'])
                self.assertTrue(list((root / 'paper-blocks').glob('*/blocks.json')))
            self.assertTrue(list((root / 'annotation-images').glob('*.png')))
            self.assertTrue(list((root / 'canvas-images').glob('*.png')))
            for _ in range(2):
                self.assertEqual(service.prepare_data_root(root), root)
                app = service.create_native_app(root, internal_token='a' * 64,
                                               native_base='http://127.0.0.1:9', api_key='fixture-native')
                async with app.router.lifespan_context(app):
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                                 base_url='http://127.0.0.1:49000') as client:
                        response = await client.get('/api/research/healthz', headers={'X-RetainPDF-Internal': 'a' * 64})
                        self.assertEqual(response.status_code, 200)
                    self.assertEqual(len(app.state.store.canvases.get(canvas['id'])['nodes']), 1)
                    blocks = app.state.paper_blocks.status(imported['item']['id'])['document']
                    self.assertTrue(blocks['blocks'])

    async def test_owned_image_directories_cannot_be_symlinks(self):
        from library_mvp.store import Store, StoreError
        for name in ('annotation-images', 'canvas-images', 'blobs', 'paper-blocks'):
            with tempfile.TemporaryDirectory() as tmp:
                root = service.prepare_data_root(Path(tmp) / 'library')
                outside = Path(tmp) / 'outside'
                outside.mkdir()
                (root / name).symlink_to(outside, target_is_directory=True)
                with self.assertRaises(ValueError):
                    service.prepare_data_root(root)
                with self.assertRaises(StoreError):
                    Store(root)

    async def test_literal_data_root_entries_must_be_registered(self):
        import ast
        from library_mvp import data_layout
        from library_mvp.data_layout import OWNED_FILES
        unknown = []
        for path in (ROOT / 'backend/library_mvp').rglob('*.py'):
            if 'tests' in path.relative_to(ROOT / 'backend/library_mvp').parts:
                continue
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                if not isinstance(node, ast.BinOp) or not isinstance(node.op, ast.Div):
                    continue
                left = ast.unparse(node.left)
                name = node.right.value if isinstance(node.right, ast.Constant) else (
                    getattr(data_layout, node.right.id, None) if isinstance(node.right, ast.Name) else None)
                if 'data_root' in left and isinstance(name, str) and name not in OWNED_FILES:
                    unknown.append((path.name, node.lineno, name))
        self.assertEqual(unknown, [], 'New top-level storage entries must be registered in data_layout.py')
