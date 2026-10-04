"""Atomic, application-owned per-document files; rejects symlink traversal."""
import json
import os
import re
import tempfile
from pathlib import Path
from .data_layout import PAPER_BLOCKS
from .store import StoreError
from .paper_blocks_extract import extract
from .paper_blocks_model import SCHEMA_VERSION, EXTRACTOR_VERSION


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
                accept_stale or value["extractor_version"] == EXTRACTOR_VERSION
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

    def cache(self, entry):
        path = self.directory(entry) / "translations.json"
        return json.loads(path.read_text()) if path.exists() else {}

    def result(self, entry):
        path = self.directory(entry) / "result.json"
        return json.loads(path.read_text()) if path.exists() else None
