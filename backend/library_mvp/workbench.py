"""ReadFlow workbench API: library list / desk read models and per-item reading state.

Reading state (translated title, star, read status, trash, pinned citekey) lives in its own
``item_state`` table so the original ``items`` schema, imports and rollback snapshots are
untouched. Groups are the existing many-to-many ``collections`` / ``item_collections``.
"""
from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

from fastapi import FastAPI, Request

from .store import Store, StoreError, now, text
from .workbench_model import (assign_citekeys, base_citekey, matches_query, short_venue, source_kind,
                              valid_citekey, venue_from_source, year_of)

SCHEMA = """
CREATE TABLE IF NOT EXISTS item_state(
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  title_translated TEXT NOT NULL DEFAULT '',
  venue TEXT NOT NULL DEFAULT '',
  citekey TEXT NOT NULL DEFAULT '',
  starred INTEGER NOT NULL DEFAULT 0,
  read_status TEXT NOT NULL DEFAULT 'unread',
  read_page INTEGER,
  read_pages INTEGER,
  last_opened_at TEXT,
  deleted_at TEXT,
  updated_at TEXT NOT NULL);
"""
READ_STATUSES = ("unread", "reading", "read")
VIEWS = ("all", "unread", "starred", "unfiled", "recent", "trash")
NEEDS_OCR = ("needs_ocr", "partial_needs_ocr")
SORT_KEYS: dict[str, Callable[[dict], Any]] = {
    "added": lambda row: row["created_at"],
    "title": lambda row: row["title"].casefold(),
    "year": lambda row: (row["year"] or "0000", row["created_at"]),
    "author": lambda row: (row["authors"][0].casefold() if row["authors"] else "￿"),
    "venue": lambda row: row["venue_short"].casefold(),
    "opened": lambda row: row["last_opened_at"] or "",
}
STATE_FIELDS = ("title_translated", "venue", "citekey", "starred", "read_status")
MAX_BATCH = 2000

JsonBody = Callable[[Request], Awaitable[dict]]
TranslationLookup = Callable[[list[str]], dict[str, dict]]


def _ids(data: Any, field: str) -> list[str]:
    values = data.get(field, []) if isinstance(data, dict) else None
    if not isinstance(values, list) or len(values) > MAX_BATCH:
        raise StoreError("INVALID_ITEM_IDS", f"{field} must be a list of at most {MAX_BATCH} ids.")
    return [text(value, field, 100, required=True) for value in values]


