"""Atomic, application-owned per-document files; rejects symlink traversal."""
import json
import os
import re
import tempfile
import threading
from pathlib import Path
from .data_layout import PAPER_BLOCKS
from .store import StoreError
from .paper_blocks_extract import extract
from .paper_blocks_model import SCHEMA_VERSION, EXTRACTOR_VERSION
from .document_models import revision


def write_json(path, value):
    if path.is_symlink():
        raise StoreError("UNSAFE_DATA_ROOT", "块文件不能是符号链接。")
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, ensure_ascii=False)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


class BlockStorage:
    def __init__(self, store):
        self.store = store
        self.cache_lock = threading.RLock()
        self.validated_caches = {}
        self.root = store.data_root / PAPER_BLOCKS
        if self.root.is_symlink():
            raise StoreError("UNSAFE_DATA_ROOT", "块目录不能是符号链接。")
        self.root.mkdir(mode=0o700, exist_ok=True)

    def attachment(self, item, identity=None):
        row = self.store.get_item(item)
        entries = row["attachments"]
        entry = next((a for a in entries if a["id"] == identity), None) if identity else next(iter(entries), None)
        if entry is None:
            raise StoreError("NO_ATTACHMENT", "此文献没有可用 PDF。", 409)
        return entry

    def directory(self, entry):
        sha = entry["sha256"]
        if not re.fullmatch("[a-f0-9]{64}", sha):
            raise StoreError("INVALID_DOCUMENT", "文档指纹无效。")
        root = self.root / sha
        if root.is_symlink():
            raise StoreError("UNSAFE_DATA_ROOT", "块目录不能是符号链接。")
        root.mkdir(mode=0o700, exist_ok=True)
        if any(path.is_symlink() for path in root.rglob("*")):
            raise StoreError("UNSAFE_DATA_ROOT", "块缓存中不能有符号链接。")
        return root

    def load(self, entry, accept_stale=False):
        path = self.directory(entry) / "blocks.json"
        if not path.exists():
            return None
        try:
            value = json.loads(path.read_text())
            if value["schema_version"] == SCHEMA_VERSION and (
                accept_stale
                or value["extractor_version"] == EXTRACTOR_VERSION
                and (not revision() or value.get("model_revision") == revision())
            ):
                return value
        except (ValueError, KeyError):
            pass
        return None

    def extract(self, entry, check=lambda: None):
        check()
        value = self.load(entry)
        if value is None:
            root = self.directory(entry)
            value = extract(self.store.attachment_path(entry["id"]), root, entry["sha256"], check)
            check()
            write_json(root / "blocks.json", value)
        return value

    @staticmethod
    def cache_signature(path):
        if not path.exists():
            return None
        stat = path.stat()
        return stat.st_ino, stat.st_mtime_ns, stat.st_size

    def cache(self, entry):
        from .paper_cache_repair import normalize_cache
        from .paper_markers import has_markers
        with self.cache_lock:
            path = self.directory(entry) / "translations.json"
            stamp = self.cache_signature(path)
            cache = json.loads(path.read_text()) if stamp else {}
            if stamp is None or self.validated_caches.get(entry["sha256"]) == stamp:
                return cache
            if not any(has_markers(value) for value in cache.values()):
                self.validated_caches[entry["sha256"]] = stamp
                return cache
            patch, counts = normalize_cache(self.load(entry, accept_stale=True) or {}, cache)
            if patch:
                previous = self.repair_state(entry)
                # Pending marker is published first, so a crash can never skip PDF repair.
                write_json(path.parent / "marker-repair.json", {
                    "pending": True, "revision": previous.get("revision", 0) + 1,
                    "entries": sorted(set(previous.get("entries", [])) | set(patch)),
                    "tokens": previous.get("tokens", 0) + counts["tokens"],
                    "unresolved": previous.get("unresolved", 0) + counts["unresolved"],
                })
                cache.update(patch)
                write_json(path, cache)
            self.validated_caches[entry["sha256"]] = self.cache_signature(path)
            return cache

    def merge_cache(self, entry, patch):
        from .paper_markers import has_markers
        with self.cache_lock:
            latest = self.cache(entry)
            latest.update(patch)
            path = self.directory(entry) / "translations.json"
            write_json(path, latest)
            if not any(has_markers(value) for value in patch.values()):
                self.validated_caches[entry["sha256"]] = self.cache_signature(path)

    def repair_state(self, entry):
        path = self.directory(entry) / "marker-repair.json"
        return json.loads(path.read_text()) if path.exists() else {}

    def finish_repair(self, entry, revision):
        with self.cache_lock:
            value = self.repair_state(entry)
            if value.get("pending") and value.get("revision") == revision:
                write_json(self.directory(entry) / "marker-repair.json", {**value, "pending": False})

    def result(self, entry):
        path = self.directory(entry) / "result.json"
        return json.loads(path.read_text()) if path.exists() else None
