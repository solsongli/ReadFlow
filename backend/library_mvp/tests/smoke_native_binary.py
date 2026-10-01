"""Opt-in real Rust binary contract smoke; only synthetic temporary data.

Run with the existing bundled Python. No services are discovered or stopped:
this script only starts and signals its own rust_api Popen process.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import secrets
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time

import httpx

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))

from backend.library_mvp.native_bridge import NativeBridge
from backend.library_mvp.store import Store
from backend.library_mvp.tests.test_store import synthetic_pdf


def free_ports(count: int) -> list[int]:
    sockets = []
    try:
        for _ in range(count):
            connection = socket.socket()
            connection.bind(("127.0.0.1", 0))
            sockets.append(connection)
        return [connection.getsockname()[1] for connection in sockets]
    finally:
        for connection in sockets:
            connection.close()


def owned_stop(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.send_signal(signal.SIGINT)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=2)


def counts(path: Path) -> dict:
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as connection:
        connection.execute("PRAGMA query_only=ON")
        return {table: connection.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                for table in ("documents", "uploads", "jobs")}


def main() -> None:
    binary = REPO / "target/release/rust_api"
    python = REPO / "frontend/desktop/linux/linux-unpacked/resources/backend/python/bin/python3"
    if not binary.is_file() or not python.is_file():
        raise RuntimeError("The existing Rust artifact or bundled Python is unavailable; do not install dependencies.")
    with tempfile.TemporaryDirectory(prefix="retain-native-binary-smoke-") as temporary:
        root = Path(temporary)
        (root / "smoke-marker.json").write_text(json.dumps({
            "purpose": "synthetic-native-bridge-smoke", "real_library": False}), encoding="utf-8")
        api_root = root / "project/backend/api"
        api_root.mkdir(parents=True)
        data_root, library_root = root / "rust-data", root / "research-data"
        api_port, simple_port = free_ports(2)
        application_key = secrets.token_hex(32)
        # Do not copy os.environ: model/user credential variables never enter the child.
        environment = {
            "PATH": "/usr/bin:/bin", "PYTHON_BIN": str(python),
            "RUST_API_ROOT": str(api_root),
            "RUST_API_PROJECT_ROOT": str(root / "project"),
            "RUST_API_SCRIPTS_DIR": str(REPO / "backend/pipeline"),
            "RUST_API_DATA_ROOT": str(data_root),
            "RUST_API_BIND_HOST": "127.0.0.1",
            "RUST_API_PORT": str(api_port), "RUST_API_SIMPLE_PORT": str(simple_port),
            "RUST_API_KEYS": application_key, "RUST_API_MAX_RUNNING_JOBS": "1",
            "RUST_API_AI_SUPERVISE": "0", "RUST_API_JOBS_SUPERVISE": "0",
            "RUST_API_JOBS_MODE": "in_process",
            "RETAIN_MODEL_EXECUTOR_ENABLED": "0", "RETAIN_MODEL_WORKER_ENABLED": "0",
            "RUST_LOG": "rust_api=warn",
        }
        base_url = f"http://127.0.0.1:{api_port}"
        log_path = root / "owned-rust.log"
        process = None
        spawned_pids = []
        store = Store(library_root)
        bridge = NativeBridge(base_url, application_key)
        logs = log_path.open("ab")

        def start() -> subprocess.Popen:
            child = subprocess.Popen([str(binary)], cwd=root, env=environment,
                                     stdin=subprocess.DEVNULL, stdout=logs, stderr=logs,
                                     start_new_session=True)
            spawned_pids.append(child.pid)
            try:
                deadline = time.monotonic() + 12
                with httpx.Client(trust_env=False, timeout=0.5) as client:
                    while time.monotonic() < deadline:
                        if child.poll() is not None:
                            raise RuntimeError("Owned Rust binary exited before the isolated API was ready.")
                        try:
                            response = client.get(base_url + "/api/v1/documents",
                                                  headers={"X-API-Key": application_key})
                            if response.status_code == 200:
                                payload = response.json()
                                if isinstance(payload, dict) and payload.get("code") == 0:
                                    return child
                            elif response.status_code in (401, 403):
                                raise RuntimeError("The artifact did not accept the new synthetic application key.")
                        except httpx.RequestError:
                            pass
                        time.sleep(0.1)
                raise RuntimeError("Owned Rust API startup exceeded 12 seconds.")

            except BaseException:
                owned_stop(child)
                raise

        try:
            raw = synthetic_pdf(["Synthetic native bridge evidence.", "Second synthetic page."])
            uploaded = store.add_pdf(raw, filename="synthetic-native.pdf")
            attachment = uploaded["attachment"]
            digest = hashlib.sha256(raw).hexdigest()
            process = start()
            first = bridge.register(store, attachment["id"])
            if not first["reader_ready"]:
                raise RuntimeError("Real bridge registration failed: " + first["native_bridge"]["code"])
            assert first["native_document_id"] == digest
            assert first["native_bridge"]["verified_sha256"] == digest
            before = counts(data_root / "db/jobs.db")
            assert before == {"documents": 1, "uploads": 1, "jobs": 0}, before
            owned_stop(process)
            assert process.poll() is not None
            process = None
            disconnected = bridge.register(store, attachment["id"])
            assert not disconnected["reader_ready"]
            assert disconnected["native_bridge"]["code"] == "NATIVE_SERVICE_UNAVAILABLE"
            process = start()
            fresh_bridge = NativeBridge(base_url, application_key)
            try:
                second = fresh_bridge.register(store, attachment["id"])
                if not second["reader_ready"]:
                    raise RuntimeError("Reopened native document verification failed: " + second["native_bridge"]["code"])
                after = counts(data_root / "db/jobs.db")
                assert after == before, (before, after)
                assert store.attachment_path(attachment["id"]).read_bytes() == raw
                print(json.dumps({
                    "ok": True, "binary": str(binary), "owned_processes": len(spawned_pids),
                    "source_sha256_verified": True, "native_reader_ready": True,
                    "disconnected_reader_ready": False, "restart_reused_existing_document": True,
                    "before_counts": before, "after_counts": after,
                    "data_mode": "synthetic-temporary", "real_library_accessed": False,
                    "model_or_ocr_jobs_started": False,
                }, ensure_ascii=False))
            finally:
                fresh_bridge.close()
        except BaseException:
            logs.flush()
            # This log was generated by our child in our temporary root. Never print keys.
            excerpt = log_path.read_text(errors="replace")[-3500:].replace(application_key, "[redacted]")
            if excerpt:
                print("Owned synthetic Rust log:\n" + excerpt, file=sys.stderr)
            raise
        finally:
            owned_stop(process)
            bridge.close()
            store.close()
            logs.close()
        assert all(process_id > 0 for process_id in spawned_pids)
        print("Only owned Popen processes stopped; synthetic temporary directories removed on exit.")


if __name__ == "__main__":
    main()
