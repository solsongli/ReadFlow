"""Experimental independent receiver for a subset of Zotero Connector API 3.

No Zotero implementation, translator code or AGPL core is copied. Wire shapes
were inspected in official zotero-connectors/common connector.js, itemSaver.js,
itemSaver_background.js, inject/progressWindow_inject.js and repo.js, plus
zotero/xpcom/server/server.js, server_connector.js and saveSession.js (2026-09-30).

This module does not bind a port. A launcher may explicitly bind a free loopback
port; it must never replace a running Zotero server. Official Connector 5.0.216 /
Firefox 156.0.1 passed synthetic webpage/PDF and public arXiv 2503.03480v4 saves,
repeat-clicks and native Reader reopening after restart on 2026-10-01. This is
partial acceptance, not a claim about other sites or every Connector feature.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from email.header import decode_header
import hashlib
import inspect
import ipaddress
import json
import math
import re
import time
from typing import Any, Callable, Protocol
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response

from .store import MAX_PDF_BYTES, METADATA_FIELDS, StoreError, encode, fingerprint, now
from .zotero import ImportPlanError, _plain_text, build_import_plan

CONNECTOR_API_VERSION = 3
# Evidence: docs/ops/planning/research-library-mvp/validation/official-connector-20261001/.
# Keep the full-compatibility flag false; expose the narrower measured scope.
_PARTIAL_ACCEPTANCE = {"tested_at": "2026-10-01", "connector_version": "5.0.216",
                       "browser": "Firefox 156.0.1", "fixture": "synthetic_local_webpage_pdf",
                       "passed": ("metadata", "pdf_binary_upload", "same_page_repeat", "native_reader_after_restart"),
                       "public_samples": ({"site": "arxiv.org", "identifier": "2503.03480", "revision": "v4"},)}
MAX_JSON_BYTES = 2 * 1024 * 1024
MAX_METADATA_BYTES = 16 * 1024
MAX_CAPTURE_ITEMS = 100
MAX_SESSION_ATTACHMENTS = 100
SUPPORTED_METHODS = ("ping", "getSelectedCollection", "saveItems", "saveAttachment",
                     "saveStandaloneAttachment", "updateSession", "delaySync", "hasAttachmentResolvers")
UNSUPPORTED_METHODS = ("saveSnapshot", "saveSingleFile", "getTranslators", "getTranslatorCode",
                       "detect", "import", "installStyle", "saveAttachmentFromResolver", "getRecognizedItem")
_SENSITIVE = {"cookie", "cookies", "detailedcookies", "credentials", "credential", "authorization",
              "proxyauthorization", "password", "passwd", "accesstoken", "refreshtoken", "token",
              "apikey", "secret", "auth", "accesskey", "privatekey", "clientsecret", "idtoken", "bearer", "headers", "html", "snapshotcontent", "document", "proxy"}
_SENSITIVE_QUERY = {"token", "accesstoken", "refreshtoken", "apikey", "key", "auth", "authorization",
                    "password", "session", "sessionid", "signature", "credential"}
_PREFS = {"downloadAssociatedFiles": True, "automaticSnapshots": False,
          "supportsAttachmentUpload": True, "supportsTagsAutocomplete": False,
          "reportActiveURL": False, "canUserAddNote": True,
          "googleDocsAddAnnotationEnabled": False, "googleDocsCitationExplorerEnabled": False}


class ConnectorError(ValueError):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code, self.status = code, status
        super().__init__(message)


class ConnectorBackend(Protocol):
    """Callbacks may return values or awaitables. Saving a batch must be atomic."""
    def list_targets(self) -> Any: ...
    def get_selected_target(self) -> Any: ...
    def save_items(self, *, source_id: str, items: list[dict], target_id: str, raw_request: dict) -> Any: ...
    def save_pdf(self, data: bytes, *, item_id: str | None, filename: str, metadata: dict,
                 source_id: str, attachment_key: str) -> Any: ...
    def update_session(self, *, item_ids: list[str], target_id: str, tags: list[str], note: str,
                       source_id: str) -> Any: ...


async def _call(function: Callable, *args, **kwargs):
    result = function(*args, **kwargs)
    return await result if inspect.isawaitable(result) else result


def _key(value: Any, name: str, limit: int = 200) -> str:
    if isinstance(value, int) and not isinstance(value, bool):
        value = str(value)
    if not isinstance(value, str) or not value or len(value) > limit or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ConnectorError("INVALID_IDENTIFIER", f"{name} must be nonempty bounded single-line text.")
    return value


def _json_bytes(value: Any) -> bytes:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ConnectorError("INVALID_JSON", "Use finite bounded JSON data.") from exc


def _parse_json(raw: bytes, maximum: int) -> dict:
    if len(raw) > maximum:
        raise ConnectorError("REQUEST_TOO_LARGE", "The experimental receiver request limit was exceeded.", 413)
    try:
        value = json.loads(raw or b"{}")
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise ConnectorError("INVALID_JSON", "The request must contain a JSON object.") from exc
    if not isinstance(value, dict):
        raise ConnectorError("INVALID_JSON", "The request must contain a JSON object.")
    nodes, stack = 0, [(value, 0)]
    while stack:
        part, depth = stack.pop()
        nodes += 1
        if depth > 24 or nodes > 50_000:
            raise ConnectorError("JSON_LIMIT", "JSON nesting or field count exceeds the experimental limit.")
        if isinstance(part, dict):
            if len(part) > 512 or not all(isinstance(k, str) and len(k) <= 200 for k in part):
                raise ConnectorError("JSON_LIMIT", "Object fields exceed the experimental limit.")
            stack.extend((v, depth + 1) for v in part.values())
        elif isinstance(part, list):
            if len(part) > 1000:
                raise ConnectorError("JSON_LIMIT", "Array length exceeds the experimental limit.")
            stack.extend((v, depth + 1) for v in part)
        elif isinstance(part, str):
            if len(part) > 200_000 or "\x00" in part:
                raise ConnectorError("JSON_LIMIT", "Text fields exceed the experimental limit.")
        elif isinstance(part, float) and not math.isfinite(part):
            raise ConnectorError("INVALID_JSON", "JSON numbers must be finite.")
    return value


def _clean_url(value: str) -> str:
    try:
        url = urlsplit(value)
        if url.scheme not in {"http", "https"} or not url.hostname:
            return ""
        port = url.port
        host = f"[{url.hostname}]" if ":" in url.hostname else url.hostname
        if port is not None:
            host += f":{port}"
        query = [(k, v) for k, v in parse_qsl(url.query, keep_blank_values=True, max_num_fields=500)
                 if re.sub(r"[^a-z0-9]", "", k.lower()) not in _SENSITIVE_QUERY]
        fragment = url.fragment
        if "=" in fragment:
            fragment_parts = parse_qsl(fragment, keep_blank_values=True, max_num_fields=500)
            clean_fragment = [(k, v) for k, v in fragment_parts if re.sub(r"[^a-z0-9]", "", k.lower()) not in _SENSITIVE_QUERY]
            if len(clean_fragment) != len(fragment_parts):
                fragment = urlencode(clean_fragment)
        return urlunsplit((url.scheme, host, url.path, urlencode(query), fragment))
    except (ValueError, UnicodeError):
        return ""


def sanitize_source(value: Any) -> tuple[Any, int]:
    """Drop transport credentials/cookies and clean credential-bearing URLs."""
    removed = 0
    def clean(part: Any):
        nonlocal removed
        if isinstance(part, dict):
            result = {}
            for key, item in part.items():
                normalized = re.sub(r"[^a-z0-9]", "", key.lower())
                if normalized in _SENSITIVE:
                    removed += 1
                    continue
                if normalized in {"url", "uri", "href", "referrer", "referer"} and isinstance(item, str):
                    cleaned = _clean_url(item)
                    if cleaned != item:
                        removed += 1
                    result[key] = cleaned
                else:
                    result[key] = clean(item)
            return result
        if isinstance(part, list):
            return [clean(v) for v in part]
        return part
    return clean(value), removed


def _title(value: Any) -> str:
    if value is None:
        return "Full Text PDF"
    if not isinstance(value, str) or len(value) > MAX_METADATA_BYTES:
        raise ConnectorError("INVALID_METADATA", "Attachment title must be bounded text.")
    pieces = []
    try:
        for part, charset in decode_header(value):
            pieces.append(part.decode(charset or "utf-8", errors="strict") if isinstance(part, bytes) else part)
    except (LookupError, UnicodeError, ValueError) as exc:
        raise ConnectorError("INVALID_METADATA", "Attachment title encoding could not be decoded.") from exc
    title = "".join(pieces)
    if any(ord(c) < 32 or ord(c) == 127 for c in title):
        raise ConnectorError("INVALID_METADATA", "Attachment title cannot contain control characters.")
    return title.strip() or "Full Text PDF"


def _attachment_metadata(value: Any) -> dict:
    if not isinstance(value, dict):
        raise ConnectorError("INVALID_METADATA", "Attachment metadata must be a JSON object.")
    metadata, _ = sanitize_source(value)
    title = _title(metadata.get("title"))
    if len(title) > 1000:
        raise ConnectorError("INVALID_METADATA", "Decoded attachment title must contain at most 1000 characters.")
    url = metadata.get("url", "")
    if not isinstance(url, str) or len(url) > 2000 or any(ord(c) < 32 or ord(c) == 127 for c in url):
        raise ConnectorError("INVALID_METADATA", "Attachment URL must be text of at most 2000 characters without control characters.")
    if metadata.get("contentType") not in (None, "application/pdf"):
        raise ConnectorError("ATTACHMENT_TYPE_MISMATCH", "Attachment contentType must be application/pdf.", 415)
    return dict(metadata, title=title)


def _filename(title: str) -> str:
    filename = re.split(r"[/\\]", title)[-1].strip().strip(".") or "paper"
    if filename.lower().endswith(".pdf"):
        filename = filename[:-4]
    return filename[:236] + ".pdf"


@dataclass
class ConnectorSession:
    id: str
    source_id: str
    target_id: str
    created: float
    updated: float
    state: str = "saving"
    standalone: bool = False
    item_ids: dict[str, str] = field(default_factory=dict)
    uploads: dict[str, tuple[str, dict]] = field(default_factory=dict)
    warnings: list[dict] = field(default_factory=list)
    failures: list[dict] = field(default_factory=list)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class ConnectorService:
    def __init__(self, backend: ConnectorBackend, *, library_name: str,
                 library_namespace: str = "retainpdf-local", product_version: str = "4.2.5",
                 session_ttl: float = 600, max_sessions: int = 100,
                 allowed_extension_origins: tuple[str, ...] = (), clock: Callable[[], float] = time.monotonic):
        if not 1 <= session_ttl <= 3600 or not 1 <= max_sessions <= 1000:
            raise ValueError("Use a bounded positive session lifetime and count.")
        self.backend = backend
        self.library_name = _key(library_name, "library_name", 500)
        self.library_namespace = _key(library_namespace, "library_namespace", 100)
        self.product_version = _key(product_version, "product_version", 64)
        self.session_ttl, self.max_sessions = session_ttl, max_sessions
        self.allowed_extension_origins = frozenset(allowed_extension_origins)
        self.clock = clock
        self.sessions: dict[str, ConnectorSession] = {}
        self.failures: list[dict] = []
        self._registry_lock = asyncio.Lock()

    @property
    def response_headers(self) -> dict:
        # This is our actual product identifier, never a claimed Zotero version.
        return {"X-Zotero-Version": f"RetainPDF/{self.product_version}-experimental",
                "X-Zotero-Connector-API-Version": "3", "X-RetainPDF-Connector-Status": "experimental",
                "Cache-Control": "no-store"}

    def status(self) -> dict:
        return {"status": "experimental", "client": "RetainPDF", "api_version": 3,
                "product_version": self.product_version, "real_connector_verified": False,
                "partial_acceptance": dict(_PARTIAL_ACCEPTANCE),
                "active_sessions": len(self.sessions), "supported_methods": list(SUPPORTED_METHODS),
                "unsupported_methods": list(UNSUPPORTED_METHODS), "failures": list(self.failures)}

    def _failure(self, operation: str, code: str, session: ConnectorSession | None = None):
        entry = {"operation": operation, "code": code, "at": now()}
        self.failures.append(entry)
        self.failures[:] = self.failures[-100:]
        if session:
            session.failures.append(entry)
            session.failures[:] = session.failures[-100:]

    async def _targets(self) -> list[dict]:
        rows = await _call(self.backend.list_targets)
        if not isinstance(rows, list) or len(rows) > 2000:
            raise ConnectorError("TARGETS_UNAVAILABLE", "The RetainPDF target list is unavailable.", 503)
        targets = [{"id": "L1", "name": self.library_name, "filesEditable": True, "level": 0}]
        seen = {"L1"}
        for row in rows:
            identity = _key(row.get("id"), "target id", 200)
            if identity == "L1":
                continue
            if not identity.startswith("C") or identity in seen:
                raise ConnectorError("TARGETS_UNAVAILABLE", "The RetainPDF target list contains an invalid target.", 503)
            seen.add(identity)
            name = _key(row.get("name"), "target name", 500)
            level = row.get("level", 1)
            if type(level) is not int or not 1 <= level <= 100:
                raise ConnectorError("TARGETS_UNAVAILABLE", "The RetainPDF target tree is invalid.", 503)
            targets.append({"id": identity, "name": name, "filesEditable": True, "level": level})
        return targets

    async def _target(self, identity: Any = None) -> str:
        identity = identity if identity is not None else await _call(self.backend.get_selected_target)
        identity = _key(identity or "L1", "target", 200)
        if identity not in {row["id"] for row in await self._targets()}:
            raise ConnectorError("COLLECTION_NOT_FOUND", "The selected RetainPDF collection does not exist.")
        return identity

    async def _new_session(self, identity: Any, target_id: str, *, standalone: bool = False) -> ConnectorSession:
        if identity is None or identity == "":
            raise ConnectorError("SESSION_ID_NOT_PROVIDED", "A Connector sessionID is required.")
        identity = _key(identity, "sessionID")
        async with self._registry_lock:
            current = self.clock()
            for key, session in list(self.sessions.items()):
                if not session.lock.locked() and current - session.updated > self.session_ttl:
                    del self.sessions[key]
            if identity in self.sessions:
                existing = self.sessions[identity]
                if standalone and existing.standalone:
                    return existing
                raise ConnectorError("SESSION_EXISTS", "This Connector session already exists.", 409)
            if len(self.sessions) >= self.max_sessions:
                raise ConnectorError("SESSION_LIMIT", "Too many active Connector sessions; retry after they expire.", 429)
            session = ConnectorSession(identity, f"connector:{self.library_namespace}:{identity}", target_id, current, current,
                                       standalone=standalone)
            self.sessions[identity] = session
            return session

    def _session(self, identity: Any) -> ConnectorSession:
        if identity is None or identity == "":
            raise ConnectorError("SESSION_ID_NOT_PROVIDED", "A Connector sessionID is required.")
        session = self.sessions.get(_key(identity, "sessionID"))
        if session is None:
            raise ConnectorError("SESSION_NOT_FOUND", "This Connector session is unavailable.")
        if not session.lock.locked() and self.clock() - session.updated > self.session_ttl:
            del self.sessions[session.id]
            raise ConnectorError("SESSION_NOT_FOUND", "This Connector session has expired.")
        return session

    async def selected_collection(self) -> dict:
        targets = await self._targets()
        selected = await self._target()
        name = next(row["name"] for row in targets if row["id"] == selected)
        return {"libraryID": 1, "libraryName": self.library_name, "libraryEditable": True,
                "filesEditable": True, "editable": True, "id": None if selected == "L1" else selected,
                "name": name, "targets": targets, "tags": {}}

    def _canonical_items(self, payload: dict, source_id: str) -> tuple[list[dict], list[dict]]:
        records = payload.get("items")
        if not isinstance(records, list) or not 1 <= len(records) <= MAX_CAPTURE_ITEMS:
            raise ConnectorError("INVALID_ITEMS", "Save 1 to 100 translated bibliographic items per request.")
        flat = []
        source_items = {}
        for raw in records:
            if not isinstance(raw, dict):
                raise ConnectorError("INVALID_ITEMS", "Translated items must be JSON objects.")
            identity = _key(raw.get("id"), "item id")
            if identity in source_items:
                raise ConnectorError("DUPLICATE_ITEM_ID", "Connector item IDs must be unique within a session.")
            if raw.get("itemType") in {"attachment", "note", "annotation"}:
                raise ConnectorError("UNSUPPORTED_ITEM_TYPE", "Use the attachment endpoint for standalone PDFs.", 501)
            source_items[identity] = raw
            converted = {k: v for k, v in raw.items() if k not in {"id", "attachments", "notes", "collections"}}
            converted.update({"key": identity, "version": 0, "collections": []})
            flat.append(converted)
            notes = raw.get("notes", [])
            if not isinstance(notes, list) or len(notes) > 100:
                raise ConnectorError("INVALID_NOTES", "Translated notes must be a bounded array.")
            for index, note in enumerate(notes):
                body = note if isinstance(note, str) else note.get("note") if isinstance(note, dict) else None
                if not isinstance(body, str):
                    raise ConnectorError("INVALID_NOTES", "Translated notes must contain note text.")
                flat.append({"key": f"{identity}:note:{index}", "version": 0, "itemType": "note", "parentItem": identity, "note": body})
        try:
            plan = build_import_plan({"format": "zotero-api", "source_id": source_id, "data": flat})
        except ImportPlanError as exc:
            raise ConnectorError(exc.code, str(exc)) from exc
        for item in plan["items"]:
            item["raw_source"] = source_items[item["source_key"]]
        ignored = {"word_citations_not_migrated", "plugin_data_not_migrated"}
        warnings = [w for w in plan["warnings"] if w["code"] not in ignored]
        for identity, raw in source_items.items():
            if raw.get("attachments"):
                warnings.append({"code": "LINKED_ATTACHMENTS_NOT_FETCHED", "source_key": identity,
                                 "message": "Linked attachments are retained as source metadata; this receiver does not fetch URLs. PDF bytes must arrive through saveAttachment."})
        return plan["items"], warnings

    async def save_items(self, payload: dict) -> dict:
        payload, _ = sanitize_source(payload)
        if payload.get("sessionID") in (None, ""):
            raise ConnectorError("SESSION_ID_NOT_PROVIDED", "A Connector sessionID is required.")
        target = await self._target(payload.get("target"))
        source_id = f"connector:{self.library_namespace}:{_key(payload.get('sessionID'), 'sessionID')}"
        items, warnings = self._canonical_items(payload, source_id)
        session = await self._new_session(payload.get("sessionID"), target)
        async with session.lock:
            try:
                result = await _call(self.backend.save_items, source_id=session.source_id, items=items,
                                     target_id=target, raw_request=payload)
                if not isinstance(result, dict) or set(result) != {item["source_key"] for item in items}:
                    raise ConnectorError("INVALID_BACKEND_RESULT", "Not all Connector items were saved; check the RetainPDF capture report.", 500)
                session.item_ids = {key: _key(value, "local item ID") for key, value in result.items()}
                session.warnings.extend(warnings)
                session.state = "active"
                session.updated = self.clock()
                return {"experimental": True, "items": len(result), "warnings": warnings}
            except Exception:
                session.state = "failed"
                self._failure("saveItems", "ITEM_SAVE_FAILED", session)
                raise

    async def save_attachment(self, data: bytes, metadata: dict, session_id: Any, *, standalone: bool = False) -> dict:
        if not data or len(data) > MAX_PDF_BYTES or b"%PDF-" not in data[:1024]:
            raise ConnectorError("INVALID_PDF", "Upload a PDF no larger than 64 MiB.")
        metadata = _attachment_metadata(metadata)
        metadata_session = metadata.get("sessionID")
        if metadata_session and session_id and metadata_session != session_id:
            raise ConnectorError("SESSION_ID_MISMATCH", "Query and metadata session IDs must agree.")
        identity = metadata_session or session_id
        title = metadata["title"]
        parent = None if standalone else _key(metadata.get("parentItemID"), "parentItemID")
        attachment_key = _key(metadata["id"], "attachment id") if metadata.get("id") is not None else "standalone" if standalone else None
        if attachment_key is None:
            raise ConnectorError("ATTACHMENT_ID_NOT_PROVIDED", "An attachment id is required for retry-safe uploads.")
        session = await self._new_session(identity, await self._target(), standalone=True) if standalone else self._session(identity)
        async with session.lock:
            if not standalone and session.state != "active":
                raise ConnectorError("SESSION_NOT_READY", "This Connector session did not finish saving its items.", 409)
            if not standalone and parent not in session.item_ids:
                raise ConnectorError("PARENT_ITEM_NOT_FOUND", "No saved parent item matches parentItemID in this session.")
            item_id = None if standalone else session.item_ids[parent]
            hasher = hashlib.sha256(data)
            hasher.update(_json_bytes({"metadata": metadata, "parent": parent}))
            digest = hasher.hexdigest()
            if attachment_key in session.uploads:
                previous, result = session.uploads[attachment_key]
                if previous != digest:
                    raise ConnectorError("ATTACHMENT_ID_CONFLICT", "This attachment id already identifies different bytes or metadata.", 409)
                return json.loads(_json_bytes({**result, "duplicate": True}))
            if standalone and session.uploads:
                raise ConnectorError("SESSION_EXISTS", "A standalone save session already identifies another PDF upload.", 409)
            if len(session.uploads) >= MAX_SESSION_ATTACHMENTS:
                raise ConnectorError("ATTACHMENT_LIMIT", "This session exceeds the experimental attachment limit.", 413)
            try:
                result = await _call(self.backend.save_pdf, data, item_id=item_id, filename=_filename(title), metadata=metadata,
                                     source_id=session.source_id, attachment_key=attachment_key)
                if not isinstance(result, dict) or not result.get("item_id") or not result.get("attachment_id"):
                    raise ConnectorError("INVALID_BACKEND_RESULT", "The PDF save result is incomplete.", 500)
                if standalone:
                    session.item_ids[metadata.get("url") or "standalone"] = result["item_id"]
                    session.state = "active"
                if result.get("reader_ready") is False:
                    session.warnings.append({"code": "NATIVE_READER_UNAVAILABLE", "message": "PDF bytes are saved, but the native reader bridge is unavailable; retry the bridge in RetainPDF."})
                    self._failure("saveAttachment", "NATIVE_READER_UNAVAILABLE", session)
                output = {"experimental": True, "attachment_id": result["attachment_id"],
                          "reader_ready": result.get("reader_ready", False), "warnings": list(session.warnings)}
                if standalone:
                    output["canRecognize"] = False
                session.uploads[attachment_key] = (digest, json.loads(_json_bytes(output)))
                session.updated = self.clock()
                return output
            except Exception:
                if standalone:
                    session.state = "failed"
                self._failure("saveStandaloneAttachment" if standalone else "saveAttachment", "PDF_SAVE_FAILED", session)
                raise

    async def update_session(self, payload: dict) -> dict:
        session = self._session(payload.get("sessionID"))
        target = await self._target(payload.get("target", session.target_id))
        tags = payload.get("tags", [])
        if isinstance(tags, str):
            tags = tags.split(",")
        if not isinstance(tags, list) or len(tags) > 100:
            raise ConnectorError("INVALID_TAGS", "Tags must be an array of at most 100 strings or a comma-delimited string.")
        normalized = []
        for tag in tags:
            if not isinstance(tag, str) or len(tag) > 500 or "\x00" in tag:
                raise ConnectorError("INVALID_TAGS", "Tag names must be bounded text.")
            if tag.strip() and tag.strip() not in normalized:
                normalized.append(tag.strip())
        note = payload.get("note", "")
        if not isinstance(note, str) or len(note) > 100_000:
            raise ConnectorError("INVALID_NOTE", "The session note must be bounded text.")
        note = _plain_text(note)
        async with session.lock:
            if session.state != "active":
                raise ConnectorError("SESSION_NOT_READY", "This Connector session did not finish saving.", 409)
            await _call(self.backend.update_session, item_ids=list(session.item_ids.values()), target_id=target,
                        tags=normalized, note=note, source_id=session.source_id)
            session.target_id = target
            session.updated = self.clock()
        return {}


class StoreConnectorBackend:
    """Adapter for the existing isolated Store; no new schema or raw-file reads."""
    def __init__(self, store, *, pdf_callback: Callable | None = None):
        self.store, self.pdf_callback = store, pdf_callback
        self.selected_target = "L1"
        self.base_tags: dict[str, dict[str, list[str]]] = {}

    def list_targets(self) -> list[dict]:
        rows = self.store.list_collections()
        by_id = {r["id"]: r for r in rows}
        result = []
        def visit(row: dict, level: int, ancestors: set):
            if row["id"] in ancestors or level > 100:
                raise ConnectorError("TARGETS_UNAVAILABLE", "The collection hierarchy is invalid.", 503)
            result.append({"id": "C" + row["id"], "name": row["name"], "filesEditable": True, "level": level})
            for child in rows:
                if child["parent_id"] == row["id"]:
                    visit(child, level + 1, ancestors | {row["id"]})
        for row in rows:
            if row["parent_id"] is None or row["parent_id"] not in by_id:
                visit(row, 1, set())
        if len(result) != len(rows):
            raise ConnectorError("TARGETS_UNAVAILABLE", "The collection hierarchy is invalid.", 503)
        return result

    def get_selected_target(self) -> str:
        return self.selected_target

    def _collection_ids(self, target_id: str) -> list[str]:
        if target_id == "L1":
            return []
        identity = target_id[1:] if target_id.startswith("C") else None
        if identity not in {row["id"] for row in self.store.list_collections()}:
            raise ConnectorError("COLLECTION_NOT_FOUND", "The selected collection is unavailable.")
        return [identity]

    def save_items(self, *, source_id: str, items: list[dict], target_id: str, raw_request: dict) -> dict:
        target_collections = self._collection_ids(target_id)
        context = {k: v for k, v in raw_request.items() if k != "items"}
        result = {}
        from .store import new_id
        # Domain adapter uses the existing Store transaction/helpers. Unlike a
        # migration import, a capture must assign its existing target atomically
        # without creating a duplicate collection or an artificial import batch.
        with self.store.transaction():
            for item in items:
                key = item["source_key"]
                source_fp = fingerprint(item)
                link = self.store.db.execute("SELECT * FROM source_links WHERE source_id=? AND entity_type='item' AND source_key=?", (source_id, key)).fetchone()
                if link:
                    if link["source_fingerprint"] != source_fp:
                        raise ConnectorError("SESSION_EXISTS", "This persisted Connector item has different source data; use a new save session.", 409)
                    self.store._row("items", link["entity_id"])
                    result[key] = link["entity_id"]
                    continue
                identity = new_id()
                metadata = {name: item.get(name, [] if name in {"authors", "tags"} else "") for name in METADATA_FIELDS if name != "collection_ids"}
                metadata["collection_ids"] = target_collections
                self.store._write_item(identity, self.store._metadata(metadata), created_at=now())
                self.store._import_notes_and_declarations(identity, source_id, item)
                raw = {"item": item["raw_source"], "capture_context": context}
                self.store.db.execute("INSERT INTO source_links VALUES(?,?,?,?,?,?,?,?)", (source_id, "item", key, identity,
                                      "0", source_fp, self.store._target_fingerprint("item", identity), encode(raw)))
                result[key] = identity
        self.base_tags[source_id] = {result[item["source_key"]]: list(item["tags"]) for item in items}
        return result

    async def save_pdf(self, data: bytes, *, item_id: str | None, filename: str, metadata: dict,
                       source_id: str, attachment_key: str) -> dict:
        metadata = _attachment_metadata(metadata)
        source_fp = fingerprint({"sha256": hashlib.sha256(data).hexdigest(), "metadata": metadata, "item_id": item_id})
        with self.store.lock:
            # Validate before writing any blob or record. The hook validates again
            # inside the transaction in case a collection changed in between.
            standalone_metadata = ({"title": metadata["title"], "url": metadata.get("url", ""),
                                    "collection_ids": self._collection_ids(self.selected_target)} if item_id is None else None)
            if standalone_metadata is not None:
                self.store._metadata(standalone_metadata, partial=True)
            link = self.store.db.execute("SELECT * FROM source_links WHERE source_id=? AND entity_type='connector-attachment' AND source_key=?", (source_id, attachment_key)).fetchone()
        if link:
            if link["source_fingerprint"] != source_fp:
                raise ConnectorError("ATTACHMENT_ID_CONFLICT", "The persisted attachment id identifies different source data.", 409)
            attachment_id = link["entity_id"]
            identity = self.store.get_attachment(attachment_id)["item_id"]
        else:
            def record_source(saved: dict) -> None:
                identity, attachment_id = saved["item"]["id"], saved["attachment"]["id"]
                if standalone_metadata is not None:
                    self.store._write_item(identity, self.store._metadata(standalone_metadata, partial=True))
                self.store.db.execute("INSERT INTO source_links VALUES(?,?,?,?,?,?,?,?)", (source_id, "connector-attachment", attachment_key,
                                      attachment_id, "0", source_fp, fingerprint(self.store.get_attachment(attachment_id)), encode(metadata)))
            # Store owns PDF validation/blob publication. Its synchronous hook
            # commits item/attachment/metadata/source identity as one transaction.
            result = self.store.add_pdf(data, filename=filename, item_id=item_id, on_saved=record_source)
            identity = result["item"]["id"]
            attachment_id = result["attachment"]["id"]
            if item_id is None:
                self.base_tags.setdefault(source_id, {})[identity] = []
        bridge = {"reader_ready": False, "native_bridge": {"status": "not_configured"}}
        if self.pdf_callback is not None:
            try:
                bridge_result = await _call(self.pdf_callback, self.store, attachment_id)
                if isinstance(bridge_result, dict):
                    bridge = bridge_result
                else:
                    bridge = {"reader_ready": False, "native_bridge": {"status": "failed", "code": "INVALID_BRIDGE_RESULT"}}
            except Exception:
                bridge = {"reader_ready": False, "native_bridge": {"status": "failed", "code": "NATIVE_BRIDGE_UNAVAILABLE"}}
        return {"item_id": identity, "attachment_id": attachment_id, **bridge}

    def update_session(self, *, item_ids: list[str], target_id: str, tags: list[str], note: str, source_id: str) -> None:
        collections = self._collection_ids(target_id)
        with self.store.transaction():
            for identity in item_ids:
                # This receiver changes only the fields the Connector popup edits.
                self.store._row("items", identity)
                base = self.base_tags.get(source_id, {}).get(identity, [])
                merged = list(dict.fromkeys(base + tags))
                metadata = self.store._metadata({"tags": merged, "collection_ids": collections}, partial=True)
                self.store._write_item(identity, metadata)
                row = self.store.db.execute("SELECT id FROM notes WHERE item_id=? AND source_id=? AND source_key=?",
                                            (identity, source_id, "$connector-session-note")).fetchone()
                if not note:
                    if row:
                        self.store.db.execute("DELETE FROM notes WHERE id=?", (row["id"],))
                elif row:
                    self.store.db.execute("UPDATE notes SET body=?,updated_at=? WHERE id=?", (note, now(), row["id"]))
                else:
                    from .store import new_id
                    timestamp = now()
                    self.store.db.execute("INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                                          (new_id(), identity, None, None, "", "", note, timestamp, timestamp,
                                           source_id, "$connector-session-note", None, None, None, encode({"note": note})))
        self.selected_target = target_id


def create_store_connector_service(store, *, pdf_callback: Callable | None = None,
                                   library_name: str = "RetainPDF 文献库", library_namespace: str = "retainpdf-local",
                                   product_version: str = "4.2.5", **options) -> ConnectorService:
    return ConnectorService(StoreConnectorBackend(store, pdf_callback=pdf_callback), library_name=library_name,
                            library_namespace=library_namespace, product_version=product_version, **options)


def _extension_origin(origin: str, service: ConnectorService) -> bool:
    try:
        value = urlsplit(origin)
        return ((not service.allowed_extension_origins or origin in service.allowed_extension_origins)
                and value.scheme in {"chrome-extension", "moz-extension"} and value.path in {"", "/"}
                and not value.query and not value.fragment and value.port is None
                and value.username is None and value.password is None
                and bool(re.fullmatch(r"[A-Za-z0-9-]{16,128}", value.hostname or "")))
    except ValueError:
        return False


def _guard(request: Request, service: ConnectorService, *, preflight: bool = False) -> str | None:
    singular_headers = ("host", "origin", "content-type", "content-length", "x-metadata",
                        "x-zotero-version", "x-zotero-connector-api-version", "sec-fetch-site",
                        "sec-fetch-mode", "access-control-request-method", "access-control-request-headers")
    if any(len(request.headers.getlist(name)) > 1 for name in singular_headers):
        raise ConnectorError("AMBIGUOUS_HEADERS", "Provide each protocol and security header exactly once.")
    if request.client is None:
        raise ConnectorError("LOOPBACK_REQUIRED", "Only direct loopback clients may access this receiver.", 403)
    try:
        address = ipaddress.ip_address(request.client.host)
        if not address.is_loopback:
            raise ValueError
    except ValueError:
        raise ConnectorError("LOOPBACK_REQUIRED", "Only direct loopback clients may access this receiver.", 403) from None
    host = request.headers.get("host", "")
    if not re.fullmatch(r"(?:127\.0\.0\.1|localhost|\[::1\])(?::[0-9]{1,5})?", host, re.I):
        raise ConnectorError("INVALID_HOST", "Use a loopback Host header.", 400)
    if ":" in host and not host.endswith("[::1]"):
        suffix = host.rsplit(":", 1)[-1]
        if suffix.isdigit() and not 1 <= int(suffix) <= 65535:
            raise ConnectorError("INVALID_HOST", "The Host port is invalid.", 400)
    if any(key in request.headers for key in ("forwarded", "x-forwarded-host", "x-forwarded-for")):
        raise ConnectorError("DIRECT_LOOPBACK_REQUIRED", "Forwarded Connector requests are not supported.", 403)
    origin = request.headers.get("origin")
    if origin is not None and not _extension_origin(origin, service):
        raise ConnectorError("UNTRUSTED_ORIGIN", "Web origins and bookmarklets cannot access this experimental receiver.", 403)
    fetch_site = request.headers.get("sec-fetch-site")
    if origin is None and fetch_site not in (None, "none") and request.headers.get("x-zotero-connector-api-version") != "3":
        raise ConnectorError("UNTRUSTED_WEB_REQUEST", "Web-initiated Connector requests are not accepted.", 403)
    if preflight:
        if origin is None or request.headers.get("access-control-request-method") != "POST":
            raise ConnectorError("INVALID_PREFLIGHT", "Only explicit extension POST preflights are supported.", 403)
        names = {name.strip().lower() for name in request.headers.get("access-control-request-headers", "").split(",") if name.strip()}
        allowed = {"content-type", "x-zotero-version", "x-zotero-connector-api-version", "x-metadata"}
        if not {"x-zotero-version", "x-zotero-connector-api-version"} <= names or not names <= allowed:
            raise ConnectorError("INVALID_PREFLIGHT", "The extension preflight headers are unsupported.", 403)
        return origin
    navigation_ping = (request.method == "GET" and request.url.path == "/connector/ping" and origin is None
                       and request.headers.get("sec-fetch-mode") in (None, "navigate"))
    if not navigation_ping:
        if request.headers.get("x-zotero-connector-api-version") != "3":
            raise ConnectorError("CONNECTOR_API_UNSUPPORTED", "Only Connector API version 3 is accepted.", 412)
        client_version = request.headers.get("x-zotero-version", "")
        if not re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,3}(?:[A-Za-z0-9.+-]*)", client_version) or len(client_version) > 64:
            raise ConnectorError("CONNECTOR_VERSION_REQUIRED", "Provide the official Connector's bounded version header.", 403)
    return origin


async def _body(request: Request, maximum: int) -> bytes:
    declared = request.headers.get("content-length")
    if declared is not None and (not declared.isdigit() or int(declared) > maximum):
        raise ConnectorError("REQUEST_TOO_LARGE", "The request length exceeds the receiver limit.", 413)
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > maximum:
            raise ConnectorError("REQUEST_TOO_LARGE", "The request exceeds the receiver limit.", 413)
        chunks.append(chunk)
    if declared is not None and size != int(declared):
        raise ConnectorError("BODY_LENGTH_MISMATCH", "Content-Length does not match the received bytes.")
    return b"".join(chunks)


def create_connector_router(service: ConnectorService) -> APIRouter:
    router = APIRouter(prefix="/connector")

    @router.api_route("/{method:path}", methods=["GET", "POST", "OPTIONS"])
    async def dispatch(method: str, request: Request):
        origin = None
        try:
            origin = _guard(request, service, preflight=request.method == "OPTIONS")
            headers = dict(service.response_headers)
            if origin:
                headers.update({"Access-Control-Allow-Origin": origin, "Vary": "Origin"})
            if method not in SUPPORTED_METHODS:
                raise ConnectorError("UNSUPPORTED_METHOD", "This experimental receiver does not implement this method; translator execution, snapshots, resolvers and document integration are unsupported.", 501)
            if request.method == "OPTIONS":
                headers.update({"Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type, X-Zotero-Version, X-Zotero-Connector-API-Version, X-Metadata"})
                return Response(status_code=204, headers=headers)
            if request.method == "GET":
                if method != "ping":
                    raise ConnectorError("METHOD_NOT_ALLOWED", "This endpoint requires POST.", 405)
                return HTMLResponse('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>ReadFlow · Zotero Connector</title></head><body>ReadFlow 正在接收 Zotero Connector 的保存。</body></html>', headers=headers)
            content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if method in {"saveAttachment", "saveStandaloneAttachment"}:
                if content_type != "application/pdf":
                    raise ConnectorError("UNSUPPORTED_ATTACHMENT_TYPE", "The experimental receiver currently accepts PDF bytes only.", 415)
                raw_metadata = request.headers.get("x-metadata")
                if not raw_metadata:
                    raise ConnectorError("METADATA_NOT_PROVIDED", "X-Metadata JSON is required.")
                metadata = _parse_json(raw_metadata.encode("utf-8"), MAX_METADATA_BYTES)
                metadata, redacted = sanitize_source(metadata)
                claimed_type = metadata.get("contentType")
                if claimed_type not in (None, "application/pdf"):
                    raise ConnectorError("ATTACHMENT_TYPE_MISMATCH", "X-Metadata contentType must match the PDF upload.", 415)
                if len(request.query_params.getlist("sessionID")) > 1:
                    raise ConnectorError("AMBIGUOUS_SESSION_ID", "Provide exactly one query sessionID.")
                raw = await _body(request, MAX_PDF_BYTES)
                result = await service.save_attachment(raw, metadata, request.query_params.get("sessionID"), standalone=method == "saveStandaloneAttachment")
                if redacted:
                    result.setdefault("warnings", []).append({"code": "SOURCE_CREDENTIALS_REMOVED", "message": "Sensitive transport fields or credential-bearing URLs were removed before storage."})
                return JSONResponse(result, status_code=201, headers=headers)
            if content_type != "application/json":
                raise ConnectorError("UNSUPPORTED_CONTENT_TYPE", "Use application/json with Connector API headers; simple web POSTs are not accepted.", 415)
            payload = _parse_json(await _body(request, MAX_JSON_BYTES), MAX_JSON_BYTES)
            payload, redacted = sanitize_source(payload)
            if method == "ping":
                result = {"prefs": dict(_PREFS), "client": "RetainPDF", "experimental": True, "realConnectorVerified": False}
            elif method == "getSelectedCollection":
                result = await service.selected_collection()
            elif method == "saveItems":
                result = await service.save_items(payload)
            elif method == "updateSession":
                result = await service.update_session(payload)
            elif method == "delaySync":
                return Response(status_code=204, headers=headers)
            else:
                session = service._session(payload.get("sessionID"))
                async with session.lock:
                    if _key(payload.get("itemID"), "itemID") not in session.item_ids:
                        raise ConnectorError("PARENT_ITEM_NOT_FOUND", "No saved item matches this resolver request.")
                result = False
            if redacted and isinstance(result, dict):
                result.setdefault("warnings", []).append({"code": "SOURCE_CREDENTIALS_REMOVED", "message": "Sensitive transport fields or credential-bearing URLs were removed before storage."})
            return JSONResponse(result, status_code=201 if method == "saveItems" else 200, headers=headers)
        except (ConnectorError, StoreError, ImportPlanError) as exc:
            code = getattr(exc, "code", "INVALID_REQUEST")
            service._failure(method if method in SUPPORTED_METHODS else "unsupported", code)
            error_headers = dict(service.response_headers)
            if origin:
                error_headers.update({"Access-Control-Allow-Origin": origin, "Vary": "Origin"})
            return JSONResponse({"error": code, "message": str(exc), "experimental": True}, status_code=getattr(exc, "status", 400), headers=error_headers)
        except Exception:
            service._failure(method if method in SUPPORTED_METHODS else "unsupported", "BACKEND_UNAVAILABLE")
            return JSONResponse({"error": "BACKEND_UNAVAILABLE", "message": "The capture backend failed. Check the RetainPDF capture report; saved PDF bytes are not automatically deleted.", "experimental": True}, status_code=503, headers=service.response_headers)

    return router


def create_connector_app(service: ConnectorService) -> FastAPI:
    app = FastAPI(title="RetainPDF experimental Connector receiver", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.connector = service
    app.include_router(create_connector_router(service))
    return app
