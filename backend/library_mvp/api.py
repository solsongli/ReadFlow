"""HTTP adapter for the isolated local research library."""
from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response

from .store import MAX_PDF_BYTES, Store, StoreError
from .native_bridge import NativeBridge, unavailable as native_unavailable

MAX_JSON_BYTES = 20 * 1024 * 1024


async def body_bytes(request: Request, limit: int, expected: str) -> bytes:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != expected:
        raise StoreError("UNSUPPORTED_CONTENT_TYPE", f"Use Content-Type: {expected}.", 415)
    chunks, length = [], 0
    async for chunk in request.stream():
        length += len(chunk)
        if length > limit:
            raise StoreError("REQUEST_TOO_LARGE", "The request exceeds the local import size limit.", 413)
        chunks.append(chunk)
    return b"".join(chunks)


async def json_body(request: Request) -> dict:
    raw = await body_bytes(request, MAX_JSON_BYTES, "application/json")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, ValueError) as exc:
        raise StoreError("INVALID_JSON", "The request body is not valid JSON.") from exc
    if not isinstance(value, dict):
        raise StoreError("INVALID_JSON", "The request body must be a JSON object.")
    return value


def create_app(data_root: Path, *, bridge: NativeBridge | None = None,
               allow_ocr_download: bool = False, allow_external_models: bool = False,
               ocr_manifest_path: Path | None = None) -> FastAPI:
    store = Store(data_root)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            yield
        finally:
            # Cancel consumers before closing the SQLite connection they share.
            agent_stopped = await asyncio.to_thread(app.state.library_agent.close)
            await asyncio.to_thread(app.state.ocr_jobs.close)
            await asyncio.to_thread(app.state.ocr_modules.close)
            if agent_stopped:
                store.close()
            if getattr(app.state, "workbench_translation", None) is not None:
                app.state.workbench_translation.close()
            if bridge is not None:
                bridge.close()

    app = FastAPI(title="RetainPDF Research Library", version="0.1.0", lifespan=lifespan)
    app.state.store = store
    app.state.native_bridge = bridge

    def attachment_view(attachment: dict) -> dict:
        native = bridge.cached(attachment) if bridge is not None else native_unavailable(attachment["id"])
        return {**attachment, **native}

    def item_view(item: dict) -> dict:
        return {**item, "attachments": [attachment_view(attachment) for attachment in item["attachments"]]}

    def registration_view(attachment_id: str, state: dict) -> dict:
        attachment = store.get_attachment(attachment_id)
        return {"item": item_view(store.get_item(attachment["item_id"])),
                "attachment": {**attachment, **state},
                "native_bridge": state["native_bridge"], "partial_failure": not state["reader_ready"]}

    @app.exception_handler(StoreError)
    async def store_error(request: Request, exc: StoreError):
        return JSONResponse({"error": {"code": exc.code, "message": str(exc)}}, status_code=exc.status)

    @app.get("/api/research/healthz")
    @app.get("/healthz")
    def healthz():
        return {"ok": True, "version": "0.1.0", "data_mode": "isolated", "ai": {"status": "not-verified"}}

    @app.get("/api/research/items")
    def list_items(query: str = "", collection_id: str | None = None):
        result = store.list_items(query=query, collection_id=collection_id)
        return {**result, "items": [item_view(item) for item in result["items"]]}

    @app.get("/api/research/items/{item_id}")
    def get_item(item_id: str):
        return item_view(store.get_item(item_id))

    @app.post("/api/research/items", status_code=201)
    async def create_item(request: Request):
        return item_view(store.create_item(await json_body(request)))

    @app.patch("/api/research/items/{item_id}")
    async def update_item(item_id: str, request: Request):
        return item_view(store.update_item(item_id, await json_body(request)))

    @app.post("/api/research/collections", status_code=201)
    async def create_collection(request: Request):
        return store.create_collection(await json_body(request))

    @app.patch("/api/research/collections/{collection_id}")
    async def update_collection(collection_id: str, request: Request):
        return store.update_collection(collection_id, await json_body(request))

    @app.post("/api/research/files", status_code=201)
    async def upload_pdf(request: Request, filename: str = "paper.pdf", item_id: str | None = None):
        raw = await body_bytes(request, MAX_PDF_BYTES, "application/pdf")
        result = store.add_pdf(raw, filename=filename, item_id=item_id)
        attachment_id = result["attachment"]["id"]
        state = (await asyncio.to_thread(bridge.register, store, attachment_id)
                 if bridge is not None else native_unavailable(attachment_id))
        return {**result, **registration_view(attachment_id, state)}

    @app.get("/api/research/attachments/{attachment_id}/native-reader")
    def native_reader_status(attachment_id: str):
        attachment = store.get_attachment(attachment_id)
        state = bridge.cached(attachment) if bridge is not None else native_unavailable(attachment_id)
        return registration_view(attachment_id, state)

    @app.post("/api/research/attachments/{attachment_id}/native-reader")
    async def prepare_native_reader(attachment_id: str, request: Request):
        body = await json_body(request)
        if body:
            raise StoreError("INVALID_NATIVE_REGISTRATION", "Native reader registration accepts an empty JSON object.")
        store.get_attachment(attachment_id)
        state = (await asyncio.to_thread(bridge.register, store, attachment_id)
                 if bridge is not None else native_unavailable(attachment_id))
        result = registration_view(attachment_id, state)
        return JSONResponse(result, status_code=200 if state["reader_ready"] else 503 if bridge is None else 502)

    @app.get("/api/research/attachments/{attachment_id}/pdf")
    def read_pdf(attachment_id: str):
        attachment = store.get_attachment(attachment_id)
        return FileResponse(store.attachment_path(attachment_id), media_type="application/pdf",
                            filename=attachment["filename"], content_disposition_type="inline",
                            headers={"X-PDF-SHA256": attachment["sha256"], "Cache-Control": "private, no-cache"})

    @app.get("/api/research/attachments/{attachment_id}/pages")
    def read_pages(attachment_id: str):
        return store.get_pages(attachment_id)

    @app.post("/api/research/items/{item_id}/notes", status_code=201)
    async def create_note(item_id: str, request: Request):
        return store.create_note(item_id, await json_body(request))

    @app.patch("/api/research/notes/{note_id}")
    async def update_note(note_id: str, request: Request):
        return store.update_note(note_id, await json_body(request))

    @app.delete("/api/research/notes/{note_id}", status_code=204)
    def delete_note(note_id: str):
        store.delete_note(note_id)
        return Response(status_code=204)

    @app.get("/api/research/items/{item_id}/export")
    def export_item(item_id: str, format: str = "markdown"):
        content, media_type, filename = store.export_item(item_id, format)
        return Response(content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})

    @app.post("/api/research/imports/preview")
    async def preview_import(request: Request):
        from .zotero import build_import_plan
        try:
            return build_import_plan(await json_body(request))
        except StoreError:
            raise
        except ValueError as exc:
            raise StoreError(getattr(exc, "code", "INVALID_IMPORT"), str(exc)) from exc

    @app.post("/api/research/imports/commit")
    async def commit_import(request: Request):
        from .zotero import build_import_plan
        body = await json_body(request)
        if set(body) != {"payload", "plan_hash"}:
            raise StoreError("INVALID_IMPORT", "Commit requires payload and the reviewed plan_hash.")
        try:
            plan = build_import_plan(body["payload"])
        except ValueError as exc:
            raise StoreError(getattr(exc, "code", "INVALID_IMPORT"), str(exc)) from exc
        if body["plan_hash"] != plan["plan_hash"]:
            raise StoreError("IMPORT_PLAN_CHANGED", "Import preview no longer matches the submitted data. Preview it again.", 409)
        return store.commit_import(plan)

    @app.get("/api/research/imports/zotero-local/preview")
    def preview_local_zotero(source_namespace: str | None = None):
        from .zotero import build_import_plan, fetch_local_snapshot
        try:
            payload = fetch_local_snapshot(source_namespace=source_namespace)
            return {"payload": payload, "plan": build_import_plan(payload)}
        except ValueError as exc:
            raise StoreError(getattr(exc, "code", "ZOTERO_UNAVAILABLE"), str(exc), 503) from exc

    @app.post("/api/research/imports/{batch_id}/rollback")
    async def rollback_import(batch_id: str, request: Request):
        # The explicit empty JSON body is part of the same-origin write contract.
        body = await json_body(request)
        if body:
            raise StoreError("INVALID_ROLLBACK", "Rollback accepts an empty JSON object.")
        result = store.rollback_import(batch_id)
        return JSONResponse(result, status_code=200 if result["rolled_back"] else 409)

    from .evidence import register_evidence_routes
    register_evidence_routes(app, store)
    from .workbench import register_workbench_routes
    translation_status = None
    if bridge is not None:
        from .workbench_translation import TranslationStatus
        translation_status = TranslationStatus(bridge.document_jobs)
    app.state.workbench_translation = translation_status
    register_workbench_routes(app, store, json_body, translations=translation_status.states if translation_status else None)
    from .agent_service import register_agent_routes
    from .ocr_jobs import register_ocr_routes
    register_agent_routes(app, store, allow_external_models=allow_external_models)
    register_ocr_routes(app, store, allow_download=allow_ocr_download, manifest_path=ocr_manifest_path)

    return app
