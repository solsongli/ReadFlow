"""Isolated research-library prototype. Never opens the RetainPDF legacy database."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import threading
from typing import Any, Callable
import uuid

MAX_PDF_BYTES = 64 * 1024 * 1024
MAX_PAGES = 2000
MAX_EXTRACTED_CHARACTERS = 2_000_000
PARSER_VERSION = "pymupdf-native-v1"
NATIVE_ANNOTATION_KEY = "retain_native_annotation"
METADATA_FIELDS = ("title", "item_type", "authors", "date", "doi", "url", "abstract", "tags", "collection_ids")
# CSL 1.0.2 Appendix III: protocol identifiers, independently implemented.
# https://docs.citationstyles.org/en/stable/specification.html#appendix-iii-types
CSL_TYPES = frozenset({
    "article", "article-journal", "article-magazine", "article-newspaper", "bill", "book",
    "broadcast", "chapter", "classic", "collection", "dataset", "document", "entry",
    "entry-dictionary", "entry-encyclopedia", "event", "figure", "graphic", "hearing",
    "interview", "legal_case", "legislation", "manuscript", "map", "motion_picture",
    "musical_score", "pamphlet", "paper-conference", "patent", "performance", "periodical",
    "personal_communication", "post", "post-weblog", "regulation", "report", "review",
    "review-book", "software", "song", "speech", "standard", "thesis", "treaty", "webpage",
})
ZOTERO_TO_CSL_TYPE = {
    "journalArticle": "article-journal", "conferencePaper": "paper-conference",
    "bookSection": "chapter", "magazineArticle": "article-magazine",
    "newspaperArticle": "article-newspaper", "preprint": "article",
}
CSL_TO_BIBTEX_TYPE = {
    "article-journal": "article", "article-magazine": "article", "article-newspaper": "article",
    "paper-conference": "inproceedings", "chapter": "incollection",
    "entry-dictionary": "incollection", "entry-encyclopedia": "incollection",
    "book": "book", "report": "techreport", "manuscript": "unpublished",
}


class StoreError(ValueError):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.status = code, status


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def new_id() -> str:
    return str(uuid.uuid4())


def encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: Any) -> str:
    return hashlib.sha256(encode(value).encode("utf-8")).hexdigest()


def text(value: Any, field: str, limit: int, *, required: bool = False) -> str:
    if not isinstance(value, str) or len(value) > limit or "\x00" in value:
        raise StoreError("INVALID_FIELD", f"{field} must be text of at most {limit} characters.")
    if required and not value.strip():
        raise StoreError("INVALID_FIELD", f"{field} must not be empty.")
    return value.strip() if field != "body" else value


def strings(value: Any, field: str, *, maximum: int = 100, length: int = 500) -> list[str]:
    if not isinstance(value, list) or len(value) > maximum:
        raise StoreError("INVALID_FIELD", f"{field} must be an array with at most {maximum} entries.")
    output: list[str] = []
    for entry in value:
        entry = text(entry, field, length)
        if entry and entry not in output:
            output.append(entry)
    return output


class Store:
    """A single explicitly supplied data root, protected by a serialized transaction lock."""

    def __init__(self, data_root: Path):
        self.data_root = Path(data_root).expanduser().resolve()
        self.data_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        marker = self.data_root / "research-library.json"
        db_path = self.data_root / "library.sqlite3"
        owned_paths = [marker, db_path, self.data_root / "library.sqlite3-wal",
                       self.data_root / "library.sqlite3-shm", self.data_root / "blobs"]
        if any(path.is_symlink() for path in owned_paths):
            raise StoreError("UNSAFE_DATA_ROOT", "Research-library files must not redirect outside the data directory.")
        if not marker.exists():
            if db_path.exists() or any((self.data_root / name).exists() for name in ("db", "secrets", "jobs", "uploads")):
                raise StoreError("UNSAFE_DATA_ROOT", "Use a new isolated research-library data directory.")
            try:
                with marker.open("x", encoding="utf-8") as stream:
                    stream.write(encode({"application": "retainpdf-research-library", "schema_version": 1}))
            except FileExistsError:
                pass
        try:
            marker_value = json.loads(marker.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise StoreError("INVALID_DATA_ROOT", "The research-library marker is invalid.") from exc
        if marker_value != {"application": "retainpdf-research-library", "schema_version": 1}:
            raise StoreError("INVALID_DATA_ROOT", "The data directory belongs to another application or schema.")
        self.blobs = self.data_root / "blobs"
        self.blobs.mkdir(exist_ok=True, mode=0o700)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(db_path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("PRAGMA busy_timeout=5000")
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS items(
          id TEXT PRIMARY KEY, title TEXT NOT NULL, item_type TEXT NOT NULL,
          authors_json TEXT NOT NULL, date TEXT NOT NULL, doi TEXT NOT NULL,
          url TEXT NOT NULL, abstract TEXT NOT NULL, tags_json TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS collections(
          id TEXT PRIMARY KEY, name TEXT NOT NULL,
          parent_id TEXT REFERENCES collections(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS item_collections(
          item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          collection_id TEXT NOT NULL REFERENCES collections(id),
          PRIMARY KEY(item_id,collection_id));
        CREATE TABLE IF NOT EXISTS attachments(
          id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          sha256 TEXT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL,
          page_count INTEGER NOT NULL, text_status TEXT NOT NULL, created_at TEXT NOT NULL,
          UNIQUE(item_id,sha256));
        CREATE TABLE IF NOT EXISTS parse_revisions(
          id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, parser_version TEXT NOT NULL,
          parse_status TEXT NOT NULL, pages_json TEXT NOT NULL, created_at TEXT NOT NULL,
          UNIQUE(sha256,parser_version));
        CREATE TABLE IF NOT EXISTS notes(
          id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          attachment_id TEXT REFERENCES attachments(id), page_idx INTEGER,
          quote TEXT NOT NULL, translated_quote TEXT NOT NULL, body TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          source_id TEXT, source_key TEXT, source_attachment_key TEXT,
          source_page_idx INTEGER, source_page_label TEXT, raw_source_json TEXT,
          UNIQUE(item_id,source_id,source_key));
        CREATE TABLE IF NOT EXISTS imported_attachments(
          id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          source_id TEXT NOT NULL, source_key TEXT NOT NULL, parent_key TEXT,
          filename TEXT NOT NULL, mime TEXT NOT NULL, link_mode TEXT NOT NULL,
          missing_reason TEXT NOT NULL, raw_source_json TEXT NOT NULL,
          UNIQUE(item_id,source_id,source_key));
        CREATE TABLE IF NOT EXISTS source_links(
          source_id TEXT NOT NULL, entity_type TEXT NOT NULL, source_key TEXT NOT NULL,
          entity_id TEXT NOT NULL, source_version TEXT, source_fingerprint TEXT NOT NULL,
          target_fingerprint TEXT NOT NULL, raw_source_json TEXT NOT NULL,
          PRIMARY KEY(source_id,entity_type,source_key));
        CREATE TABLE IF NOT EXISTS import_batches(
          id TEXT PRIMARY KEY, source_id TEXT NOT NULL, plan_hash TEXT NOT NULL,
          created_at TEXT NOT NULL, status TEXT NOT NULL, report_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS import_changes(
          id INTEGER PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES import_batches(id),
          entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, source_key TEXT NOT NULL,
          operation TEXT NOT NULL, before_json TEXT, after_fingerprint TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS attachment_item ON attachments(item_id);
        CREATE INDEX IF NOT EXISTS note_item ON notes(item_id);
        """)

    def close(self) -> None:
        with self.lock:
            self.db.close()

    @contextmanager
    def transaction(self):
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                yield
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def _row(self, table: str, identity: str) -> sqlite3.Row:
        # Callers supply constant table names, never user-controlled SQL identifiers.
        row = self.db.execute(f"SELECT * FROM {table} WHERE id=?", (identity,)).fetchone()
        if row is None:
            raise StoreError("NOT_FOUND", "The requested record does not exist.", 404)
        return row

    def _metadata(self, data: dict, *, partial: bool = False) -> dict:
        if not isinstance(data, dict):
            raise StoreError("INVALID_ITEM", "Metadata must be a JSON object.")
        unknown = set(data) - set(METADATA_FIELDS)
        if unknown:
            raise StoreError("INVALID_FIELD", "Unsupported metadata fields: " + ", ".join(sorted(unknown)))
        defaults = {"title": "Untitled", "item_type": "journalArticle", "authors": [], "date": "",
                    "doi": "", "url": "", "abstract": "", "tags": [], "collection_ids": []}
        result = {}
        for key, default in defaults.items():
            if partial and key not in data:
                continue
            value = data.get(key, default)
            if key in ("authors", "tags", "collection_ids"):
                result[key] = strings(value, key, maximum=100, length=500)
            else:
                limit = 200_000 if key == "abstract" else 1000 if key == "title" else 2000 if key == "url" else 500
                result[key] = text(value, key, limit, required=key in ("title", "item_type"))
        if "url" in result and result["url"]:
            if not re.match(r"^https?://", result["url"], flags=re.IGNORECASE):
                raise StoreError("INVALID_URL", "Only http or https bibliographic URLs are accepted.")
        for collection_id in result.get("collection_ids", []):
            self._row("collections", collection_id)
        return result

    def _write_item(self, identity: str, metadata: dict, *, created_at: str | None = None) -> None:
        current = None if created_at is not None else self._row("items", identity)
        if current is not None:
            for key in METADATA_FIELDS:
                if key not in metadata and key != "collection_ids":
                    metadata[key] = json.loads(current[key + "_json"]) if key in ("authors", "tags") else current[key]
        timestamp = now()
        if current is None:
            self.db.execute(
                "INSERT INTO items VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (identity, metadata["title"], metadata["item_type"], encode(metadata["authors"]),
                 metadata["date"], metadata["doi"], metadata["url"], metadata["abstract"],
                 encode(metadata["tags"]), created_at or timestamp, timestamp))
        else:
            self.db.execute(
                "UPDATE items SET title=?,item_type=?,authors_json=?,date=?,doi=?,url=?,abstract=?,tags_json=?,updated_at=? WHERE id=?",
                (metadata["title"], metadata["item_type"], encode(metadata["authors"]), metadata["date"],
                 metadata["doi"], metadata["url"], metadata["abstract"], encode(metadata["tags"]), timestamp, identity))
        if "collection_ids" in metadata:
            self.db.execute("DELETE FROM item_collections WHERE item_id=?", (identity,))
            self.db.executemany("INSERT INTO item_collections VALUES(?,?)",
                                [(identity, collection_id) for collection_id in metadata["collection_ids"]])

    def create_item(self, data: dict) -> dict:
        with self.transaction():
            identity = new_id()
            self._write_item(identity, self._metadata(data), created_at=now())
            return self.get_item(identity)

    def update_item(self, identity: str, data: dict) -> dict:
        with self.transaction():
            self._row("items", identity)
            metadata = self._metadata(data, partial=True)
            if metadata:
                self._write_item(identity, metadata)
            return self.get_item(identity)

    def _attachment_dict(self, row: sqlite3.Row) -> dict:
        result = dict(row)
        result.update(document_id=row["sha256"], available=True)
        return result

    def _note_dict(self, row: sqlite3.Row) -> dict:
        result = dict(row)
        raw = result.pop("raw_source_json", None)
        if raw:
            payload = json.loads(raw)
            if isinstance(payload, dict) and isinstance(payload.get(NATIVE_ANNOTATION_KEY), dict):
                result["reader_annotation"] = payload[NATIVE_ANNOTATION_KEY]
        return result

    def get_item(self, identity: str) -> dict:
        with self.lock:
            row = self._row("items", identity)
            result = dict(row)
            result["authors"], result["tags"] = json.loads(result.pop("authors_json")), json.loads(result.pop("tags_json"))
            result["collection_ids"] = [entry[0] for entry in self.db.execute(
                "SELECT collection_id FROM item_collections WHERE item_id=? ORDER BY collection_id", (identity,))]
            result["attachments"] = [self._attachment_dict(entry) for entry in self.db.execute(
                "SELECT * FROM attachments WHERE item_id=? ORDER BY created_at,id", (identity,))]
            result["notes"] = [self._note_dict(entry) for entry in self.db.execute(
                "SELECT * FROM notes WHERE item_id=? ORDER BY created_at,id", (identity,))]
            declarations = [dict(entry) for entry in self.db.execute(
                "SELECT * FROM imported_attachments WHERE item_id=? ORDER BY source_key", (identity,))]
            for entry in declarations:
                entry.pop("raw_source_json")
                entry["available"] = False
            result["imported_attachment_declarations"] = declarations
            result["migration_warnings"] = [
                {"code": "ATTACHMENT_NOT_IMPORTED", "message": "Associate the original PDF manually after import.",
                 "source_key": entry["source_key"], "filename": entry["filename"]} for entry in declarations]
            result["source_links"] = [
                {"source_id": entry["source_id"], "source_key": entry["source_key"], "source_version": entry["source_version"]}
                for entry in self.db.execute("SELECT * FROM source_links WHERE entity_type='item' AND entity_id=?", (identity,))]
            return result

    def list_items(self, *, query: str = "", collection_id: str | None = None) -> dict:
        query = text(query, "query", 1000)
        with self.lock:
            conditions, arguments = [], []
            if query:
                # Escape wildcards so the search query has literal substring semantics.
                escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                conditions.append("(title LIKE ? ESCAPE '\\' OR authors_json LIKE ? ESCAPE '\\' OR doi LIKE ? ESCAPE '\\' OR abstract LIKE ? ESCAPE '\\' OR tags_json LIKE ? ESCAPE '\\')")
                arguments.extend(["%" + escaped + "%"] * 5)
            if collection_id:
                self._row("collections", collection_id)
                conditions.append("id IN(SELECT item_id FROM item_collections WHERE collection_id=?)")
                arguments.append(collection_id)
            where = " WHERE " + " AND ".join(conditions) if conditions else ""
            identities = [row[0] for row in self.db.execute(
                "SELECT id FROM items" + where + " ORDER BY updated_at DESC,id", arguments)]
            items = [self.get_item(identity) for identity in identities]
            all_tags = sorted({tag for row in self.db.execute("SELECT tags_json FROM items") for tag in json.loads(row[0])})
            return {"items": items, "collections": self.list_collections(), "tags": all_tags}

    def list_collections(self) -> list[dict]:
        with self.lock:
            return [dict(row) for row in self.db.execute("SELECT * FROM collections ORDER BY name,id")]

    def create_collection(self, data: dict) -> dict:
        with self.transaction():
            if not isinstance(data, dict) or set(data) - {"name", "parent_id"}:
                raise StoreError("INVALID_COLLECTION", "Collection accepts name and parent_id.")
            name = text(data.get("name", ""), "name", 500, required=True)
            parent = data.get("parent_id")
            if parent is not None:
                parent = text(parent, "parent_id", 100, required=True)
                self._row("collections", parent)
            identity, timestamp = new_id(), now()
            self.db.execute("INSERT INTO collections VALUES(?,?,?,?,?)", (identity, name, parent, timestamp, timestamp))
            return dict(self._row("collections", identity))

    def update_collection(self, identity: str, data: dict) -> dict:
        with self.transaction():
            row = self._row("collections", identity)
            if not isinstance(data, dict) or set(data) - {"name", "parent_id"}:
                raise StoreError("INVALID_COLLECTION", "Collection accepts name and parent_id.")
            name = text(data.get("name", row["name"]), "name", 500, required=True)
            parent = data.get("parent_id", row["parent_id"])
            visited = {identity}
            while parent is not None:
                parent = text(parent, "parent_id", 100, required=True)
                if parent in visited:
                    raise StoreError("COLLECTION_CYCLE", "A collection cannot be its own ancestor.")
                visited.add(parent)
                parent_row = self._row("collections", parent)
                parent = parent_row["parent_id"]
            self.db.execute("UPDATE collections SET name=?,parent_id=?,updated_at=? WHERE id=?",
                            (name, data.get("parent_id", row["parent_id"]), now(), identity))
            return dict(self._row("collections", identity))

    def _store_blob(self, digest: str, data: bytes) -> None:
        directory = self.blobs / digest[:2]
        destination = directory / (digest + ".pdf")
        if directory.is_symlink() or destination.is_symlink() or not destination.resolve().is_relative_to(self.data_root):
            raise StoreError("UNSAFE_BLOB_PATH", "The PDF store cannot use paths outside its own data directory.")
        directory.mkdir(exist_ok=True, mode=0o700)
        if destination.exists():
            if hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
                raise StoreError("BLOB_INTEGRITY_FAILURE", "Stored PDF checksum failed; restore the backup.", 500)
            return
        handle, temporary_name = tempfile.mkstemp(prefix=".upload-", dir=directory)
        temporary = Path(temporary_name)
        try:
            with os.fdopen(handle, "wb") as output:
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
            try:
                # Hard linking publishes a completed blob without ever replacing another blob.
                os.link(temporary, destination)
            except FileExistsError:
                if hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
                    raise StoreError("BLOB_INTEGRITY_FAILURE", "Stored PDF checksum failed.", 500)
        finally:
            temporary.unlink(missing_ok=True)

    def add_pdf(self, data: bytes, *, filename: str = "paper.pdf", item_id: str | None = None,
                on_saved: Callable[[dict], None] | None = None, deduplicate: bool = False) -> dict:
        """Save a PDF and optional related metadata in the same database transaction.

        on_saved receives the normal result before commit, including duplicate uploads.
        It must use this transaction for database writes, without nested transactions or
        network I/O. Exceptions roll back all record changes; immutable blob publication
        retains its existing behavior and can leave an unreferenced blob after failure.
        """
        if not data or len(data) > MAX_PDF_BYTES or b"%PDF-" not in data[:1024]:
            raise StoreError("INVALID_PDF", "Upload a PDF no larger than 64 MiB.")
        filename = text(filename.replace("\\", "/").split("/")[-1], "filename", 240, required=True)
        try:
            import fitz
            with fitz.open(stream=data, filetype="pdf") as document:
                if document.needs_pass:
                    raise StoreError("ENCRYPTED_PDF", "Password-protected PDF files are not supported.")
                page_count = document.page_count
                if page_count < 1 or page_count > MAX_PAGES:
                    raise StoreError("PDF_PAGE_LIMIT", "PDF must contain 1 to 2000 pages.")
                suggested_title = ((document.metadata or {}).get("title") or "").strip()[:1000]
        except StoreError:
            raise
        except Exception as exc:
            raise StoreError("INVALID_PDF", "The PDF could not be opened by the local parser.") from exc
        digest = hashlib.sha256(data).hexdigest()
        with self.transaction():
            if item_id is not None:
                self._row("items", item_id)
            if deduplicate:
                has_state = self.db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='item_state'").fetchone()
                join = "LEFT JOIN item_state s ON s.item_id=a.item_id" if has_state else ""
                priority = "(s.deleted_at IS NOT NULL)," if has_state else ""
                prior = self.db.execute(f"SELECT a.* FROM attachments a {join} WHERE a.sha256=? ORDER BY {priority} a.created_at,a.id LIMIT 1", (digest,)).fetchone()
                if prior is not None:
                    # Only /files opts in. Connector/import-plan attachment semantics stay unchanged.
                    item_id = prior["item_id"]
                    self._store_blob(digest, data)
                    if has_state:
                        self.db.execute("UPDATE item_state SET deleted_at=NULL,updated_at=? WHERE item_id=? AND deleted_at IS NOT NULL", (now(), item_id))
                    result = {"item": self.get_item(item_id), "attachment": self._attachment_dict(prior), "duplicate": True}
                    if on_saved is not None:
                        on_saved(result)
                        result["item"] = self.get_item(item_id)
                    return result
            if item_id is None:
                item_id = new_id()
                self._write_item(item_id, self._metadata({"title": suggested_title or filename.rsplit(".", 1)[0]}),
                                 created_at=now())
            existing = self.db.execute("SELECT * FROM attachments WHERE item_id=? AND sha256=?", (item_id, digest)).fetchone()
            if existing is not None:
                result = {"item": self.get_item(item_id), "attachment": self._attachment_dict(existing), "duplicate": True}
                if on_saved is not None:
                    on_saved(result)
                    result["item"] = self.get_item(item_id)
                return result
            self._store_blob(digest, data)
            attachment_id = new_id()
            self.db.execute("INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)",
                            (attachment_id, item_id, digest, filename, "application/pdf", page_count, "not_parsed", now()))
            self.db.execute("UPDATE items SET updated_at=? WHERE id=?", (now(), item_id))
            result = {"item": self.get_item(item_id), "attachment": self.get_attachment(attachment_id), "duplicate": False}
            if on_saved is not None:
                on_saved(result)
                result["item"] = self.get_item(item_id)
            return result

    def get_attachment(self, identity: str) -> dict:
        with self.lock:
            return self._attachment_dict(self._row("attachments", identity))

    def attachment_path(self, identity: str) -> Path:
        attachment = self.get_attachment(identity)
        digest = attachment["sha256"]
        if not re.fullmatch("[0-9a-f]{64}", digest):
            raise StoreError("BLOB_INTEGRITY_FAILURE", "Invalid attachment checksum.", 500)
        path = self.blobs / digest[:2] / (digest + ".pdf")
        if path.is_symlink() or not path.resolve().is_relative_to(self.data_root):
            raise StoreError("UNSAFE_BLOB_PATH", "The PDF store cannot read paths outside its own data directory.")
        if not path.is_file():
            raise StoreError("ATTACHMENT_MISSING", "The original PDF is missing; restore the blob backup.", 404)
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise StoreError("BLOB_INTEGRITY_FAILURE", "The original PDF checksum has changed.", 500)
        return path

    def get_pages(self, identity: str, *, prefer_ocr: bool = True) -> dict:
        attachment = self.get_attachment(identity)
        digest = attachment["sha256"]
        path = self.attachment_path(identity)
        if prefer_ocr:
            revision = self.ocr_revision(digest)
            if revision is not None:
                return revision
        with self.lock:
            cached = self.db.execute("SELECT * FROM parse_revisions WHERE sha256=? AND parser_version=?",
                                     (digest, PARSER_VERSION)).fetchone()
            if cached is not None:
                return {"revision_id": cached["id"], "sha256": digest, "parse_status": cached["parse_status"],
                        "pages": json.loads(cached["pages_json"]), "parser_version": PARSER_VERSION}
        pages, characters, truncated = [], 0, False
        try:
            import fitz
            with fitz.open(path) as document:
                for page_idx in range(document.page_count):
                    page = document[page_idx]
                    blocks = []
                    for index, block in enumerate(page.get_text("blocks", sort=True)):
                        if len(block) >= 7 and block[6] != 0:
                            continue
                        block_text = str(block[4]).strip()
                        if not block_text:
                            continue
                        remaining = MAX_EXTRACTED_CHARACTERS - characters
                        if remaining <= 0:
                            truncated = True
                            break
                        if len(block_text) > remaining:
                            block_text = block_text[:remaining]
                            truncated = True
                        characters += len(block_text)
                        blocks.append({"block_id": f"p{page_idx}-b{index}", "text": block_text,
                                       "bbox": [round(float(value), 3) for value in block[:4]]})
                    label = page.get_label() or str(page_idx + 1)
                    pages.append({"page_idx": page_idx, "page_label": label, "text": "\n\n".join(block["text"] for block in blocks),
                                  "blocks": blocks, "width": page.rect.width, "height": page.rect.height})
        except Exception as exc:
            raise StoreError("PDF_PARSE_FAILED", "Local PDF text extraction failed; the original file remains unchanged.", 422) from exc
        parse_status = "truncated" if truncated else "needs_ocr" if not characters else "partial_needs_ocr" if any(not page["text"] for page in pages) else "native_text"
        revision_id = fingerprint({"sha256": digest, "parser_version": PARSER_VERSION})
        with self.transaction():
            self.db.execute("INSERT OR IGNORE INTO parse_revisions VALUES(?,?,?,?,?,?)",
                            (revision_id, digest, PARSER_VERSION, parse_status, encode(pages), now()))
            self.db.execute("UPDATE attachments SET text_status=? WHERE sha256=?", (parse_status, digest))
        return {"revision_id": revision_id, "sha256": digest, "parse_status": parse_status,
                "pages": pages, "parser_version": PARSER_VERSION}

    def ocr_revision(self, digest: str, parser_version: str | None = None) -> dict | None:
        """Read only completed, immutable OCR caches bound to source SHA and engine manifest."""
        with self.lock:
            query = "SELECT * FROM parse_revisions WHERE sha256=? AND parser_version LIKE 'ocr-v1-%' AND parse_status='ocr_complete'"
            args = [digest]
            if parser_version is not None:
                query += " AND parser_version=?"
                args.append(parser_version)
            row = self.db.execute(query + " ORDER BY created_at DESC LIMIT 1", args).fetchone()
            if row is None:
                return None
            return {"revision_id": row["id"], "sha256": row["sha256"], "parse_status": row["parse_status"],
                    "pages": json.loads(row["pages_json"]), "parser_version": row["parser_version"]}

    def save_ocr_revision(self, identity: str, digest: str, parser_version: str, pages: list[dict]) -> dict:
        attachment = self.get_attachment(identity)
        self.attachment_path(identity)  # Verify source integrity again before publication.
        if attachment["sha256"] != digest or not re.fullmatch(r"ocr-v1-[0-9a-f]{64}", parser_version):
            raise StoreError("OCR_REVISION_INVALID", "OCR revision source or engine is invalid.", 409)
        if len(pages) != attachment["page_count"] or any(page.get("page_idx") != idx for idx, page in enumerate(pages)):
            raise StoreError("OCR_REVISION_INVALID", "OCR must preserve every physical page.", 422)
        if sum(len(page.get("text", "")) for page in pages) > MAX_EXTRACTED_CHARACTERS:
            raise StoreError("OCR_TEXT_LIMIT", "OCR exceeded the document text limit.", 422)
        revision_id = fingerprint({"sha256": digest, "parser_version": parser_version})
        with self.transaction():
            self.db.execute("INSERT OR IGNORE INTO parse_revisions VALUES(?,?,?,?,?,?)",
                            (revision_id, digest, parser_version, "ocr_complete", encode(pages), now()))
            self.db.execute("UPDATE attachments SET text_status=? WHERE sha256=?", ("ocr_complete", digest))
        return self.ocr_revision(digest, parser_version)

    def _validated_note(self, item_id: str, data: dict, *, previous: dict | None = None) -> dict:
        fields = {"attachment_id", "page_idx", "quote", "translated_quote", "body"}
        if not isinstance(data, dict) or set(data) - fields - {"reader_annotation"}:
            raise StoreError("INVALID_NOTE", "Note accepts attachment_id, page_idx, quote, translated_quote, body and optional reader_annotation.")
        defaults = {"attachment_id": None, "page_idx": None, "quote": "", "translated_quote": "", "body": ""}
        value = {**defaults, **(previous or {}), **data}
        value = {key: value[key] for key in fields}
        for key in ("quote", "translated_quote", "body"):
            value[key] = text(value[key], key, 100_000)
        if not any(value[key].strip() for key in ("body", "quote", "translated_quote")):
            raise StoreError("EMPTY_NOTE", "A note needs text or a quotation.")
        attachment_id, page_idx = value["attachment_id"], value["page_idx"]
        if attachment_id is not None:
            attachment_id = text(attachment_id, "attachment_id", 100, required=True)
            attachment = self._row("attachments", attachment_id)
            if attachment["item_id"] != item_id:
                raise StoreError("ATTACHMENT_SCOPE_MISMATCH", "A note cannot reference another paper's attachment.")
            value["attachment_id"] = attachment_id
        if page_idx is not None:
            if type(page_idx) is not int or attachment_id is None or page_idx < 0 or page_idx >= attachment["page_count"]:
                raise StoreError("INVALID_PAGE", "Page index must belong to the selected paper's PDF.")
        return value

    def _native_annotation_json(self, item_id: str, identity: str, value: dict, data: dict,
                                previous: dict | None = None) -> str | None:
        original = previous.get("raw_source_json") if previous else None
        payload = json.loads(original) if original else {}
        previous_annotation = payload.get(NATIVE_ANNOTATION_KEY) if isinstance(payload, dict) else None
        supplied = "reader_annotation" in data
        if not supplied and not isinstance(previous_annotation, dict):
            return original
        if supplied and previous is not None and not isinstance(previous_annotation, dict):
            # Imported Zotero data and ordinary notes cannot be rewritten into a native namespace.
            raise StoreError("SOURCE_NOTE_PROTECTED", "Existing source notes cannot be replaced by Reader annotation data.", 409)
        annotation = data.get("reader_annotation") if supplied else {
            **previous_annotation, "quote": value["quote"], "note": value["body"],
        }
        if not isinstance(annotation, dict):
            raise StoreError("INVALID_READER_ANNOTATION", "reader_annotation must be a JSON object.")
        stack, count = [(annotation, 0)], 0
        while stack:
            entry, depth = stack.pop()
            count += 1
            if depth > 12 or count > 4096:
                raise StoreError("INVALID_READER_ANNOTATION", "Reader annotation nesting or field count exceeds the limit.")
            if isinstance(entry, dict):
                if not all(isinstance(key, str) and len(key) <= 500 for key in entry):
                    raise StoreError("INVALID_READER_ANNOTATION", "Reader annotation field names are invalid.")
                stack.extend((part, depth + 1) for part in entry.values())
            elif isinstance(entry, list):
                stack.extend((part, depth + 1) for part in entry)
            elif isinstance(entry, str):
                text(entry, "reader_annotation", 100_000)
            elif entry is not None and type(entry) not in (bool, int, float):
                raise StoreError("INVALID_READER_ANNOTATION", "Reader annotation contains a non-JSON value.")
        try:
            encoded = json.dumps(annotation, ensure_ascii=False, allow_nan=False)
            encoded_size = len(encoded.encode("utf-8"))
        except (ValueError, TypeError, UnicodeError) as exc:
            raise StoreError("INVALID_READER_ANNOTATION", "Reader annotation must contain finite JSON values.") from exc
        if encoded_size > 300_000:
            raise StoreError("INVALID_READER_ANNOTATION", "Reader annotation exceeds the size limit.")
        attachment_id = value["attachment_id"]
        if attachment_id is None or value["page_idx"] is None:
            raise StoreError("ANNOTATION_ANCHOR_REQUIRED", "A Reader annotation requires its real original PDF and physical page.")
        attachment = self._row("attachments", attachment_id)
        self.attachment_path(attachment_id)  # Verify immutable bytes still match the anchored source.
        expected = {"id": identity, "itemId": item_id, "attachmentId": attachment_id, "documentId": attachment["sha256"]}
        if any(annotation.get(key) != expected_value for key, expected_value in expected.items()):
            raise StoreError("ANNOTATION_SCOPE_MISMATCH", "Reader annotation identity must match its paper, attachment and original PDF hash.", 409)
        if annotation.get("pane") != "source":
            raise StoreError("UNVERIFIED_TRANSLATION_ANCHOR", "A translated PDF page cannot be asserted as an original PDF page.")
        if type(annotation.get("page")) is not int or annotation["page"] != value["page_idx"] + 1:
            raise StoreError("ANNOTATION_PAGE_MISMATCH", "Reader annotation page must match the physical original PDF page.")
        if annotation.get("quote") != value["quote"] or annotation.get("note") != value["body"]:
            raise StoreError("ANNOTATION_TEXT_MISMATCH", "Reader annotation text must match the stored quotation and note.")
        timestamp = text(annotation.get("createdAt"), "reader_annotation.createdAt", 100, required=True)
        try:
            if datetime.fromisoformat(timestamp.replace("Z", "+00:00")).tzinfo is None:
                raise ValueError
        except ValueError as exc:
            raise StoreError("INVALID_READER_ANNOTATION", "Reader annotation creation time must include a timezone.") from exc
        # Geometry/extensions remain data from the actual Reader selection; they are never citation proof.
        return encode({NATIVE_ANNOTATION_KEY: annotation})

    def create_note(self, item_id: str, data: dict) -> dict:
        with self.transaction():
            self._row("items", item_id)
            value = self._validated_note(item_id, data)
            annotation = data.get("reader_annotation")
            identity = text(annotation.get("id"), "reader_annotation.id", 100, required=True) if isinstance(annotation, dict) else new_id()
            raw_annotation = self._native_annotation_json(item_id, identity, value, data)
            existing = self.db.execute("SELECT * FROM notes WHERE id=?", (identity,)).fetchone()
            if existing is not None:
                if (existing["item_id"] == item_id and existing["raw_source_json"] == raw_annotation
                        and all(existing[key] == entry for key, entry in value.items())):
                    return self._note_dict(existing)
                raise StoreError("ANNOTATION_ID_CONFLICT", "This annotation ID already belongs to a different saved record.", 409)
            timestamp = now()
            self.db.execute(
                "INSERT INTO notes(id,item_id,attachment_id,page_idx,quote,translated_quote,body,created_at,updated_at,raw_source_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (identity, item_id, value["attachment_id"], value["page_idx"], value["quote"],
                 value["translated_quote"], value["body"], timestamp, timestamp, raw_annotation))
            self.db.execute("UPDATE items SET updated_at=? WHERE id=?", (timestamp, item_id))
            return self._note_dict(self._row("notes", identity))

    def update_note(self, identity: str, data: dict) -> dict:
        with self.transaction():
            row = self._row("notes", identity)
            value = self._validated_note(row["item_id"], data, previous=dict(row))
            raw_annotation = self._native_annotation_json(row["item_id"], identity, value, data, previous=dict(row))
            timestamp = now()
            self.db.execute(
                "UPDATE notes SET attachment_id=?,page_idx=?,quote=?,translated_quote=?,body=?,updated_at=?,raw_source_json=? WHERE id=?",
                (value["attachment_id"], value["page_idx"], value["quote"], value["translated_quote"], value["body"], timestamp, raw_annotation, identity))
            self.db.execute("UPDATE items SET updated_at=? WHERE id=?", (timestamp, row["item_id"]))
            return self._note_dict(self._row("notes", identity))

    def delete_note(self, identity: str) -> None:
        with self.transaction():
            row = self._row("notes", identity)
            self.db.execute("DELETE FROM notes WHERE id=?", (identity,))
            self.db.execute("UPDATE items SET updated_at=? WHERE id=?", (now(), row["item_id"]))

    def source_records(self, item_id: str) -> dict:
        with self.lock:
            self._row("items", item_id)
            records = {}
            for table, key in (("source_links", "items"), ("notes", "notes"), ("imported_attachments", "attachments")):
                if table == "source_links":
                    rows = self.db.execute("SELECT * FROM source_links WHERE entity_type='item' AND entity_id=?", (item_id,))
                else:
                    rows = self.db.execute(f"SELECT * FROM {table} WHERE item_id=? AND raw_source_json IS NOT NULL", (item_id,))
                records[key] = [{**dict(row), "raw_source": json.loads(row["raw_source_json"])} for row in rows]
                for entry in records[key]:
                    entry.pop("raw_source_json")
            return records

    def export_item(self, identity: str, format: str) -> tuple[str, str, str]:
        item = self.get_item(identity)
        stem = re.sub(r"[^A-Za-z0-9_-]", "-", item["title"])[:60].strip("-") or item["id"]
        csl_type = item["item_type"] if item["item_type"] in CSL_TYPES else ZOTERO_TO_CSL_TYPE.get(item["item_type"], "document")
        if format == "csljson":
            citation = {"id": item["id"], "type": csl_type, "title": item["title"],
                        "author": [{"literal": author} for author in item["authors"]]}
            for source, target in (("doi", "DOI"), ("url", "URL"), ("abstract", "abstract")):
                if item[source]:
                    citation[target] = item[source]
            if item["date"]:
                citation["issued"] = {"raw": item["date"]}
            return json.dumps([citation], ensure_ascii=False, indent=2), "application/json", stem + ".csl.json"
        if format == "bibtex":
            def bib(value: str) -> str:
                escaped = {"\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "%": "\\%", "&": "\\&",
                           "_": "\\_", "#": "\\#", "$": "\\$", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}"}
                return "".join(escaped.get(character, character) for character in value).replace("\n", " ")
            fields = {"title": item["title"], "author": " and ".join("{" + author + "}" for author in item["authors"]),
                      "doi": item["doi"], "url": item["url"], "note": item["date"]}
            year = re.search(r"\b(\d{4})\b", item["date"])
            if year:
                fields["year"] = year.group(1)
            entry_type = CSL_TO_BIBTEX_TYPE.get(csl_type, "misc")
            lines = [f"@{entry_type}{{retain_{identity.replace('-', '')[:12]},"]
            for key, value in fields.items():
                if value:
                    # Author names are literal organization/person names, not a reconstructed creator split.
                    encoded = " and ".join("{" + bib(author) + "}" for author in item["authors"]) if key == "author" else bib(value)
                    lines.append(f"  {key} = {{{encoded}}},")
            lines.append("}")
            return "\n".join(lines) + "\n", "application/x-bibtex", stem + ".bib"
        if format == "sourcejson":
            return json.dumps({"item": item, "source_records": self.source_records(identity)}, ensure_ascii=False, indent=2), "application/json", stem + ".source.json"
        if format != "markdown":
            raise StoreError("UNSUPPORTED_EXPORT", "Choose markdown, bibtex, csljson or sourcejson.")
        def md(value: str) -> str:
            return html.escape(value, quote=False).replace("\r", "")
        lines = [f"# {md(item['title'])}", "", f"Item ID: {identity}", f"Authors: {md('; '.join(item['authors']))}",
                 f"Date: {md(item['date'])}", f"DOI: {md(item['doi'])}", f"Tags: {md(', '.join(item['tags']))}", ""]
        for attachment in item["attachments"]:
            lines.extend([f"PDF: {md(attachment['filename'])}", f"SHA-256: {attachment['sha256']}", ""])
        for declaration in item["imported_attachment_declarations"]:
            lines.extend([f"Missing source attachment: {md(declaration['filename'])} ({declaration['source_key']})", ""])
        for note in item["notes"]:
            page = f"PDF page {note['page_idx'] + 1}" if note["page_idx"] is not None else "Unanchored note"
            if note.get("source_page_idx") is not None and note["page_idx"] is None:
                page += f" · source page index {note['source_page_idx']} (PDF not verified)"
            lines.extend([f"## {page}", ""])
            for label, value in (("Quote", note["quote"]), ("Translation", note["translated_quote"]), ("Note", note["body"])):
                if value:
                    lines.extend([f"{label}:", md(value), ""])
            if note["attachment_id"]:
                attachment = self.get_attachment(note["attachment_id"])
                lines.extend([f"Evidence PDF SHA-256: {attachment['sha256']}", ""])
        return "\n".join(lines) + "\n", "text/markdown; charset=utf-8", stem + ".md"

    def _snapshot(self, item_id: str) -> dict:
        result = dict(self._row("items", item_id))
        result["collection_ids"] = sorted(row[0] for row in self.db.execute("SELECT collection_id FROM item_collections WHERE item_id=?", (item_id,)))
        result["notes"] = [dict(row) for row in self.db.execute("SELECT * FROM notes WHERE item_id=? ORDER BY id", (item_id,))]
        result["declarations"] = [dict(row) for row in self.db.execute("SELECT * FROM imported_attachments WHERE item_id=? ORDER BY id", (item_id,))]
        result["attachments"] = [dict(row) for row in self.db.execute(
            "SELECT id,item_id,sha256,filename,mime,page_count,created_at FROM attachments WHERE item_id=? ORDER BY id", (item_id,))]
        return result

    def _target_fingerprint(self, kind: str, identity: str) -> str:
        return fingerprint(self._snapshot(identity) if kind == "item" else dict(self._row("collections", identity)))

    def _import_notes_and_declarations(self, item_id: str, source_id: str, item: dict) -> None:
        # Original source annotations are retained without pretending their coordinates target an unverified local PDF.
        notes = item.get("notes", [])
        declarations = item.get("attachments", [])
        note_keys = [entry["source_key"] for entry in notes]
        declaration_keys = [entry["source_key"] for entry in declarations]
        for row in list(self.db.execute("SELECT * FROM notes WHERE item_id=? AND source_id=?", (item_id, source_id))):
            if row["source_key"] not in note_keys:
                self.db.execute("DELETE FROM notes WHERE id=?", (row["id"],))
        for row in list(self.db.execute("SELECT * FROM imported_attachments WHERE item_id=? AND source_id=?", (item_id, source_id))):
            if row["source_key"] not in declaration_keys:
                self.db.execute("DELETE FROM imported_attachments WHERE id=?", (row["id"],))
        for note in notes:
            key = text(note["source_key"], "source_key", 500, required=True)
            existing = self.db.execute("SELECT * FROM notes WHERE item_id=? AND source_id=? AND source_key=?", (item_id, source_id, key)).fetchone()
            identity, timestamp = (existing["id"] if existing else new_id()), now()
            self.db.execute(
                """INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(item_id,source_id,source_key) DO UPDATE SET
                attachment_id=NULL,page_idx=NULL,quote=excluded.quote,translated_quote=excluded.translated_quote,
                body=excluded.body,updated_at=excluded.updated_at,source_attachment_key=excluded.source_attachment_key,
                source_page_idx=excluded.source_page_idx,source_page_label=excluded.source_page_label,raw_source_json=excluded.raw_source_json""",
                (identity, item_id, None, None, text(note.get("quote", ""), "quote", 100_000),
                 text(note.get("translated_quote", ""), "translated_quote", 100_000), text(note.get("body", ""), "body", 100_000),
                 existing["created_at"] if existing else timestamp, timestamp, source_id, key,
                 note.get("attachment_source_key"), note.get("source_page_idx"), note.get("source_page_label"), encode(note.get("raw_source", {}))))
        for declaration in declarations:
            key = text(declaration["source_key"], "source_key", 500, required=True)
            existing = self.db.execute("SELECT * FROM imported_attachments WHERE item_id=? AND source_id=? AND source_key=?", (item_id, source_id, key)).fetchone()
            self.db.execute(
                """INSERT INTO imported_attachments VALUES(?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(item_id,source_id,source_key) DO UPDATE SET
                parent_key=excluded.parent_key,filename=excluded.filename,mime=excluded.mime,
                link_mode=excluded.link_mode,missing_reason=excluded.missing_reason,raw_source_json=excluded.raw_source_json""",
                (existing["id"] if existing else new_id(), item_id, source_id, key, declaration.get("parent_key"),
                 text(declaration.get("filename", ""), "filename", 1000), text(declaration.get("mime", ""), "mime", 500),
                 str(declaration.get("link_mode", "")), str(declaration.get("missing_reason", "file_not_imported")),
                 encode(declaration.get("raw_source", {}))))

    def commit_import(self, plan: dict) -> dict:
        source_id = text(plan.get("source_id", ""), "source_id", 1000, required=True)
        report = {"batch_id": new_id(), "created_items": 0, "updated_items": 0, "unchanged_items": 0,
                  "conflicts": [], "warnings": list(plan.get("warnings", []))}
        with self.transaction():
            batch_id = report["batch_id"]
            self.db.execute("INSERT INTO import_batches VALUES(?,?,?,?,?,?)",
                            (batch_id, source_id, plan["plan_hash"], now(), "committed", "{}"))
            collection_map = {row["source_key"]: row["entity_id"] for row in self.db.execute(
                "SELECT * FROM source_links WHERE source_id=? AND entity_type='collection'", (source_id,))}
            pending = list(plan.get("collections", []))
            while pending:
                progress = False
                for collection in pending[:]:
                    key, parent_key = collection["source_key"], collection.get("parent_source_key")
                    if parent_key and parent_key not in collection_map:
                        continue
                    source_fp = fingerprint(collection)
                    link = self.db.execute("SELECT * FROM source_links WHERE source_id=? AND entity_type='collection' AND source_key=?", (source_id, key)).fetchone()
                    before = None
                    if link:
                        identity = link["entity_id"]
                        collection_map[key] = identity
                        if link["source_fingerprint"] == source_fp:
                            pending.remove(collection)
                            progress = True
                            continue
                        if self._target_fingerprint("collection", identity) != link["target_fingerprint"]:
                            report["conflicts"].append({"source_key": key, "entity_type": "collection", "code": "LOCAL_EDITS_PROTECTED"})
                            pending.remove(collection)
                            progress = True
                            continue
                        before = {"record": dict(self._row("collections", identity)), "link": dict(link)}
                        requested_parent = collection_map.get(parent_key)
                        ancestors, cursor = {identity}, requested_parent
                        while cursor is not None:
                            if cursor in ancestors:
                                raise StoreError("COLLECTION_CYCLE", "Imported collections would create an ancestor cycle.")
                            ancestors.add(cursor)
                            cursor = self._row("collections", cursor)["parent_id"]
                        self.db.execute("UPDATE collections SET name=?,parent_id=?,updated_at=? WHERE id=?",
                                            (text(collection["name"], "name", 500, required=True), requested_parent, now(), identity))
                    else:
                        identity, timestamp = new_id(), now()
                        self.db.execute("INSERT INTO collections VALUES(?,?,?,?,?)",
                                        (identity, text(collection["name"], "name", 500, required=True), collection_map.get(parent_key), timestamp, timestamp))
                    collection_map[key] = identity
                    target_fp = self._target_fingerprint("collection", identity)
                    self.db.execute("INSERT OR REPLACE INTO source_links VALUES(?,?,?,?,?,?,?,?)",
                                    (source_id, "collection", key, identity, None, source_fp, target_fp, encode(collection.get("raw_source", {}))))
                    self.db.execute("INSERT INTO import_changes(batch_id,entity_type,entity_id,source_key,operation,before_json,after_fingerprint) VALUES(?,?,?,?,?,?,?)",
                                    (batch_id, "collection", identity, key, "updated" if before else "created", encode(before) if before else None, target_fp))
                    pending.remove(collection)
                    progress = True
                if not progress:
                    report["warnings"].append({"code": "COLLECTION_PARENT_UNRESOLVED", "message": "Some collection parents are missing or cyclic; no invented relationships were created.",
                                               "source_keys": [entry["source_key"] for entry in pending]})
                    break
            for item in plan.get("items", []):
                key = text(item["source_key"], "source_key", 500, required=True)
                source_fp = fingerprint(item)
                link = self.db.execute("SELECT * FROM source_links WHERE source_id=? AND entity_type='item' AND source_key=?", (source_id, key)).fetchone()
                before = None
                if link:
                    identity = link["entity_id"]
                    if link["source_fingerprint"] == source_fp:
                        report["unchanged_items"] += 1
                        continue
                    if self._target_fingerprint("item", identity) != link["target_fingerprint"]:
                        report["conflicts"].append({"source_key": key, "entity_type": "item", "item_id": identity, "code": "LOCAL_EDITS_PROTECTED"})
                        continue
                    before = {"record": self._snapshot(identity), "link": dict(link)}
                else:
                    identity = new_id()
                metadata = {field: item.get(field, [] if field in ("authors", "tags") else "") for field in METADATA_FIELDS if field != "collection_ids"}
                metadata["title"] = metadata["title"] or "Untitled"
                metadata["item_type"] = metadata["item_type"] or "document"
                requested_collections = item.get("collection_source_keys", [])
                metadata["collection_ids"] = [collection_map[entry] for entry in requested_collections if entry in collection_map]
                for missing in set(requested_collections) - set(collection_map):
                    report["warnings"].append({"code": "COLLECTION_NOT_IMPORTED", "message": "A referenced collection was unavailable.", "source_key": key, "collection_source_key": missing})
                self._write_item(identity, self._metadata(metadata), created_at=now() if link is None else None)
                self._import_notes_and_declarations(identity, source_id, item)
                target_fp = self._target_fingerprint("item", identity)
                self.db.execute("INSERT OR REPLACE INTO source_links VALUES(?,?,?,?,?,?,?,?)",
                                (source_id, "item", key, identity, str(item.get("source_version", "")), source_fp, target_fp, encode(item.get("raw_source", {}))))
                self.db.execute("INSERT INTO import_changes(batch_id,entity_type,entity_id,source_key,operation,before_json,after_fingerprint) VALUES(?,?,?,?,?,?,?)",
                                (batch_id, "item", identity, key, "updated" if before else "created", encode(before) if before else None, target_fp))
                report["updated_items" if before else "created_items"] += 1
            self.db.execute("UPDATE import_batches SET report_json=? WHERE id=?", (encode(report), batch_id))
        return report

    def _restore_item(self, snapshot: dict) -> None:
        identity = snapshot["id"]
        columns = ("title", "item_type", "authors_json", "date", "doi", "url", "abstract", "tags_json", "created_at", "updated_at")
        self.db.execute("UPDATE items SET " + ",".join(column + "=?" for column in columns) + " WHERE id=?",
                        [snapshot[column] for column in columns] + [identity])
        self.db.execute("DELETE FROM item_collections WHERE item_id=?", (identity,))
        self.db.executemany("INSERT INTO item_collections VALUES(?,?)", [(identity, collection) for collection in snapshot["collection_ids"]])
        for table, key in (("notes", "notes"), ("imported_attachments", "declarations")):
            self.db.execute(f"DELETE FROM {table} WHERE item_id=?", (identity,))
            for row in snapshot[key]:
                columns = list(row)
                self.db.execute(f"INSERT INTO {table}(" + ",".join(columns) + ") VALUES(" + ",".join("?" for _ in columns) + ")", [row[column] for column in columns])

    def rollback_import(self, batch_id: str) -> dict:
        with self.transaction():
            batch = self._row("import_batches", batch_id)
            if batch["status"] == "rolled_back":
                return {"batch_id": batch_id, "rolled_back": True, "already_rolled_back": True, "conflicts": []}
            changes = list(self.db.execute("SELECT * FROM import_changes WHERE batch_id=? ORDER BY id DESC", (batch_id,)))
            conflicts = []
            reverted_items = {row["entity_id"] for row in changes if row["entity_type"] == "item"}
            changed_collections = {row["entity_id"] for row in changes if row["entity_type"] == "collection"}
            for change in changes:
                kind, identity = change["entity_type"], change["entity_id"]
                try:
                    matching = self._target_fingerprint(kind, identity) == change["after_fingerprint"]
                except StoreError:
                    matching = False
                if not matching:
                    conflicts.append({"entity_type": kind, "entity_id": identity, "code": "CHANGED_AFTER_IMPORT"})
                if kind == "collection" and change["operation"] == "created":
                    references = self.db.execute("SELECT item_id FROM item_collections WHERE collection_id=?", (identity,))
                    if any(row[0] not in reverted_items for row in references):
                        conflicts.append({"entity_type": kind, "entity_id": identity, "code": "COLLECTION_IN_USE"})
                    children = self.db.execute("SELECT id FROM collections WHERE parent_id=?", (identity,))
                    if any(row[0] not in changed_collections for row in children):
                        conflicts.append({"entity_type": kind, "entity_id": identity, "code": "COLLECTION_IN_USE"})
            if conflicts:
                return {"batch_id": batch_id, "rolled_back": False, "conflicts": conflicts,
                        "message": "Rollback refused because later changes must be protected."}
            for change in changes:
                kind, identity = change["entity_type"], change["entity_id"]
                if change["operation"] == "created":
                    table = "items" if kind == "item" else "collections"
                    self.db.execute("DELETE FROM source_links WHERE entity_type=? AND entity_id=?", (kind, identity))
                    self.db.execute(f"DELETE FROM {table} WHERE id=?", (identity,))
                else:
                    before = json.loads(change["before_json"])
                    if kind == "item":
                        self._restore_item(before["record"])
                    else:
                        record = before["record"]
                        self.db.execute("UPDATE collections SET name=?,parent_id=?,created_at=?,updated_at=? WHERE id=?",
                                        (record["name"], record["parent_id"], record["created_at"], record["updated_at"], identity))
                    link = before["link"]
                    self.db.execute("INSERT OR REPLACE INTO source_links VALUES(?,?,?,?,?,?,?,?)",
                                    [link[key] for key in ("source_id", "entity_type", "source_key", "entity_id", "source_version",
                                                         "source_fingerprint", "target_fingerprint", "raw_source_json")])
            self.db.execute("UPDATE import_batches SET status='rolled_back' WHERE id=?", (batch_id,))
            # Immutable blobs are intentionally never removed by import rollback.
            return {"batch_id": batch_id, "rolled_back": True, "conflicts": []}