class Workbench:
    def __init__(self, store: Store, translations: TranslationLookup | None = None):
        self.store = store
        self.translations = translations
        with store.lock:
            store.db.executescript(SCHEMA)

    def _attach_translations(self, rows: list[dict]) -> list[dict]:
        """Merge read-only translation status (looked up outside the store lock)."""
        digests = [row["document_id"] for row in rows if row["document_id"]]
        if self.translations and digests:
            states = self.translations(digests)
            for row in rows:
                if row["document_id"] in states:
                    row["translation"] = states[row["document_id"]]
        return rows

    # ---- read model -------------------------------------------------------------------
    def _rows(self) -> tuple[list[dict], list[dict]]:
        """All items (trashed included) as list rows, plus all groups. Caller holds the lock."""
        db = self.store.db
        states = {row["item_id"]: dict(row) for row in db.execute("SELECT * FROM item_state")}
        groups: dict[str, list[str]] = {}
        for item_id, group_id in db.execute("SELECT item_id,collection_id FROM item_collections"):
            groups.setdefault(item_id, []).append(group_id)
        attachments: dict[str, list[dict]] = {}
        for row in db.execute("SELECT id,item_id,sha256,filename,page_count,text_status FROM attachments ORDER BY created_at,id"):
            attachments.setdefault(row["item_id"], []).append(dict(row))
        notes = {row[0]: (row[1], row[2]) for row in db.execute(
            "SELECT item_id,COUNT(*),SUM(CASE WHEN quote<>'' THEN 1 ELSE 0 END) FROM notes GROUP BY item_id")}
        sources: dict[str, tuple[str, str]] = {}
        for row in db.execute("SELECT entity_id,source_id,raw_source_json FROM source_links WHERE entity_type='item' ORDER BY source_id"):
            sources.setdefault(row[0], (row[1], row[2]))
        items = [dict(row) for row in db.execute(
            "SELECT id,title,item_type,authors_json,date,doi,url,tags_json,created_at,updated_at FROM items ORDER BY created_at,id")]
        for item in items:
            item["authors"] = json.loads(item.pop("authors_json"))
            item["tags"] = json.loads(item.pop("tags_json"))
        pinned = {identity: state["citekey"] for identity, state in states.items() if state["citekey"]}
        citekeys = assign_citekeys(((item["id"], base_citekey(item["authors"], item["date"], item["title"])) for item in items), pinned)
        rows = [self._row(item, states.get(item["id"], {}), groups.get(item["id"], []), attachments.get(item["id"], []),
                          notes.get(item["id"], (0, 0)), sources.get(item["id"]), citekeys[item["id"]]) for item in items]
        collections = [dict(row) for row in db.execute("SELECT id,name,parent_id FROM collections ORDER BY name,id")]
        return rows, collections

    @staticmethod
    def _row(item: dict, state: dict, groups: list[str], attachments: list[dict], notes: tuple[int, int | None],
             source: tuple[str, str] | None, citekey: str) -> dict:
        source_id, raw_json = source or ("", "")
        try:
            raw = json.loads(raw_json) if raw_json else None
        except ValueError:
            raw = None
        venue = state.get("venue") or venue_from_source(raw, doi=item["doi"], url=item["url"])
        pdf = attachments[0] if attachments else None
        return {
            "id": item["id"], "title": item["title"], "title_translated": state.get("title_translated", ""),
            "item_type": item["item_type"], "authors": item["authors"], "date": item["date"], "year": year_of(item["date"]),
            "venue": venue, "venue_short": short_venue(venue, raw), "doi": item["doi"], "url": item["url"],
            "tags": item["tags"], "group_ids": sorted(groups), "citekey": citekey,
            "citekey_pinned": bool(state.get("citekey")),
            "attachment_count": len(attachments), "attachment_id": pdf["id"] if pdf else None,
            "document_id": pdf["sha256"] if pdf else None,
            "page_count": pdf["page_count"] if pdf else None, "text_status": pdf["text_status"] if pdf else "none",
            "notes_count": notes[0], "annotations_count": notes[1] or 0,
            "starred": bool(state.get("starred", 0)), "read_status": state.get("read_status", "unread"),
            "read_page": state.get("read_page"), "read_pages": state.get("read_pages"),
            "last_opened_at": state.get("last_opened_at"), "deleted_at": state.get("deleted_at"),
            "source": source_kind(source_id), "translation": {"status": "none"},
            "created_at": item["created_at"], "updated_at": item["updated_at"],
        }

    @staticmethod
    def _descendants(collections: list[dict]) -> dict[str, set[str]]:
        children: dict[str, list[str]] = {}
        for group in collections:
            if group["parent_id"]:
                children.setdefault(group["parent_id"], []).append(group["id"])
        result: dict[str, set[str]] = {}
        for group in collections:
            seen, stack = {group["id"]}, [group["id"]]
            while stack:
                for child in children.get(stack.pop(), []):
                    if child not in seen:
                        seen.add(child)
                        stack.append(child)
            result[group["id"]] = seen
        return result

    def list(self, *, view: str = "all", group_id: str = "", tag: str = "", query: str = "", sort: str = "added",
             order: str = "desc", include_children: bool = True, year_from: str = "", year_to: str = "") -> dict:
        if view not in VIEWS:
            raise StoreError("INVALID_VIEW", f"view must be one of {', '.join(VIEWS)}.")
        if sort not in SORT_KEYS or order not in ("asc", "desc"):
            raise StoreError("INVALID_SORT", "Unsupported sort field or order.")
        query = text(query, "query", 500).strip()
        with self.store.lock:
            rows, collections = self._rows()
        live = [row for row in rows if not row["deleted_at"]]
        trees = self._descendants(collections)
        counts = {"all": len(live), "unread": sum(row["read_status"] == "unread" for row in live),
                  "starred": sum(row["starred"] for row in live), "unfiled": sum(not row["group_ids"] for row in live),
                  "recent": sum(bool(row["last_opened_at"]) for row in live), "trash": len(rows) - len(live)}
        group_views = [{**group, "count": sum(bool(trees[group["id"]] & set(row["group_ids"])) for row in live),
                        "direct_count": sum(group["id"] in row["group_ids"] for row in live)} for group in collections]
        tag_counts: dict[str, int] = {}
        for row in live:
            for name in row["tags"]:
                tag_counts[name] = tag_counts.get(name, 0) + 1
        selected = rows if view == "trash" else live
        selected = [row for row in selected if self._in_view(row, view)]
        if group_id:
            if group_id not in trees:
                raise StoreError("NOT_FOUND", "The requested group does not exist.", 404)
            wanted = trees[group_id] if include_children else {group_id}
            selected = [row for row in selected if wanted & set(row["group_ids"])]
        if tag:
            selected = [row for row in selected if tag in row["tags"]]
        if year_from:
            selected = [row for row in selected if row["year"] and row["year"] >= year_from]
        if year_to:
            selected = [row for row in selected if row["year"] and row["year"] <= year_to]
        if query:
            selected = [row for row in selected if matches_query(row, query)]
        selected.sort(key=SORT_KEYS[sort], reverse=order == "desc")
        self._attach_translations(selected)
        return {"items": selected, "total": len(selected), "counts": counts, "groups": group_views,
                "tags": [{"name": name, "count": tag_counts[name]} for name in sorted(tag_counts, key=str.casefold)]}

    @staticmethod
    def _in_view(row: dict, view: str) -> bool:
        if view == "trash":
            return bool(row["deleted_at"])
        if view == "unread":
            return row["read_status"] == "unread"
        if view == "starred":
            return row["starred"]
        if view == "unfiled":
            return not row["group_ids"]
        if view == "recent":
            return bool(row["last_opened_at"])
        return True

    def row(self, item_id: str) -> dict:
        with self.store.lock:
            self.store._row("items", item_id)
            rows, _ = self._rows()
        return self._attach_translations([next(row for row in rows if row["id"] == item_id)])[0]

    def desk(self, *, since: str = "") -> dict:
        since = text(since, "since", 40)
        with self.store.lock:
            rows, _ = self._rows()
            trashed = {row["id"] for row in rows if row["deleted_at"]}
            titles = {row["id"]: row["title"] for row in rows}
            notes = [dict(row) for row in self.store.db.execute(
                "SELECT id,item_id,attachment_id,page_idx,quote,translated_quote,body,created_at,updated_at,raw_source_json "
                "FROM notes ORDER BY created_at DESC,id LIMIT 400")]
        live = [row for row in rows if not row["deleted_at"]]
        for note in notes:
            note["item_title"] = titles.get(note["item_id"], "")
            note["color"] = self._note_color(note.pop("raw_source_json"))
        notes = [note for note in notes if note["item_id"] not in trashed]
        newest = lambda key: (lambda row: row[key] or "")
        continue_reading = sorted([row for row in live if row["last_opened_at"]], key=newest("last_opened_at"), reverse=True)[:5]
        to_read = sorted([row for row in live if row["read_status"] == "unread"], key=newest("created_at"), reverse=True)[:6]
        recent_items = sorted(live, key=newest("created_at"), reverse=True)[:5]
        self._attach_translations(list({id(row): row for row in continue_reading + to_read + recent_items}.values()))
        return {
            "continue_reading": continue_reading,
            "to_read": to_read,
            "recent_items": recent_items,
            "recent_annotations": [note for note in notes if note["quote"]][:6],
            "recent_notes": sorted([note for note in notes if not note["quote"]], key=newest("updated_at"), reverse=True)[:5],
            "attention": {
                "missing_doi": [row["id"] for row in live if not row["doi"] and row["item_type"] != "note"],
                "needs_ocr": [row["id"] for row in live if row["text_status"] in NEEDS_OCR],
                "untranslated_titles": [row["id"] for row in live if not row["title_translated"]],
            },
            "today": {
                "opened": sum(bool(since and (row["last_opened_at"] or "") >= since) for row in live),
                "annotations": sum(bool(since and note["quote"] and note["created_at"] >= since) for note in notes),
                "notes": sum(bool(since and not note["quote"] and note["created_at"] >= since) for note in notes),
            },
            "total": len(live),
        }

    @staticmethod
    def _note_color(raw_json: str | None) -> str:
        try:
            raw = json.loads(raw_json) if raw_json else {}
        except ValueError:
            return ""
        annotation = next((value for value in raw.values() if isinstance(value, dict) and "color" in value), None) \
            if isinstance(raw, dict) else None
        color = annotation.get("color") if annotation else ""
        return color if isinstance(color, str) and len(color) <= 32 else ""

    # ---- writes -----------------------------------------------------------------------
    def _ensure_state(self, item_id: str) -> None:
        self.store._row("items", item_id)
        self.store.db.execute("INSERT OR IGNORE INTO item_state(item_id,updated_at) VALUES(?,?)", (item_id, now()))

    def update_state(self, item_id: str, data: dict) -> dict:
        if not isinstance(data, dict) or not data or set(data) - set(STATE_FIELDS):
            raise StoreError("INVALID_ITEM_STATE", "Item state accepts " + ", ".join(STATE_FIELDS) + ".")
        values: dict[str, Any] = {}
        if "title_translated" in data:
            values["title_translated"] = text(data["title_translated"], "title_translated", 1000).strip()
        if "venue" in data:
            values["venue"] = text(data["venue"], "venue", 300).strip()
        if "citekey" in data:
            citekey = text(data["citekey"], "citekey", 100).strip()
            if citekey and not valid_citekey(citekey):
                raise StoreError("INVALID_CITEKEY", "Citekeys use letters, digits, and _ : - . only.")
            values["citekey"] = citekey
        if "starred" in data:
            if not isinstance(data["starred"], bool):
                raise StoreError("INVALID_ITEM_STATE", "starred must be true or false.")
            values["starred"] = int(data["starred"])
        if "read_status" in data:
            if data["read_status"] not in READ_STATUSES:
                raise StoreError("INVALID_ITEM_STATE", "read_status must be unread, reading or read.")
            values["read_status"] = data["read_status"]
        with self.store.transaction():
            self._ensure_state(item_id)
            if values.get("citekey"):
                clash = self.store.db.execute("SELECT item_id FROM item_state WHERE citekey=? AND item_id<>?",
                                              (values["citekey"], item_id)).fetchone()
                if clash:
                    raise StoreError("CITEKEY_TAKEN", "Another item already uses this citekey.", 409)
            assignments = ",".join(f"{field}=?" for field in values)
            self.store.db.execute(f"UPDATE item_state SET {assignments},updated_at=? WHERE item_id=?",
                                  (*values.values(), now(), item_id))
        return self.row(item_id)

    def mark_opened(self, item_id: str, data: dict) -> dict:
        if not isinstance(data, dict) or set(data) - {"page", "pages"}:
            raise StoreError("INVALID_ITEM_STATE", "Opening accepts page and pages.")
        page, pages = data.get("page"), data.get("pages")
        for value in (page, pages):
            if value is not None and (not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 100000):
                raise StoreError("INVALID_ITEM_STATE", "page and pages must be non-negative integers.")
        with self.store.transaction():
            self._ensure_state(item_id)
            self.store.db.execute(
                "UPDATE item_state SET last_opened_at=?,read_status=CASE read_status WHEN 'unread' THEN 'reading' ELSE read_status END,"
                "read_page=COALESCE(?,read_page),read_pages=COALESCE(?,read_pages),updated_at=? WHERE item_id=?",
                (now(), page, pages, now(), item_id))
        return self.row(item_id)

    def set_trashed(self, data: dict, trashed: bool) -> dict:
        identities = _ids(data, "item_ids")
        with self.store.transaction():
            for identity in identities:
                self._ensure_state(identity)
            self.store.db.executemany("UPDATE item_state SET deleted_at=?,updated_at=? WHERE item_id=?",
                                      [(now() if trashed else None, now(), identity) for identity in identities])
        return {"updated": len(identities)}

    def change_membership(self, group_id: str, data: dict) -> dict:
        if not isinstance(data, dict) or set(data) - {"add", "remove"}:
            raise StoreError("INVALID_GROUP_CHANGE", "Group membership accepts add and remove id lists.")
        add, remove = _ids(data, "add"), _ids(data, "remove")
        with self.store.transaction():
            self.store._row("collections", group_id)
            for identity in add + remove:
                self.store._row("items", identity)
            self.store.db.executemany("INSERT OR IGNORE INTO item_collections VALUES(?,?)", [(identity, group_id) for identity in add])
            self.store.db.executemany("DELETE FROM item_collections WHERE item_id=? AND collection_id=?",
                                      [(identity, group_id) for identity in remove])
        return {"group_id": group_id, "added": len(add), "removed": len(remove)}

    def delete_group(self, group_id: str) -> dict:
        """Delete a group and its subgroups. Papers stay in the library and in their other groups."""
        with self.store.transaction():
            self.store._row("collections", group_id)
            collections = [dict(row) for row in self.store.db.execute("SELECT id,name,parent_id FROM collections")]
            doomed = self._descendants(collections)[group_id]
            depth = {group["id"]: 0 for group in collections}
            parents = {group["id"]: group["parent_id"] for group in collections}
            for identity in doomed:
                node, level = identity, 0
                while parents.get(node):
                    node, level = parents[node], level + 1
                depth[identity] = level
            for identity in sorted(doomed, key=lambda value: depth[value], reverse=True):
                self.store.db.execute("DELETE FROM item_collections WHERE collection_id=?", (identity,))
                self.store.db.execute("DELETE FROM source_links WHERE entity_type='collection' AND entity_id=?", (identity,))
                self.store.db.execute("DELETE FROM collections WHERE id=?", (identity,))
        return {"deleted": len(doomed)}


