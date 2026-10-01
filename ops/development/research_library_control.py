#!/usr/bin/env python3
"""Explicit local preview start/status/stop; no system autostart or dependency install."""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

SCRIPT = Path(__file__).with_name("research_library.py").resolve()
spec = importlib.util.spec_from_file_location("research_preview_launcher", SCRIPT)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)
ROLE = "retainpdf-research-preview-control"


def process_stamp(pid: int) -> str | None:
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return None if fields[0] == "Z" else fields[19]
    except (OSError, IndexError):
        return None


def read_state(file: Path, root: Path, port: int) -> dict | None:
    if file.is_symlink():
        raise ValueError("控制状态不能是符号链接。")
    if not file.exists():
        return None
    if file.stat().st_size > 8192:
        raise ValueError("控制状态文件不是本程序的有效记录。")
    state = json.loads(file.read_text())
    if not isinstance(state, dict) or state.get("application") != ROLE or state.get("script") != str(SCRIPT) or state.get("data_root") != str(root) or state.get("port") != port:
        raise ValueError("已有控制状态不属于本预览；不会覆盖或停止任何进程。")
    if type(state.get("pid")) is not int or state["pid"] <= 1 or not isinstance(state.get("start_ticks"), str):
        raise ValueError("控制进程身份记录无效。")
    return state


def owned_process(state: dict | None) -> bool:
    if not state or process_stamp(state["pid"]) != state["start_ticks"]:
        return False
    try:
        args = Path(f"/proc/{state['pid']}/cmdline").read_bytes().decode().strip("\0").split("\0")
        return (str(SCRIPT) in args and args[args.index("--port") + 1] == str(state["port"])
                and args[args.index("--data-root") + 1] == state["data_root"])
    except (OSError, ValueError, IndexError, UnicodeError):
        return False


def health(port: int) -> bool:
    try:
        # Never route localhost checks through environment HTTP proxies.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f"http://127.0.0.1:{port}/healthz", timeout=1) as response:
            value = json.loads(response.read(4096))
        return value.get("ok") is True and value.get("data_mode") == "isolated"
    except (OSError, ValueError):
        return False


@contextmanager
def control_lock(root: Path, port: int):
    lock = root / f"preview-control-{port}.lock"
    if lock.is_symlink() or (lock.exists() and lock.stat().st_size):
        raise ValueError("控制锁路径已被其他内容占用。")
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o666)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def stop(state: dict | None, state_file: Path) -> None:
    if not owned_process(state):
        print("没有本启动器登记的存活进程；未停止其他服务。")
        return
    os.kill(state["pid"], signal.SIGTERM)
    deadline = time.monotonic() + 10
    while owned_process(state) and time.monotonic() < deadline:
        time.sleep(0.1)
    if owned_process(state):
        raise ValueError("进程尚未退出；未强杀。请查看日志，不要同时打开第二个写入进程。")
    if not state_file.is_symlink() and state_file.exists() and json.loads(state_file.read_text()) == state:
        state_file.unlink()
    print("本预览已正常停止，数据目录保留。")


def start(root: Path, port: int, state_file: Path, state: dict | None, demo: bool) -> None:
    if owned_process(state):
        if not health(port):
            raise ValueError("登记进程存活但服务未就绪；请检查日志或显式 restart。")
        print(f"预览已运行，PID {state['pid']}。")
        return
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            raise ValueError(f"端口 {port} 已被其他或未登记服务占用；未杀进程。可选择另一个 --port。") from None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    log = root / f"preview-{port}-{stamp}.log"
    args = [sys.executable, "-B", str(SCRIPT), "--data-root", str(root), "--port", str(port)]
    if demo:
        args.append("--demo")
    with log.open("xb") as stream:
        child = subprocess.Popen(args, cwd=launcher.REPO, stdin=subprocess.DEVNULL,
                                 stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
    state = {"application": ROLE, "script": str(SCRIPT), "data_root": str(root),
             "port": port, "pid": child.pid, "start_ticks": process_stamp(child.pid),
             "created_at": stamp, "log": str(log)}
    if not state["start_ticks"]:
        raise ValueError(f"启动进程立即退出，请查看 {log}。")
    temporary = root / f"preview-control-{port}-{child.pid}.tmp"
    with temporary.open("x") as stream:
        json.dump(state, stream)
    os.replace(temporary, state_file)
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if child.poll() is not None:
            raise ValueError(f"预览进程启动失败，请查看 {log}。")
        if health(port):
            print(f"后台预览已就绪，PID {child.pid}；终端关闭后继续运行。")
            print(f"日志：{log}")
            return
        time.sleep(0.2)
    raise ValueError(f"30秒内未就绪，进程记录已保留。请查看 {log} 或运行 status/stop。")


def main() -> int:
    parser = argparse.ArgumentParser(description="手动管理独立本地预览，不设置开机自启。")
    parser.add_argument("action", choices=["start", "status", "stop", "restart"])
    parser.add_argument("--port", type=int, default=41030)
    parser.add_argument("--data-root", type=Path, default=launcher.DEFAULT_DATA_ROOT)
    parser.add_argument("--demo", action="store_true", help="仅空库添加合成演示")
    parser.add_argument("--open", action="store_true", help="服务就绪后在本机默认浏览器打开")
    options = parser.parse_args()
    if not 1024 <= options.port <= 65535:
        parser.error("端口需在1024至65535之间。")
    if options.action in {"status", "stop"} and not options.data_root.expanduser().exists():
        print("未找到本预览的数据目录。")
        return 1 if options.action == "status" else 0
    try:
        root = launcher.prepare_data_root(options.data_root)
        file = root / f"preview-control-{options.port}.json"
        url = f"http://127.0.0.1:{options.port}/"
        with control_lock(root, options.port):
            state = read_state(file, root, options.port)
            if options.action == "status":
                ready = owned_process(state) and health(options.port)
                print(json.dumps({"ready": ready, "managed_process_alive": owned_process(state),
                                  "pid": state["pid"] if state else None, "url": url,
                                  "data_root": str(root)}, ensure_ascii=False))
                return 0 if ready else 1
            if options.action in {"stop", "restart"}:
                stop(state, file)
            if options.action in {"start", "restart"}:
                start(root, options.port, file, read_state(file, root, options.port), options.demo)
                print(f"请在 R9000P 本机浏览器打开：{url}")
                if options.open:
                    subprocess.Popen(["xdg-open", url], stdin=subprocess.DEVNULL,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     start_new_session=True)
        return 0
    except (OSError, ValueError) as error:
        print("预览控制失败：" + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
