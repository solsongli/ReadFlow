"""Internal loopback sidecar for the original RetainPDF desktop shell.

The selected desktop Python launches this module directly. It never selects or
installs a runtime, reads credentials, starts model services, or serves a UI.
"""
from __future__ import annotations

import argparse
import asyncio
from contextlib import contextmanager
import hmac
import errno
import ipaddress
import json
import os
from pathlib import Path
import socket
import sys
from urllib.parse import urlsplit

CODE_ROOT = Path(os.environ.get("RETAIN_PDF_RESEARCH_CODE_ROOT", Path(__file__).resolve().parents[2]))
BACKEND_ROOT = CODE_ROOT / "backend"
if not (BACKEND_ROOT / "library_mvp").is_dir():
    BACKEND_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_ROOT))

NATIVE_MARKER = {"application": "retainpdf-native-research-library", "schema_version": 1}
STORE_MARKER = {"application": "retainpdf-research-library", "schema_version": 1}
from library_mvp.data_layout import OWNED_FILES
READY_PREFIX = "RETAINPDF_RESEARCH_READY="


def prepare_data_root(root: Path) -> Path:
    """Accept only a new directory or our explicitly marked isolated store."""
    absolute = root.expanduser().absolute()
    if absolute == Path(absolute.anchor) or absolute == Path.home().absolute():
        raise ValueError("Use a dedicated research-library child directory.")
    if any(part.is_symlink() for part in (absolute, *absolute.parents)):
        raise ValueError("The research-library data path must not contain symlinks.")
    if absolute.exists() and not absolute.is_dir():
        raise ValueError("The research-library data root must be a directory.")
    entries = list(absolute.iterdir()) if absolute.exists() else []
    if any(entry.is_symlink() or entry.name not in OWNED_FILES for entry in entries):
        raise ValueError("The data root contains unknown content; use a new isolated directory.")
    marker = absolute / "native-library-runtime.json"
    store_marker = absolute / "research-library.json"
    for target, expected in ((marker, NATIVE_MARKER), (store_marker, STORE_MARKER)):
        if target.exists():
            try:
                if target.stat().st_size > 1024 or json.loads(target.read_text(encoding="utf-8")) != expected:
                    raise ValueError("The data directory belongs to another application or schema.")
            except (OSError, ValueError) as exc:
                raise ValueError("The research-library ownership marker is invalid.") from exc
    if entries and not marker.exists() and not store_marker.exists():
        raise ValueError("The existing data directory has no research-library ownership marker.")
    absolute.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not marker.exists():
        with marker.open("x", encoding="utf-8") as stream:
            json.dump(NATIVE_MARKER, stream, sort_keys=True)
    return absolute


def loopback_native_base(value: str) -> str:
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
                or not parsed.port or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in {"", "/"}):
            raise ValueError
    except ValueError:
        raise ValueError("The native backend must use a loopback HTTP address.") from None
    return value.rstrip("/")


def validate_internal_token(token: str) -> None:
    if not isinstance(token, str) or not 32 <= len(token) <= 512 or not token.isascii():
        raise ValueError("A random internal service token is required.")


