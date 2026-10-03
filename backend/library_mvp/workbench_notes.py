"""Notes workspace read model. Mutations keep using Store's validated note endpoints."""
from __future__ import annotations

import json

from fastapi import FastAPI

from .store import Store, StoreError, text


# Native Reader annotations always have a physical page, including image selections without text.
ANNOTATION_SQL = "(quote<>'' OR translated_quote<>'' OR page_idx IS NOT NULL)"


def note_kind(note: dict) -> str:
    return "annotation" if note.get("quote") or note.get("translated_quote") or note.get("page_idx") is not None else "note"


def note_color(raw_json: str | None) -> str:
    try:
        raw = json.loads(raw_json) if raw_json else {}
    except ValueError:
        return ""
    annotation = next((value for value in raw.values() if isinstance(value, dict) and "color" in value), None) \
        if isinstance(raw, dict) else None
    color = annotation.get("color") if annotation else ""
    return color if isinstance(color, str) and len(color) <= 32 else ""


def list_notes(store: Store, *, item_id: str = "", q: str = "", kind: str = "all", limit: int = 200,
               offset: int = 0) -> dict:
    if kind not in ("all", "notes", "annotations"):
        raise StoreError("INVALID_NOTE_KIND", "kind must be all, notes or annotations.")
    if type(limit) is not int or not 1 <= limit <= 1000:
        raise StoreError("INVALID_NOTE_LIMIT", "limit must be between 1 and 1000.")
    if type(offset) is not int or offset < 0:
        raise StoreError("INVALID_NOTE_OFFSET", "offset must be non-negative.")
    store.annotations.migrate()
    item_id, query = text(item_id, "item_id", 100), text(q, "q", 500).strip().casefold()
    where, args = ["s.deleted_at IS NULL"], []
    if item_id:
        where.append("n.item_id=?")
        args.append(item_id)
    if query:
        fields = ("n.body", "n.quote", "n.translated_quote", "i.title", "COALESCE(s.title_translated,'')")
        where.append("(" + " OR ".join(f"instr(readflow_casefold({field}),?)>0" for field in fields) + ")")
        args.extend([query] * len(fields))
    source = " FROM effective_notes n JOIN items i ON i.id=n.item_id LEFT JOIN item_state s ON s.item_id=n.item_id WHERE "
    filtered = source + " AND ".join(where)
    with store.lock:
        # Search scans text in SQLite, but only the requested page is materialized in Python.
        # Unicode casefold handles both Chinese text and non-ASCII author/title vocabulary.
        if query:
            store.db.create_function("readflow_casefold", 1, lambda value: value.casefold(), deterministic=True)
        count = store.db.execute(f"SELECT COUNT(*),COALESCE(SUM(CASE WHEN {ANNOTATION_SQL} THEN 1 ELSE 0 END),0)" + filtered, args).fetchone()
        counts = {"total": count[0], "notes": count[0] - count[1], "annotations": count[1]}
        selected = filtered + (f" AND {ANNOTATION_SQL}" if kind == "annotations" else f" AND NOT {ANNOTATION_SQL}" if kind == "notes" else "")
        page = [dict(row) for row in store.db.execute(
            "SELECT n.id,n.item_id,i.title AS item_title,COALESCE(s.title_translated,'') AS item_title_translated,"
            "n.attachment_id,n.page_idx,n.quote,n.translated_quote,n.body,n.created_at,n.updated_at,n.raw_source_json"
            + selected + " ORDER BY n.updated_at DESC,n.id DESC LIMIT ? OFFSET ?", [*args, limit, offset])]
    for row in page:
        row["kind"] = note_kind(row)
        row["color"] = note_color(row.pop("raw_source_json"))
    return {"items": page, "total": counts["total" if kind == "all" else kind], "counts": counts}


def register_notes_routes(app: FastAPI, store: Store) -> None:
    @app.get("/api/research/workbench/notes")
    def notes(item_id: str = "", q: str = "", kind: str = "all", limit: int = 200, offset: int = 0):
        return list_notes(store, item_id=item_id, q=q, kind=kind, limit=limit, offset=offset)
