"""Explicit, cancellable overview over the existing reader AI runtime and consent policy."""
import asyncio
import hashlib
import json
from fastapi import Request
from fastapi.responses import StreamingResponse, Response
from starlette.background import BackgroundTask
from .store import StoreError, now
from .reader_assistance_model import target, provider
from .reader_overview_model import overview_context, overview_messages, validate_overview


class ReaderOverview:
    def __init__(self, assistance, blocks):
        self.ai, self.blocks = assistance, blocks
        self.store = assistance.store
        with self.store.lock:
            self.store.db.execute(
                """CREATE TABLE IF NOT EXISTS reader_overviews (
                item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
                result TEXT, consent_target TEXT NOT NULL DEFAULT ''
            )"""
            )

    def load(self, item):
        self.store.get_item(item)
        with self.store.lock:
            row = self.store.db.execute("SELECT * FROM reader_overviews WHERE item_id=?", (item,)).fetchone()
        return {
            "result": json.loads(row["result"]) if row and row["result"] else None,
            "consent_target": row["consent_target"] if row else "",
        }

    def prepare(self, item, body):
        self.ai.gate()
        config = self.ai.config()
        fingerprint = target(config)
        if body.get("target") != fingerprint:
            raise StoreError("consent_changed", "服务配置已变化，请重新确认发送范围。", 409)
        previous = self.load(item)
        if body.get("consent") is not True and previous["consent_target"] != fingerprint:
            raise StoreError("consent_required", "请先确认发送速览所需的摘要和论文片段。", 409)
        entry = self.blocks.storage.attachment(item, body.get("attachment_id"))
        with self.ai.lock:
            if item in self.ai.busy or len(self.ai.busy) >= 2:
                raise StoreError("reader_busy", "已有回答正在生成，请稍后重试。", 409)
            self.ai.busy.add(item)
        try:
            with self.blocks.pdf_lock:
                document = self.blocks.storage.extract(entry)
            context = overview_context(self.store.get_item(item), document)
            evidence = {e["page"] for e in context["excerpts"]}
            if not evidence:
                raise StoreError("overview_empty", "尚未识别到论文文字，请先进行本地 OCR。", 409)
            with self.store.transaction():
                self.store.db.execute("INSERT OR IGNORE INTO reader_overviews(item_id) VALUES(?)", (item,))
                if body.get("remember") is True:
                    self.store.db.execute(
                        "UPDATE reader_overviews SET consent_target=? WHERE item_id=?", (fingerprint, item)
                    )

            def complete(answer):
                sections = validate_overview(answer, len(document.get("pages", [])) or entry["page_count"], evidence)
                value = {
                    "sections": sections,
                    "target": fingerprint,
                    "attachment_id": entry["id"],
                    "created_at": now(),
                    "pages": sorted(evidence),
                    "service": provider(config),
                    "model": config["model"],
                    "context_hash": hashlib.sha256(json.dumps(context).encode()).hexdigest(),
                }
                with self.store.transaction():
                    self.store.db.execute(
                        "UPDATE reader_overviews SET result=? WHERE item_id=?",
                        (json.dumps(value, ensure_ascii=False), item),
                    )
                return json.dumps(value, ensure_ascii=False)

            return (config, overview_messages(context), 0, "", 1), complete
        except BaseException:
            config.clear()
            self.ai.release(item)
            raise


def register_reader_overview(app, store, json_body):
    service = ReaderOverview(app.state.reader_assistance, app.state.paper_blocks)
    app.state.reader_overview = service
    root = "/api/research/workbench/items/{item_id}/assistance/overview"

    @app.get(root)
    def load(item_id: str):
        return service.load(item_id)

    @app.post(root)
    async def generate(item_id: str, request: Request):
        prepared, complete = await asyncio.to_thread(service.prepare, item_id, await json_body(request))
        if await request.is_disconnected():
            prepared[0].clear()
            service.ai.release(item_id)
            return Response(status_code=204)
        return StreamingResponse(
            service.ai.stream(item_id, prepared, complete=complete),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store"},
            background=BackgroundTask(service.ai.release, item_id),
        )
