import re
import asyncio
from fastapi import Request
from fastapi.responses import FileResponse, Response
from .paper_blocks_service import BlockService
from .store import StoreError


def register_paper_blocks(app, store, json_body):
    service = BlockService(store, app.state.reader_assistance)
    app.state.paper_blocks = service
    root = "/api/research/workbench/items/{item_id}/blocks"

    @app.get(root)
    def status(item_id: str, attachment_id: str | None = None, language: str = "zh-CN"):
        return service.status(item_id, attachment_id, language)

    @app.post(root + "/extract", status_code=202)
    async def extract(item_id: str, request: Request):
        return service.start(item_id, await json_body(request), extraction=True)

    @app.patch(root + "/terms")
    async def terms(item_id: str, request: Request):
        return service.edit_terms(item_id, await json_body(request))

    @app.post(root + "/recheck")
    async def recheck(item_id: str, request: Request):
        from .paper_recheck import recheck
        return await asyncio.to_thread(recheck, service, item_id, await json_body(request))

    @app.post(root + "/translate", status_code=202)
    async def translate(item_id: str, request: Request):
        return service.start(item_id, await json_body(request))

    @app.post(root + "/render", status_code=202)
    async def render_cached(item_id: str, request: Request):
        body = await json_body(request)
        if set(body) - {"attachment_id", "language", "image_text", "density"}:
            raise StoreError("INVALID_FIELD", "本地排版只接受附件、语言和图内文字选项。")
        return service.start(item_id, body, render_only=True)

    @app.post(root + "/jobs/{identity}/cancel")
    def cancel(item_id: str, identity: str):
        return service.cancel(item_id, identity)

    @app.get(root + "/files/{name}")
    def file(item_id: str, name: str, attachment_id: str | None = None):
        if name not in {"translated.pdf", "translated-layout.pdf"} and not re.fullmatch(
            r"[a-f0-9]{24}\.(?:pdf|png)", name
        ):
            raise StoreError("NOT_FOUND", "文件不存在。", 404)
        entry = service.storage.attachment(item_id, attachment_id)
        path = service.storage.directory(entry) / name
        if not path.is_file():
            raise StoreError("NOT_FOUND", "文件尚未生成。", 404)
        return FileResponse(
            path,
            media_type="image/png" if name.endswith(".png") else "application/pdf",
            headers={"Cache-Control": "private, no-cache"},
        )

    @app.get(root + "/latex")
    def latex(item_id: str, attachment_id: str | None = None):
        return Response(
            service.export(item_id, attachment_id),
            media_type="application/zip",
            headers={"Content-Disposition": 'attachment; filename="ReadFlow-LaTeX.zip"'},
        )
