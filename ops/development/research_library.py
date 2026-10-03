#!/usr/bin/env python3
"""Run the isolated RetainPDF research-library preview without installing dependencies."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

REPO = Path(__file__).resolve().parents[2]
DEFAULT_DATA_ROOT = REPO / ".research-library-preview"
MARKER_VALUE = {"application": "retainpdf-research-library-launcher", "schema_version": 1}


def choose_runtime() -> None:
    required = ("fastapi", "uvicorn", "httpx", "pymupdf")
    if all(importlib.util.find_spec(name) is not None for name in required):
        return
    candidates = [
        REPO / "backend/.venv/bin/python3",
        REPO / "frontend/desktop/linux/linux-unpacked/resources/backend/python/bin/python3",
        REPO / "frontend/desktop/app/backend/python/bin/python3",
    ]
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            if candidate.resolve() == Path(sys.executable).resolve():
                continue
            os.execv(str(candidate), [str(candidate), "-I", "-B", str(Path(__file__).resolve()), *sys.argv[1:]])
    raise SystemExit("缺少现成Python运行时。未安装依赖；需要FastAPI、uvicorn、httpx和PyMuPDF。")


def prepare_data_root(root: Path) -> Path:
    absolute = root.expanduser().absolute()
    if absolute.is_symlink():
        raise ValueError("数据目录不能是符号链接。")
    resolved = absolute.resolve()
    allowed = (REPO, Path(tempfile.gettempdir()).resolve())
    if not any(resolved == base or base in resolved.parents for base in allowed):
        raise ValueError("本次预览只接受项目内的新目录或/tmp合成测试目录。")
    if resolved in allowed:
        raise ValueError("请选择独立子目录，不能使用项目根目录或/tmp根目录。")
    resolved.mkdir(parents=True, exist_ok=True)
    marker = resolved / "library-mvp.json"
    store_marker = resolved / "research-library.json"
    if marker.is_symlink() or store_marker.is_symlink():
        raise ValueError("数据目录标记不能是符号链接。")
    if marker.exists():
        if marker.stat().st_size > 1024 or json.loads(marker.read_text()) != MARKER_VALUE:
            raise ValueError("数据目录不属于本预览版本。")
    elif store_marker.exists():
        if store_marker.stat().st_size > 1024 or json.loads(store_marker.read_text()) != {
                "application": "retainpdf-research-library", "schema_version": 1}:
            raise ValueError("已有目录不属于本预览版本。")
        with marker.open("x", encoding="utf-8") as stream:
            json.dump(MARKER_VALUE, stream)
    else:
        if any(resolved.iterdir()):
            raise ValueError("目录已有未知内容；请选全新目录，本版不会自动迁移旧库。")
        with marker.open("x", encoding="utf-8") as stream:
            json.dump(MARKER_VALUE, stream)
    ignore = resolved / ".gitignore"
    if not ignore.exists():
        with ignore.open("x", encoding="utf-8") as stream:
            stream.write("*\n!.gitignore\n")
    return resolved


def build_frontend(force: bool = False, skip: bool = False) -> None:
    web = REPO / "frontend/web"
    entry = web / "dist/workbench.bundle.js"
    if not skip and (force or not entry.is_file()):
        subprocess.run(["npm", "run", "build"], cwd=web, check=True)
    if not entry.is_file():
        raise ValueError("缺少工作台构建产物；请运行 --build，不会安装依赖。")


def add_local_browser_guard(app, port: int) -> None:
    from fastapi import Request
    from fastapi.responses import JSONResponse
    from urllib.parse import urlsplit as split
    allowed_hosts = {"127.0.0.1", "localhost", "::1"}

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        origin = request.headers.get("origin")
        fetch_site = request.headers.get("sec-fetch-site")
        # A user following a link to the entry HTML must be able to open it.
        # Keep cross-origin API, resource, iframe and write requests blocked.
        entry_navigation = (request.method == "GET"
                            and request.url.path in {"/", "/workbench.html"}
                            and request.headers.get("sec-fetch-mode") == "navigate"
                            and request.headers.get("sec-fetch-dest") == "document")
        try:
            host = split("http://" + request.headers.get("host", "")).hostname
            denied = host not in allowed_hosts
            if origin:
                parsed = split(origin)
                target = split(str(request.url))
                cross_origin = (parsed.scheme != target.scheme
                                or parsed.netloc.lower() != target.netloc.lower())
                denied = denied or (cross_origin and not entry_navigation)
        except ValueError:
            denied = True
        if fetch_site in {"cross-site", "same-site"} and not entry_navigation:
            denied = True
        if denied:
            return JSONResponse({"error": {"code": "LOCAL_ORIGIN_REQUIRED",
                                "message": "此本地服务仅接受同源本机请求。"}}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        frame_ancestors = "'none'"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; "
            f"connect-src 'self'; frame-src 'self'; frame-ancestors {frame_ancestors}; base-uri 'none'; object-src 'none'"
        )
        response.headers["Cache-Control"] = "no-store"
        return response


def create_preview_app(data_root: Path, *, port: int = 41030):
    sys.path.insert(0, str(REPO / "backend"))
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles
    from library_mvp.api import create_app

    app = create_app(data_root)
    web = REPO / "frontend/web"
    app.mount("/dist", StaticFiles(directory=web / "dist"), name="workbench-assets")
    app.mount("/src/assets", StaticFiles(directory=web / "src/assets"), name="shared-assets")

    @app.get("/", include_in_schema=False)
    @app.get("/workbench.html", include_in_schema=False)
    def home():
        return FileResponse(web / "workbench.html")

    app.mount("/vendor", StaticFiles(directory=web / "vendor"), name="reader-vendor")

    @app.get("/runtime-config.js", include_in_schema=False)
    def runtime_config():
        return FileResponse(web / "runtime-config.js", media_type="text/javascript")

    add_local_browser_guard(app, port)
    return app


def synthetic_pdf() -> bytes:
    import pymupdf
    document = pymupdf.open()
    sections = [
        ("Reliable Research Reading - Synthetic Paper",
         "This synthetic paper tests evidence tracking.\n\n"
         "The proposed method keeps original PDF files immutable and binds every excerpt "
         "to a content hash, a parse revision, and a physical page.\n\n"
         "The measured accuracy is 92 percent on 20 synthetic examples.\n\n"
         "No real participants or private data were used."),
        ("Limitations and interpretation",
         "The numerical values in this document are fictional and only test the application.\n\n"
         "Scanned pages require OCR before source-grounded questions can be answered. "
         "The local preview stores bilingual notes without sending papers to a model.\n\n"
         "A citation should return to the original file, its parse revision, and its exact physical page.")
    ]
    for title, body in sections:
        page = document.new_page(width=595, height=842)
        page.insert_textbox(pymupdf.Rect(52, 55, 543, 132), title, fontsize=22, fontname="helv")
        page.insert_textbox(pymupdf.Rect(52, 154, 543, 742), body, fontsize=13, fontname="helv")
    document.set_metadata({"title": "Reliable Research Reading - Synthetic Paper",
                           "author": "Fictional Researcher"})
    result = document.tobytes()
    document.close()
    return result


async def seed_demo(app, port: int) -> None:
    import httpx
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                base_url=f"http://127.0.0.1:{port}") as client:
        existing = await client.get("/api/research/items")
        existing.raise_for_status()
        if existing.json()["items"]:
            print("已有文献，未重复添加演示样本。", flush=True)
            return
        collection = await client.post("/api/research/collections", json={"name": "合成演示", "parent_id": None})
        collection.raise_for_status()
        uploaded = await client.post("/api/research/files", params={"filename": "synthetic-reading.pdf"},
                                     content=synthetic_pdf(), headers={"Content-Type": "application/pdf"})
        uploaded.raise_for_status()
        value = uploaded.json()
        item, attachment = value["item"], value["attachment"]
        edited = await client.patch("/api/research/items/" + item["id"], json={
            "authors": ["Fictional Researcher"], "date": "2026-09-30",
            "tags": ["synthetic", "evidence"], "collection_ids": [collection.json()["id"]]})
        edited.raise_for_status()
        note = await client.post("/api/research/items/" + item["id"] + "/notes", json={
            "attachment_id": attachment["id"], "page_idx": 0,
            "quote": "The measured accuracy is 92 percent on 20 synthetic examples.",
            "translated_quote": "在20个合成样本上的准确率为92%（虚构数据，仅用于测试）。",
            "body": "演示笔记：引用与原文第一页相连，未调用真实AI。"})
        note.raise_for_status()
        print("已创建自写合成PDF及持久双语笔记；没有使用真实论文。", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="启动RetainPDF文献管理本地预览，不安装依赖或迁移旧库。")
    parser.add_argument("--port", type=int, default=41030)
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--build", action="store_true", help="用现有Node依赖重新构建独立前端")
    parser.add_argument("--no-build", action="store_true", help="跳过前端构建")
    parser.add_argument("--build-only", action="store_true")
    parser.add_argument("--demo", action="store_true", help="仅空预览库中添加自写合成PDF和笔记")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("端口需在1024至65535之间。")
    choose_runtime()
    try:
        build_frontend(force=args.build or args.build_only, skip=args.no_build)
        if args.build_only:
            return
        root = prepare_data_root(args.data_root)
        app = create_preview_app(root, port=args.port)
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        raise SystemExit("本地预览启动失败：" + str(exc)) from None
    if args.demo:
        import asyncio
        asyncio.run(seed_demo(app, args.port))
    print(f"RetainPDF本地文献预览：http://127.0.0.1:{args.port}/", flush=True)
    print(f"独立数据目录：{root}", flush=True)
    print("真实AI尚未验证；Ctrl+C停止后可备份整个独立数据目录。", flush=True)
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=args.port, proxy_headers=False, access_log=False)


if __name__ == "__main__":
    main()
