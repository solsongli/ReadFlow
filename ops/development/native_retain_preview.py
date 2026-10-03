#!/usr/bin/env python3
"""Run the original Electron shell with a new owned profile and existing runtimes."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

REPO = Path(__file__).resolve().parents[2]
DESKTOP = REPO / "frontend/desktop"
SOURCE = DESKTOP / "linux/linux-unpacked"
ROOT = REPO / ".retain-native-preview"
OWNER = {"application": "retainpdf-native-preview", "schema_version": 1}


def own_root() -> Path:
    if ROOT.is_symlink():
        raise ValueError("预览根目录不能是符号链接。")
    ROOT.mkdir(exist_ok=True)
    marker = ROOT / "preview-owner.json"
    if marker.is_symlink():
        raise ValueError("预览归属标记不能是符号链接。")
    if marker.exists():
        if marker.stat().st_size > 1024 or json.loads(marker.read_text()) != OWNER:
            raise ValueError("已有目录不属于本原壳预览。")
    else:
        if any(ROOT.iterdir()):
            raise ValueError("目录已有未知内容，未使用或覆盖。")
        with marker.open("x") as stream:
            json.dump(OWNER, stream)
        with (ROOT / ".gitignore").open("x") as stream:
            stream.write("*\n!.gitignore\n")
    return ROOT


def tick(pid: int) -> str | None:
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return None if fields[0] == "Z" else fields[19]
    except (OSError, IndexError):
        return None


def state(root: Path) -> dict | None:
    file = root / "process.json"
    if file.is_symlink():
        raise ValueError("进程记录不能是符号链接。")
    if not file.exists():
        return None
    if file.stat().st_size > 8192:
        raise ValueError("进程记录不是本程序的有效状态。")
    value = json.loads(file.read_text())
    if not isinstance(value, dict) or value.get("application") != OWNER["application"] or type(value.get("pid")) is not int or value["pid"] <= 1:
        raise ValueError("拒绝不属于本预览的进程记录。")
    return value


def alive(value: dict | None) -> bool:
    if not value or tick(value["pid"]) != value.get("start_ticks"):
        return False
    try:
        executable = Path(f"/proc/{value['pid']}/exe").readlink()
        expected = ROOT / "runtime/retain-pdf-desktop"
        command = Path(f"/proc/{value['pid']}/cmdline").read_bytes().decode().replace("\0", " ")
        # Electron may combine argv into its process title on Linux. The kernel
        # executable and start stamp remain authoritative, unlike argv[0].
        return executable == expected and "--user-data-dir=" + str(ROOT / "profile/chromium") in command
    except (OSError, UnicodeError):
        return False


def hardlink(source: str, target: str) -> str:
    try:
        os.link(source, target)
    except OSError:
        shutil.copy2(source, target)
    return target


def prepare(root: Path) -> Path:
    if alive(state(root)):
        raise ValueError("原壳预览仍在运行；请先 stop，避免替换运行中的程序资产。")
    binary = SOURCE / "retain-pdf-desktop"
    if not binary.is_file():
        raise ValueError("缺少现有Linux Electron运行文件；不会自动安装。")
    runtime = root / "runtime"
    runtime.mkdir(exist_ok=True)
    for source in SOURCE.iterdir():
        if source.name == "resources":
            continue
        target = runtime / source.name
        if target.is_symlink():
            raise ValueError("运行资源不能被其他符号链接替换。")
        if source.is_dir():
            if not target.exists():
                shutil.copytree(source, target, copy_function=hardlink, symlinks=True)
        elif not target.exists():
            hardlink(str(source), str(target))
    resources = runtime / "resources"
    resources.mkdir(exist_ok=True)
    backend = resources / "backend"
    expected = SOURCE / "resources/backend"
    if backend.exists() or backend.is_symlink():
        if not backend.is_symlink() or backend.resolve() != expected.resolve():
            raise ValueError("已有backend资源不是本程序登记的只读程序链接。")
    else:
        backend.symlink_to(expected, target_is_directory=True)
    app = resources / "app"
    app.mkdir(exist_ok=True)
    # Refresh only our generated program files; keep profile/data independent.
    for name in ["main.js", "preload.js", "splash.html", "package.json"]:
        shutil.copy2(DESKTOP / name, app / name)
    for name in ["src/main", "assets"]:
        shutil.copytree(DESKTOP / name, app / name, dirs_exist_ok=True)
    web = REPO / "frontend/web"
    target = app / "app/frontend"
    target.mkdir(parents=True, exist_ok=True)
    # Delete obsolete generated HTML and bundles; never touch the profile/data.
    for old_page in target.glob("*.html"):
        if old_page.name not in {"workbench.html", "reader.html"}:
            old_page.unlink()
    for name in ["dist", "decor", "src/assets"]:
        if (target / name).is_dir():
            shutil.rmtree(target / name)
    (target / "styles.css").unlink(missing_ok=True)
    for name in ["reader.html", "workbench.html", "runtime-config.js"]:
        shutil.copy2(web / name, target / name)
    # Never copy an existing local runtime config, user keys or desktop state.
    (target / "runtime-config.local.js").write_text("// Empty isolated preview override.\n")
    for name in ["dist", "vendor", "src/assets"]:
        source = web / name
        if source.is_dir():
            shutil.copytree(source, target / name, dirs_exist_ok=True)
    print("已准备原Electron壳与原Web入口；复用现有运行文件，没有安装依赖。")
    return runtime / "retain-pdf-desktop"


def url(value: dict | None) -> str | None:
    if not value:
        return None
    file = Path(value.get("log", ""))
    if file.parent != ROOT or not file.name.startswith("native-") or file.is_symlink() or not file.is_file():
        return None
    with file.open("rb") as stream:
        stream.seek(max(0, file.stat().st_size - 65536))
        log = stream.read().decode("utf-8", "replace")
    found = re.findall(r"local gateway listening on (http://127\.0\.0\.1:\d+)", log)
    return found[-1] + "/workbench.html" if found else None


def ready(value: dict | None) -> bool:
    location = url(value)
    if not alive(value) or not location:
        return False
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(location, timeout=1) as response:
            return response.status == 200
    except OSError:
        return False


def stop(root: Path, value: dict | None) -> None:
    if not alive(value):
        print("没有本预览登记的存活主进程；未停止其他应用。")
        return
    owned = []
    def visit(pid: int, expected_parent: int | None = None, expected_ticks: str | None = None):
        try:
            fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
            stamp, parent = fields[19], int(fields[1])
            if fields[0] == "Z" or (expected_parent is not None and parent != expected_parent):
                return
            if expected_ticks is not None and stamp != expected_ticks:
                return
        except (OSError, IndexError, ValueError):
            return
        owned.append((pid, stamp))
        try:
            children = Path(f"/proc/{pid}/task/{pid}/children").read_text().split()
        except OSError:
            return
        for child in children:
            visit(int(child), expected_parent=pid)
    visit(value["pid"], expected_ticks=value["start_ticks"])
    # Only this verified preview and descendants are eligible for termination.
    for pid, stamp in owned:
        if tick(pid) == stamp:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    deadline = time.monotonic() + 10
    while any(tick(pid) == stamp for pid, stamp in owned) and time.monotonic() < deadline:
        time.sleep(.1)
    if any(tick(pid) == stamp for pid, stamp in owned):
        raise ValueError("预览进程未完全退出，未强杀或覆盖程序。")
    (root / "process.json").unlink(missing_ok=True)
    print("原壳预览已停止，新文献库和笔记保留。")


def main() -> int:
    parser = argparse.ArgumentParser(description="手动启动原RetainPDF壳的隔离文献管理预览；不设置自启。")
    parser.add_argument("action", choices=["prepare", "start", "status", "stop", "restart"])
    parser.add_argument("--no-sandbox", action="store_true", help="仅当本机Electron沙箱不可用时显式选择")
    parser.add_argument("--connector", action="store_true", help="显式启用实验性Connector端口，冲突时不抢占")
    parser.add_argument("--debug-port", type=int, help="仅本机隔离preview浏览器验收端口，默认不开放")
    parser.add_argument("--allow-ocr-download", action="store_true", help="显式允许固定清单的本地OCR模块下载；默认关闭")
    parser.add_argument("--allow-external-models", action="store_true", help="显式允许用户配置的模型调用；可能外发所选原文并产生费用，默认关闭")
    options = parser.parse_args()
    if options.debug_port is not None and not 1024 <= options.debug_port <= 65535:
        parser.error("调试端口需在1024至65535之间。")
    try:
        root = own_root()
        value = state(root)
        if options.action == "status":
            print(json.dumps({"alive": alive(value), "ready": ready(value), "pid": value["pid"] if value else None,
                              "url": url(value), "profile": str(root / "profile")}, ensure_ascii=False))
            return 0 if ready(value) else 1
        if options.action in {"stop", "restart"}:
            stop(root, value)
        if options.action in {"prepare", "start", "restart"}:
            if options.action == "start" and alive(state(root)):
                print("原壳预览已运行：" + (url(state(root)) or "正在启动"))
                return 0
            executable = prepare(root)
            if options.action == "prepare":
                return 0
            profile = root / "profile"
            for name in ["config", "cache", "state", "chromium"]:
                (profile / name).mkdir(parents=True, exist_ok=True)
            env = {**os.environ, "XDG_CONFIG_HOME": str(profile / "config"),
                   "XDG_CACHE_HOME": str(profile / "cache"), "XDG_STATE_HOME": str(profile / "state"),
                   "RETAIN_PDF_RESEARCH_LIBRARY": "1", "RETAIN_PDF_OFFLINE_LIBRARY_PREVIEW": "1",
                   "RETAIN_PDF_ALLOW_OCR_DOWNLOAD": "1" if options.allow_ocr_download else "0",
                   "RETAIN_PDF_ALLOW_EXTERNAL_MODELS": "1" if options.allow_external_models else "0",
                   "RETAIN_PDF_RESEARCH_CODE_ROOT": str(REPO), "RETAIN_PDF_START_PAGE": "workbench.html",
                   "RETAIN_PDF_PREVIEW_API_PORT": "41060", "RETAIN_PDF_PREVIEW_GATEWAY_PORT": "40061",
                   "RETAIN_PDF_PREVIEW_JOBS_PORT": "41062", "RETAIN_PDF_PREVIEW_SIMPLE_PORT": "42060",
                   "RETAIN_PDF_PREVIEW_AI_PORT": "41160", "RETAIN_PDF_RESEARCH_CONNECTOR_PORT": "23119" if options.connector else ""}
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            log = root / f"native-{stamp}.log"
            args = [str(executable), "--user-data-dir=" + str(profile / "chromium")]
            if options.debug_port is not None:
                args.extend(["--remote-debugging-address=127.0.0.1", "--remote-debugging-port=" + str(options.debug_port)])
            if options.no_sandbox:
                args.append("--no-sandbox")
            with log.open("xb") as stream:
                child = subprocess.Popen(args, cwd=root / "runtime", env=env, stdin=subprocess.DEVNULL,
                                         stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
            value = {"application": OWNER["application"], "pid": child.pid, "start_ticks": tick(child.pid), "log": str(log)}
            (root / "process.json").write_text(json.dumps(value))
            deadline = time.monotonic() + 50
            while time.monotonic() < deadline:
                if child.poll() is not None:
                    raise ValueError(f"原壳启动退出；请检查本预览日志 {log}。")
                if ready(value):
                    print("原RetainPDF界面已就绪：" + url(value))
                    print(f"独立profile：{profile}；关闭窗口隐藏到原托盘，stop显式退出。")
                    return 0
                time.sleep(.2)
            raise ValueError(f"50秒内尚未就绪，进程记录保留；请运行 status 或查看 {log}。")
        return 0
    except (OSError, ValueError) as error:
        print("原壳预览失败：" + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
