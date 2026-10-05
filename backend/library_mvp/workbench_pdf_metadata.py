"""Read-only PDF proposals and atomic, explicit application of missing bibliographic fields."""
import hashlib
import json
import pymupdf as fitz
from fastapi import Request
from .pdf_metadata import suggest_pdf_metadata, useful
from .pdf_identity import filename_title, placeholder_author
from .pdf_title_tex import normalize_title
from .store import StoreError, now
from .workbench_model import venue_from_source

FIELDS = ("title", "authors", "doi", "url", "date", "venue")


def snapshot(store, item_id):
    with store.lock:
        item = store.get_item(item_id)
        state = store.db.execute("SELECT venue FROM item_state WHERE item_id=?", (item_id,)).fetchone()
        source = store.db.execute(
            "SELECT raw_source_json FROM source_links WHERE entity_id=? AND entity_type='item' ORDER BY source_id LIMIT 1",
            (item_id,),
        ).fetchone()
        try:
            raw = json.loads(source[0]) if source else None
        except (ValueError, TypeError):
            raw = None
        current = {key: item[key] for key in FIELDS if key != "venue"}
        current["venue"] = (state[0] if state else "") or venue_from_source(raw, doi=item["doi"], url=item["url"])
        attachment = next(iter(item["attachments"]), None)
        return {"fields": current, "updated_at": item["updated_at"], "attachment": attachment}


def cached_title(store, attachment, candidate):
    root = store.data_root / "paper-blocks" / attachment["sha256"]
    manifest = root / "blocks.json"
    if (
        root.is_symlink()
        or root.parent.is_symlink()
        or manifest.is_symlink()
        or not manifest.is_file()
        or manifest.stat().st_size >= 16_000_000
    ):
        return candidate
    try:
        data = json.loads(manifest.read_text())
        titles = [b for b in data.get("blocks", []) if b.get("type") == "title" and b.get("page") == 1]
        if (
            len(titles) == 1
            and candidate["confidence"] < 0.85
            and titles[0].get("confidence", 0) >= 0.9
            and useful(titles[0].get("text"), 500)
            and not filename_title(titles[0]["text"], attachment["filename"])
        ):
            return {
                "value": normalize_title(titles[0]["text"]),
                "confidence": titles[0]["confidence"],
                "source": "cached_title_block",
            }
    except (ValueError, OSError, TypeError, KeyError):
        pass
    return candidate


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def proposal(store, item_id):
    before = snapshot(store, item_id)
    current, attachment = before["fields"], before["attachment"]
    if not attachment:
        return {"eligible": False, "title": None, "changes": [], "token": None}, before
    with fitz.open(store.attachment_path(attachment["id"])) as document:
        value = suggest_pdf_metadata(document, attachment["filename"])
        native_title = (document.metadata or {}).get("title", "")
        trusted = useful(native_title, 1000) and not filename_title(native_title, attachment["filename"])
    candidate = cached_title(
        store,
        attachment,
        {
            "value": value["fields"]["title"],
            "confidence": 1.0 if trusted else value["title"]["confidence"],
            "source": "pdf_metadata" if trusted else value["title"]["source"],
        },
    )
    updates = {}
    if filename_title(current["title"], attachment["filename"]) and candidate["confidence"] >= 0.85:
        updates["title"] = candidate["value"]
    if not current["authors"] or all(placeholder_author(a) for a in current["authors"]):
        if value["authors"]["confidence"] >= 0.85 and value["fields"]["authors"]:
            updates["authors"] = value["fields"]["authors"]
    if value["arxiv"]:
        for field in ("doi", "url", "date", "venue"):
            if not current[field].strip():
                updates[field] = value["arxiv"][field]
    changes = [
        {"field": key, "before": current[key], "after": updates[key]}
        for key in FIELDS
        if key in updates and updates[key] != current[key]
    ]
    return {
        "eligible": bool(changes),
        "title": candidate,
        "current_title": current["title"],
        "changes": changes,
        "token": fingerprint([before, changes]),
    }, before


def apply_metadata(store, item_id, token):
    value, before = proposal(store, item_id)
    if not value["eligible"] or value["token"] != token:
        raise StoreError("METADATA_CHANGED", "信息或识别建议已更新，请重新打开详情后核对。", 409)
    with store.transaction():
        if snapshot(store, item_id) != before:
            raise StoreError("METADATA_CHANGED", "信息已被修改，请重新打开详情后核对。", 409)
        updates = {change["field"]: change["after"] for change in value["changes"]}
        venue = updates.pop("venue", None)
        metadata = store._metadata(updates, partial=True)
        if metadata:
            store._write_item(item_id, metadata)
        if venue is not None:
            store.db.execute(
                "INSERT INTO item_state(item_id,venue,updated_at) VALUES(?,?,?) "
                "ON CONFLICT(item_id) DO UPDATE SET venue=excluded.venue,updated_at=excluded.updated_at",
                (item_id, venue, now()),
            )
        return store.get_item(item_id)


def register_pdf_metadata_routes(app, store, json_body):
    @app.get("/api/research/workbench/items/{item_id}/pdf-metadata")
    def suggest(item_id: str):
        return proposal(store, item_id)[0]

    @app.post("/api/research/workbench/items/{item_id}/pdf-metadata")
    async def apply(item_id: str, request: Request):
        body = await json_body(request)
        if set(body) != {"token"} or not isinstance(body["token"], str) or len(body["token"]) != 64:
            raise StoreError("INVALID_FIELD", "需要提供已核对建议的版本。")
        return apply_metadata(store, item_id, body["token"])

    # Compatibility for an already-open X5 client: still only changes its explicitly approved title.
    @app.post("/api/research/workbench/items/{item_id}/pdf-title")
    async def apply_title(item_id: str, request: Request):
        body = await json_body(request)
        if set(body) != {"expected_title"} or not isinstance(body["expected_title"], str):
            raise StoreError("INVALID_FIELD", "需要提供当前题名。")
        value, before = proposal(store, item_id)
        title = next((c for c in value["changes"] if c["field"] == "title"), None)
        with store.lock:
            if (
                not title
                or snapshot(store, item_id) != before
                or before["fields"]["title"] != body["expected_title"]
            ):
                raise StoreError("TITLE_CHANGED", "题名已被修改或没有可靠建议，请重新打开详情。", 409)
            return store.update_item(item_id, {"title": title["after"]})
