"""Connector startup uses fake sockets/servers; never binds the user's receiver."""
import asyncio
import errno
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import httpx
from fastapi import FastAPI

ENTRY = Path(__file__).resolve().parents[3] / "ops/development/native_library_service.py"
SPEC = importlib.util.spec_from_file_location("connector_runtime_fixture", ENTRY)
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


class ConnectorRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_bind_race_and_other_bind_errors_leave_the_library_usable(self):
        for error, expected in [(errno.EADDRINUSE, "busy"), (errno.EACCES, "error")]:
            app = FastAPI()
            @app.get("/library")
            def library():
                return {"ok": True}
            with patch.object(runtime, "create_loopback_socket", side_effect=OSError(error, "fixture failure")) as bind:
                self.assertEqual(runtime.prepare_connector(app, 23119), (None, None))
                bind.assert_called_once_with(23119)
            self.assertEqual(app.state.connector_status["status"], expected)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://fixture.test") as client:
                self.assertTrue((await client.get("/library")).json()["ok"])

    async def test_disabled_and_desktop_busy_status_do_not_attempt_binding(self):
        for status, port in [("disabled", None), ("busy", 23119), ("error", None)]:
            app = FastAPI()
            state = runtime.initial_connector_status(json.dumps({"status": status, "port": port, "occupant": "Zotero（PID 1234）"}))
            app.state.connector_status = state
            with patch.object(runtime, "create_loopback_socket") as bind:
                self.assertEqual(runtime.prepare_connector(app, None), (None, None))
                bind.assert_not_called()
            self.assertEqual(app.state.connector_status, state)

    async def test_status_api_preserves_public_status_over_internal_compatibility_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = runtime.create_native_app(Path(tmp) / "library", internal_token="s" * 64,
                native_base="http://127.0.0.1:9", api_key="synthetic")
            try:
                app.state.connector_service = SimpleNamespace(status=lambda: {"status": "experimental", "sessions": 0})
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:49000",
                                             headers={"X-RetainPDF-Internal": "s" * 64}) as client:
                    for status in ["listening", "busy", "disabled", "error"]:
                        app.state.connector_status = {"status": status, "port": 23119, "occupant": "Zotero（PID 1234）"}
                        value = (await client.get("/api/research/connector/status")).json()
                        self.assertEqual(value["status"], status)
                        self.assertEqual(value["port"], 23119)
                        self.assertEqual(value["occupant"], "Zotero（PID 1234）")
            finally:
                app.state.native_bridge.close()
                app.state.store.close()

    async def test_receiver_startup_failure_or_unexpected_exit_does_not_escape_to_api_loop(self):
        for failure in [RuntimeError("fixture"), SystemExit(1), None]:
            app = FastAPI()
            app.state.connector_status = {"status": "listening", "port": 23119}
            async def serve(**_kwargs):
                if failure is not None:
                    raise failure
            socket = Mock()
            server = SimpleNamespace(serve=serve, should_exit=False)
            await asyncio.create_task(runtime.serve_connector(app, server, socket))
            self.assertEqual(app.state.connector_status["status"], "error")
            socket.close.assert_called_once()
        server.should_exit = True
        app.state.connector_status["status"] = "listening"
        await runtime.serve_connector(app, server, socket)
        self.assertEqual(app.state.connector_status["status"], "listening")

    async def test_adapter_initialization_failure_closes_only_the_new_listener(self):
        app = FastAPI()
        listener = Mock()
        with patch.object(runtime, "create_loopback_socket", return_value=listener):
            # No store: adapter creation fails after obtaining our fake socket.
            self.assertEqual(runtime.prepare_connector(app, 23119), (None, None))
        listener.close.assert_called_once()
        self.assertEqual(app.state.connector_status["status"], "error")

    def test_parent_status_is_narrow_and_cannot_claim_a_listener_started(self):
        for raw in [{"status": "listening"}, {"status": "busy", "port": True}, {"status": "busy", "port": 70000}, []]:
            with self.assertRaises(ValueError):
                runtime.initial_connector_status(json.dumps(raw))
        value = runtime.initial_connector_status(json.dumps({"status": "busy", "port": 23119, "occupant": "Zotero\n", "extra": "ignored"}))
        self.assertEqual(value["occupant"], "Zotero")
        self.assertNotIn("extra", value)