def add_internal_guard(app, token: str) -> None:
    from fastapi import Request
    from fastapi.responses import JSONResponse

    validate_internal_token(token)

    @app.middleware("http")
    async def internal_only(request: Request, call_next):
        supplied = request.headers.get("x-retainpdf-internal", "")
        try:
            peer_is_local = request.client is not None and ipaddress.ip_address(request.client.host).is_loopback
            target = urlsplit("http://" + request.headers.get("host", ""))
            local_host = (target.hostname in {"127.0.0.1", "localhost", "::1"}
                          and target.username is None and target.password is None and target.path in {"", "/"})
            authorised = supplied.isascii() and hmac.compare_digest(supplied, token)
        except (ValueError, TypeError):
            peer_is_local = local_host = authorised = False
        if not peer_is_local or not local_host or not authorised:
            return JSONResponse({"error": {"code": "INTERNAL_SERVICE_REQUIRED",
                                "message": "This service is accessible only through the local desktop gateway."}},
                                status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response


def create_native_app(data_root: Path, *, internal_token: str, native_base: str, api_key: str,
                      allow_ocr_download: bool = False, allow_external_models: bool = False):
    # Validate inputs before the data root or Store is touched.
    if not internal_token or not api_key:
        raise ValueError("The desktop must supply internal authentication and its native API key.")
    validate_internal_token(internal_token)
    native_base = loopback_native_base(native_base)
    from library_mvp.api import create_app
    from library_mvp.native_bridge import NativeBridge
    root = prepare_data_root(data_root)
    bridge = NativeBridge(native_base, api_key)
    try:
        app = create_app(root, bridge=bridge, allow_ocr_download=allow_ocr_download,
                         allow_external_models=allow_external_models)
        add_internal_guard(app, internal_token)
    except BaseException:
        bridge.close()
        raise
    app.state.connector_status = {"status": "disabled", "port": None, "occupant": None, "real_connector_verified": False}

    @app.get("/api/research/connector/status")
    def connector_status():
        from library_mvp.connector_status import public_connector_status
        return public_connector_status(app.state.connector_status)

    return app


def create_loopback_socket(port: int) -> socket.socket:
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", port))
        listener.listen(128)
        listener.setblocking(False)
        return listener
    except BaseException:
        listener.close()
        raise


def prepare_connector(app, port: int | None):
    """An optional browser adapter must coexist with an already running Zotero."""
    if port is None:
        return None, None
    try:
        listener = create_loopback_socket(port)
    except OSError as exc:
        app.state.connector_status = {"status": "busy", "code": "CONNECTOR_PORT_OCCUPIED", "port": port,
                                      "occupant": None, "real_connector_verified": False,
                                      "message": "端口已被占用，现有接收服务保持运行。"}
        if exc.errno != errno.EADDRINUSE:
            app.state.connector_status.update(status="error", code="CONNECTOR_BIND_UNAVAILABLE",
                message="无法绑定 Connector 本地接收端口。")
        print(f"Optional Connector port {port} is unavailable; no existing listener was changed.", flush=True)
        return None, None
    try:
        from library_mvp.connector import create_connector_app, create_store_connector_service

        async def register_connector_pdf(store, attachment_id):
            # NativeBridge uses synchronous HTTP. A slow Rust registration must
            # leave the shared ASGI loop free to serve research-library requests.
            return await asyncio.to_thread(app.state.native_bridge.register, store, attachment_id)

        service = create_store_connector_service(app.state.store, pdf_callback=register_connector_pdf)
        connector_app = create_connector_app(service)
    except Exception:
        listener.close()
        app.state.connector_status = {"status": "error", "code": "CONNECTOR_UNAVAILABLE", "port": port,
                                      "occupant": None, "real_connector_verified": False,
                                      "message": "Connector 接收模块暂时不可用。"}
        print("Optional Connector adapter is unavailable; the native library remains usable.", flush=True)
        return None, None
    app.state.connector_service = service
    app.state.connector_status = {"status": "listening", "port": port, "occupant": None, "real_connector_verified": False}
    return connector_app, listener


def initial_connector_status(value: str) -> dict:
    """Only public connection metadata is accepted from the desktop's preflight."""
    raw = json.loads(value)
    if not isinstance(raw, dict) or raw.get("status") not in {"disabled", "busy", "error"}:
        raise ValueError("Invalid initial Connector status.")
    port = raw.get("port")
    if port is not None and (type(port) is not int or not 1024 <= port <= 65535):
        raise ValueError("Invalid initial Connector port.")
    result = {"status": raw["status"], "port": port, "occupant": None, "real_connector_verified": False}
    for key in ("occupant", "message"):
        if isinstance(raw.get(key), str):
            result[key] = "".join(char for char in raw[key][:240] if char.isprintable())
    return result


async def serve_connector(app, server, listener) -> None:
    try:
        await server.serve(sockets=[listener])
        if not server.should_exit:
            raise RuntimeError("Connector stopped unexpectedly")
    except (Exception, SystemExit):
        # Uvicorn may raise SystemExit on startup failure; this optional receiver
        # must never take down the document service sharing its event loop.
        app.state.connector_status.update(status="error", code="CONNECTOR_SERVER_STOPPED",
            message="Connector 接收服务已停止，请重启 ReadFlow 后重试。")
    finally:
        listener.close()


async def serve(app, *, port: int, connector_port: int | None = None, connector_state: dict | None = None) -> None:
    import uvicorn

    class ConnectorServer(uvicorn.Server):
        @contextmanager
        def capture_signals(self):
            # The API server alone owns process signals and stops both servers.
            yield

    listener = create_loopback_socket(port)
    actual_port = listener.getsockname()[1]
    if connector_state is not None:
        app.state.connector_status = connector_state
    connector_app, connector_listener = prepare_connector(app, connector_port)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=actual_port,
                            proxy_headers=False, access_log=False, log_level="warning", workers=1))
    task = asyncio.create_task(server.serve(sockets=[listener]))
    connector_server = connector_task = None
    try:
        if connector_app is not None:
            connector_server = ConnectorServer(uvicorn.Config(connector_app, host="127.0.0.1", port=connector_port,
                proxy_headers=False, access_log=False, log_level="warning", lifespan="off", workers=1))
            connector_task = asyncio.create_task(serve_connector(app, connector_server, connector_listener))
        while not server.started:
            if task.done():
                await task
                raise RuntimeError("The native research-library API failed to start.")
            await asyncio.sleep(0.02)
        print(READY_PREFIX + json.dumps({"base_url": f"http://127.0.0.1:{actual_port}",
              "connector": app.state.connector_status}), flush=True)
        await task
    finally:
        if connector_server is not None:
            connector_server.should_exit = True
            await connector_task
        listener.close()
        if connector_listener is not None:
            connector_listener.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the original desktop's private research-library API.")
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--native-base", required=True)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--connector-port", type=int, default=None)
    parser.add_argument("--connector-state", type=initial_connector_status, default=None)
    args = parser.parse_args()
    if args.port != 0 and not 1024 <= args.port <= 65535:
        parser.error("The API port must be zero or between 1024 and 65535.")
    if args.connector_port is not None and not 1024 <= args.connector_port <= 65535:
        parser.error("The optional Connector port must be between 1024 and 65535.")
    try:
        app = create_native_app(args.data_root,
            internal_token=os.environ.pop("RETAIN_PDF_RESEARCH_INTERNAL_TOKEN", ""),
            native_base=args.native_base, api_key=os.environ.pop("RETAIN_PDF_RESEARCH_NATIVE_API_KEY", ""),
            allow_ocr_download=os.environ.get("RETAIN_PDF_ALLOW_OCR_DOWNLOAD") == "1",
            allow_external_models=os.environ.get("RETAIN_PDF_ALLOW_EXTERNAL_MODELS") == "1")
        asyncio.run(serve(app, port=args.port, connector_port=args.connector_port, connector_state=args.connector_state))
    except (ValueError, OSError, RuntimeError) as exc:
        raise SystemExit("Native research-library startup failed: " + str(exc)) from None


if __name__ == "__main__":
    main()