def register_workbench_routes(app: FastAPI, store: Store, json_body: JsonBody,
                              translations: TranslationLookup | None = None) -> Workbench:
    bench = Workbench(store, translations)
    app.state.workbench = bench
    root = "/api/research/workbench"

    @app.get(root + "/items")
    def list_rows(view: str = "all", group_id: str = "", tag: str = "", query: str = "", sort: str = "added",
                  order: str = "desc", include_children: bool = True, year_from: str = "", year_to: str = ""):
        return bench.list(view=view, group_id=group_id, tag=tag, query=query, sort=sort, order=order,
                          include_children=include_children, year_from=year_from, year_to=year_to)

    @app.get(root + "/items/{item_id}")
    def get_row(item_id: str):
        return bench.row(item_id)

    @app.get(root + "/desk")
    def desk(since: str = ""):
        return bench.desk(since=since)

    @app.patch(root + "/items/{item_id}/state")
    async def update_state(item_id: str, request: Request):
        return bench.update_state(item_id, await json_body(request))

    @app.post(root + "/items/{item_id}/opened")
    async def opened(item_id: str, request: Request):
        return bench.mark_opened(item_id, await json_body(request))

    @app.post(root + "/items/trash")
    async def trash(request: Request):
        return bench.set_trashed(await json_body(request), True)

    @app.post(root + "/items/restore")
    async def restore(request: Request):
        return bench.set_trashed(await json_body(request), False)

    @app.post(root + "/groups/{group_id}/items")
    async def membership(group_id: str, request: Request):
        return bench.change_membership(group_id, await json_body(request))

    @app.post(root + "/groups/{group_id}/delete")
    async def delete_group(group_id: str, request: Request):
        if await json_body(request):
            raise StoreError("INVALID_GROUP_DELETE", "Deleting a group accepts an empty JSON object.")
        return bench.delete_group(group_id)

    return bench
