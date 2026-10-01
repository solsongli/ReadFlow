"""Independent, read-only Zotero compatibility for the local research MVP.

Protocol references (checked 2026-09-30, no Zotero implementation code copied):
https://www.zotero.org/support/dev/web_api/v3/local_api
https://www.zotero.org/support/dev/web_api/v3/basics
https://www.zotero.org/support/dev/web_api/v3/write_requests
https://www.zotero.org/support/kb/exporting
https://www.zotero.org/support/kb/annotations_in_database

Parsing is a pure operation. The only network operation is an explicit call to
fetch_local_snapshot(), which sends bounded GETs to loopback port 23119. It does
not authenticate, follow redirects, read attachment paths, or write to Zotero.
"""
from __future__ import annotations

from contextlib import closing
import hashlib
import json
import math
import re
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlsplit

MAX_PAYLOAD_BYTES = 16 * 1024 * 1024
MAX_ITEMS = 5000
MAX_COLLECTIONS = 2000
MAX_STRING_LENGTH = 200_000
MAX_JSON_NODES = 200_000
MAX_WARNINGS = 10_000
PAGE_SIZE = 100


class ImportPlanError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


class LocalSnapshotError(ImportPlanError):
    pass


def _encoded(value: Any) -> bytes:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True,
                          separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError, UnicodeError) as exc:
        raise ImportPlanError("invalid_json", "导入内容必须是有效的有限 JSON 数据。") from exc


def _bounded_copy(payload: Any) -> dict:
    if not isinstance(payload, dict):
        raise ImportPlanError("invalid_payload", "导入请求必须是 JSON 对象。")
    stack = [(payload, 0)]
    seen_nodes = 0
    while stack:
        value, depth = stack.pop()
        seen_nodes += 1
        if depth > 32 or seen_nodes > MAX_JSON_NODES:
            raise ImportPlanError("json_limit", "导入数据的嵌套层数或字段数量超出首版限制。")
        if isinstance(value, dict):
            if len(value) > 1024 or not all(isinstance(k, str) and len(k) <= 512 for k in value):
                raise ImportPlanError("field_limit", "JSON 对象字段过多或字段名无效。")
            stack.extend((k, depth + 1) for k in value)
            stack.extend((v, depth + 1) for v in value.values())
        elif isinstance(value, list):
            if len(value) > MAX_ITEMS + MAX_COLLECTIONS:
                raise ImportPlanError("array_limit", "导入数组超出首版数量限制。")
            stack.extend((v, depth + 1) for v in value)
        elif isinstance(value, str):
            if len(value) > MAX_STRING_LENGTH or "\x00" in value:
                raise ImportPlanError("string_limit", "导入字段过长或包含无效字符。")
        elif isinstance(value, float):
            if not math.isfinite(value):
                raise ImportPlanError("invalid_number", "导入字段不能包含非有限数值。")
        elif value is not None and not isinstance(value, (int, bool)):
            raise ImportPlanError("invalid_json", "导入内容包含非 JSON 类型。")
    encoded = _encoded(payload)
    if len(encoded) > MAX_PAYLOAD_BYTES:
        raise ImportPlanError("payload_limit", "导入内容超过首版 16 MiB 限制，请分批导出。")
    return json.loads(encoded)


def _text(value: Any, field: str, *, limit: int = MAX_STRING_LENGTH) -> str:
    if value is None or value is False:
        return ""
    if not isinstance(value, str) or len(value) > limit:
        raise ImportPlanError("invalid_field", f"字段 {field} 必须是长度受限的文本。")
    return value.strip()


def _identifier(value: Any, field: str) -> str:
    if isinstance(value, int) and not isinstance(value, bool):
        value = str(value)
    result = _text(value, field, limit=500)
    if not result or any(ord(c) < 32 or ord(c) == 127 for c in result):
        raise ImportPlanError("invalid_source_key", f"字段 {field} 缺少有效的稳定来源标识。")
    return result


class _Warnings:
    def __init__(self):
        self.entries: list[dict] = []
        self.omitted = 0

    def add(self, code: str, message: str, key: str | None = None, field: str | None = None):
        if len(self.entries) >= MAX_WARNINGS:
            self.omitted += 1
            return
        entry = {"code": code, "message": message}
        if key is not None:
            entry["source_key"] = key
        if field is not None:
            entry["field"] = field
        self.entries.append(entry)

    def result(self) -> list[dict]:
        if self.omitted:
            self.entries.append({"code": "warnings_truncated", "message": f"另有 {self.omitted} 条警告；所有原始字段仍保留在来源数据中。"})
        unique = {_encoded(entry): entry for entry in self.entries}
        return [unique[key] for key in sorted(unique)]


class _PlainText(HTMLParser):
    BLOCKS = {"p", "div", "li", "br", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "blockquote", "pre"}
    BLOCKED = {"script", "style", "iframe", "object", "svg", "math", "template"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.blocked: list[str] = []

    def handle_starttag(self, tag: str, attrs):
        if tag in self.BLOCKED:
            self.blocked.append(tag)
        elif not self.blocked and tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_startendtag(self, tag: str, attrs):
        if not self.blocked and tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str):
        if self.blocked:
            if tag in self.blocked:
                index = len(self.blocked) - 1 - self.blocked[::-1].index(tag)
                del self.blocked[index:]
        elif tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data: str):
        if not self.blocked:
            self.parts.append(data)


def _plain_text(value: str) -> str:
    parser = _PlainText()
    parser.feed(value)
    parser.close()
    text = "".join(parser.parts).replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\n[ \t]*\n(?:[ \t]*\n)*", "\n\n", text).strip()


def _list(value: Any, field: str, *, limit: int = 1024) -> list:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > limit:
        raise ImportPlanError("invalid_field", f"字段 {field} 必须是数量受限的数组。")
    return value


def _unwrap(raw: Any) -> tuple[str, int, dict]:
    if not isinstance(raw, dict):
        raise ImportPlanError("invalid_record", "Zotero 条目或合集必须是 JSON 对象。")
    data = raw.get("data", raw)
    if not isinstance(data, dict):
        raise ImportPlanError("invalid_record", "Zotero 条目的 data 字段必须是对象。")
    key = _identifier(data.get("key", raw.get("key")), "key")
    if "key" in raw and _identifier(raw["key"], "key") != key:
        raise ImportPlanError("source_key_mismatch", "Zotero 包装对象与数据中的来源键不一致。")
    version = data.get("version", raw.get("version", 0))
    if not isinstance(version, int) or isinstance(version, bool) or not 0 <= version < 2**63:
        raise ImportPlanError("invalid_version", "Zotero 来源版本必须是非负整数。")
    if "version" in raw and "version" in data and raw["version"] != version:
        raise ImportPlanError("source_version_mismatch", "Zotero 包装对象与数据中的版本不一致。")
    return key, version, data


def _unique_records(records: list, warning: _Warnings) -> dict[str, tuple[int, dict, dict]]:
    result = {}
    for raw in records:
        key, version, data = _unwrap(raw)
        if key in result:
            if _encoded(result[key][2]) != _encoded(raw):
                raise ImportPlanError("duplicate_key_conflict", "同一来源键出现不同内容，请重新获取一致的导出快照。")
            warning.add("duplicate_source_record", "完全相同的重复来源条目只导入一次。", key)
        else:
            result[key] = (version, data, raw)
    return result


def _tags(data: dict, warning: _Warnings, key: str) -> list[str]:
    result = set()
    for tag in _list(data.get("tags"), "tags"):
        if isinstance(tag, dict):
            value = _text(tag.get("tag"), "tags.tag")
            if any(k != "tag" for k in tag):
                warning.add("tag_metadata_not_mapped", "保留标签名称；自动标签类型、颜色等信息仅保存在来源数据中。", key, "tags")
        else:
            value = _text(tag, "tags")
        if value:
            result.add(value)
    return sorted(result)


def _authors(data: dict, warning: _Warnings, key: str, *, csl: bool = False) -> list[str]:
    creators = _list(data.get("author" if csl else "creators"), "author" if csl else "creators")
    result = []
    for creator in creators:
        if not isinstance(creator, dict):
            raise ImportPlanError("invalid_creator", "作者信息必须是对象。")
        if not csl and creator.get("creatorType", "author") != "author":
            warning.add("creator_roles_not_mapped", "非作者角色保留在来源数据中，未误标为作者。", key, "creators")
            continue
        name = _text(creator.get("literal" if csl else "name"), "creator.name")
        if not name:
            first = _text(creator.get("given" if csl else "firstName"), "creator.given")
            last = _text(creator.get("family" if csl else "lastName"), "creator.family")
            name = " ".join(part for part in (first, last) if part)
        if name:
            result.append(name)
    return result


def _safe_url(value: Any, warning: _Warnings, key: str) -> str:
    url = _text(value, "url")
    if not url:
        return ""
    try:
        parsed = urlsplit(url)
        safe = (parsed.scheme in {"http", "https"} and bool(parsed.hostname)
                and parsed.username is None and parsed.password is None
                and not any(ord(c) < 32 or ord(c) == 127 for c in url))
    except ValueError:
        safe = False
    if not safe:
        warning.add("unsafe_url_not_mapped", "非 HTTP(S) 或含认证信息的网址仅保留在来源数据中，不创建可点击链接。", key, "url")
        return ""
    return url


def _doi(value: Any) -> str:
    doi = _text(value, "DOI")
    return re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", doi, flags=re.I)


def _unmapped(data: dict, mapped: set[str], warning: _Warnings, key: str):
    fields = sorted(k for k, value in data.items() if k not in mapped and value not in (None, "", [], {}))
    if fields:
        warning.add("fields_preserved_in_source", "部分字段尚未映射到首版编辑界面，完整原值保留在来源数据中。", key, ", ".join(fields)[:8192])


_BASIC_FIELDS = {"key", "version", "itemType", "title", "creators", "date", "DOI", "url", "abstractNote", "tags", "collections"}
_ITEM_TYPES = {"artwork", "audioRecording", "bill", "blogPost", "book", "bookSection", "case", "computerProgram", "conferencePaper", "dataset", "dictionaryEntry", "document", "email", "encyclopediaArticle", "film", "forumPost", "hearing", "instantMessage", "interview", "journalArticle", "letter", "magazineArticle", "manuscript", "map", "newspaperArticle", "patent", "podcast", "preprint", "presentation", "radioBroadcast", "report", "standard", "statute", "thesis", "tvBroadcast", "videoRecording", "webpage"}


def _paper(key: str, version: int, data: dict, raw: dict, warning: _Warnings) -> dict:
    item_type = _text(data.get("itemType"), "itemType") or "document"
    if item_type not in _ITEM_TYPES:
        warning.add("item_type_not_mapped", "此来源条目类型暂以通用文献管理，原始类型保留。", key, "itemType")
    title = _text(data.get("title"), "title")
    if not title:
        title = "未命名 Zotero 条目"
        warning.add("title_missing", "来源缺少标题，使用临时标题。", key, "title")
    references = sorted({_identifier(v, "collections") for v in _list(data.get("collections"), "collections")})
    _unmapped(data, _BASIC_FIELDS, warning, key)
    return {"source_key": key, "source_version": version, "title": title, "item_type": item_type,
            "authors": _authors(data, warning, key), "date": _text(data.get("date"), "date"),
            "doi": _doi(data.get("DOI")), "url": _safe_url(data.get("url"), warning, key),
            "abstract": _text(data.get("abstractNote"), "abstractNote"),
            "tags": _tags(data, warning, key), "collection_source_keys": references,
            "attachments": [], "notes": [], "raw_source": raw}


def _optional_key(value: Any, field: str) -> str | None:
    return None if value in (None, False, "") else _identifier(value, field)


def _attachment(key: str, data: dict, raw: dict, warning: _Warnings) -> dict:
    mode = _text(data.get("linkMode"), "linkMode", limit=128) or "unknown"
    filename = _text(data.get("filename", data.get("title")), "filename")
    filename = re.split(r"[/\\]", filename)[-1] or "未命名附件"
    if mode == "linked_url":
        reason = "linked_url_only"
    elif mode in {"imported_file", "imported_url", "linked_file"}:
        reason = "file_not_imported"
    else:
        reason = "unsupported_link_mode"
    warning.add("attachment_file_not_imported", "仅导入附件声明；请手动选择并关联对应 PDF，未读取或复制来源文件。", key, "attachment")
    if mode not in {"imported_file", "imported_url", "linked_file", "linked_url"}:
        warning.add("attachment_mode_not_mapped", "此附件链接模式尚未支持，完整原值保留。", key, "linkMode")
    _unmapped(data, {"key", "version", "itemType", "parentItem", "filename", "title", "contentType", "linkMode", "url", "note"}, warning, key)
    return {"source_key": key, "parent_key": _optional_key(data.get("parentItem"), "parentItem"), "filename": filename,
            "mime": _text(data.get("contentType"), "contentType"), "link_mode": mode,
            "url": _safe_url(data.get("url"), warning, key), "missing_reason": reason, "raw_source": raw}


def _note(key: str, data: dict, raw: dict, warning: _Warnings) -> dict:
    original = _text(data.get("note"), "note")
    warning.add("note_rich_text_not_mapped", "笔记转为安全纯文本；富文本、图片与引用链接仅保存在原始来源数据中。", key, "note")
    _unmapped(data, {"key", "version", "itemType", "parentItem", "note"}, warning, key)
    return {"source_key": key, "parent_key": _optional_key(data.get("parentItem"), "parentItem"),
            "body": _plain_text(original), "quote": "", "translated_quote": "", "page_idx": None,
            "source_page_idx": None, "source_page_label": None,
            "attachment_source_key": None, "raw_source": raw}


def _annotation(key: str, data: dict, raw: dict, warning: _Warnings) -> dict:
    quote = _text(data.get("annotationText"), "annotationText")
    comment = _text(data.get("annotationComment"), "annotationComment")
    label = _text(data.get("annotationPageLabel"), "annotationPageLabel", limit=1024)
    source_page = None
    position = data.get("annotationPosition")
    try:
        if isinstance(position, str) and position:
            position = json.loads(position)
        if isinstance(position, dict):
            page_index = position.get("pageIndex")
            if isinstance(page_index, int) and not isinstance(page_index, bool) and 0 <= page_index <= 1_000_000:
                source_page = page_index
            elif page_index is not None:
                raise ValueError
        elif position not in (None, ""):
            raise ValueError
    except (ValueError, TypeError, RecursionError):
        warning.add("annotation_position_invalid", "批注位置无法解读，保留原始数据，不创建页码锚点。", key, "annotationPosition")
    warning.add("annotation_geometry_not_mapped", "批注原文、评论与来源页码保留；PDF 尚未核验，几何位置及本地页码锚点尚未迁移。", key, "annotationPosition")
    _unmapped(data, {"key", "version", "itemType", "parentItem", "annotationText", "annotationComment", "annotationPageLabel", "annotationPosition"}, warning, key)
    body = _plain_text(comment) or quote or "[Zotero 批注，无文本内容]"
    return {"source_key": key, "parent_key": _optional_key(data.get("parentItem"), "parentItem"), "body": body,
            "quote": quote, "translated_quote": "", "page_idx": None, "source_page_idx": source_page,
            "source_page_label": label or None, "attachment_source_key": _optional_key(data.get("parentItem"), "parentItem"),
            "raw_source": raw}


def _collections(records: list, warning: _Warnings) -> list[dict]:
    unique = _unique_records(records, warning)
    result = {}
    for key, (_, data, raw) in sorted(unique.items()):
        name = _text(data.get("name"), "collection.name") or "未命名合集"
        parent = data.get("parentCollection")
        parent = _identifier(parent, "parentCollection") if parent not in (None, False, "") else None
        if parent and parent not in unique:
            warning.add("collection_parent_missing", "合集父节点未出现在快照中，先作为顶级合集保留。", key, "parentCollection")
            parent = None
        result[key] = {"source_key": key, "name": name, "parent_source_key": parent, "raw_source": raw}
    visited = set()
    for key in sorted(result):
        chain, positions = [], {}
        current = key
        while current is not None and current not in visited:
            if current in positions:
                cycle = chain[positions[current]:]
                break_key = min(cycle)
                result[break_key]["parent_source_key"] = None
                warning.add("collection_cycle", "合集父子关系包含循环，已断开一个父链接；原始关系保留。", break_key, "parentCollection")
                break
            positions[current] = len(chain)
            chain.append(current)
            current = result[current]["parent_source_key"]
        visited.update(chain)
    return [result[key] for key in sorted(result)]


def _zotero_plan(items: list, collections: list, warning: _Warnings) -> tuple[list, list, int]:
    unique = _unique_records(items, warning)
    papers = {}
    children = {}
    for key, (version, data, raw) in sorted(unique.items()):
        if data.get("itemType") in {"attachment", "note", "annotation"}:
            children[key] = (version, data, raw)
        else:
            if data.get("parentItem"):
                warning.add("unexpected_item_parent", "此文献类型有未支持的父链接，先作为独立条目保留。", key, "parentItem")
            papers[key] = _paper(key, version, data, raw, warning)
    owner_cache = {}
    def owner(key: str) -> str:
        if key in owner_cache:
            return owner_cache[key]
        path, current, seen = [], key, set()
        while current in children and current not in seen:
            seen.add(current)
            path.append(current)
            _, data, _ = children[current]
            parent = data.get("parentItem")
            if parent is not None and parent is not False and parent != "":
                parent = _identifier(parent, "parentItem")
            else:
                parent = None
            if parent in papers:
                owner_key = parent
                break
            if parent in children:
                current = parent
                continue
            owner_key = current
            break
        else:
            owner_key = min(path) if path else key
        if owner_key not in papers:
            version, data, raw = children[owner_key]
            stub = dict(data)
            stub["itemType"] = "document"
            stub["title"] = data.get("title") or data.get("filename") or "独立 Zotero 笔记/批注"
            papers[owner_key] = _paper(owner_key, version, stub, raw, warning)
            warning.add("standalone_item", "无可用父文献的附件、笔记或批注作为独立条目保留。", owner_key)
            if data.get("parentItem"):
                warning.add("orphan_parent", "来源父节点未出现在快照中或存在循环；来源父键仍保留。", owner_key, "parentItem")
        for part in path:
            owner_cache[part] = owner_key
        return owner_key
    annotation_count = 0
    for key, (_, data, raw) in sorted(children.items()):
        target = papers[owner(key)]
        kind = data.get("itemType")
        if kind == "attachment":
            target["attachments"].append(_attachment(key, data, raw, warning))
            if _text(data.get("note"), "attachment.note"):
                embedded_note = _note(key, data, raw, warning)
                embedded_note["parent_key"] = key
                embedded_note["attachment_source_key"] = key
                target["notes"].append(embedded_note)
        elif kind == "annotation":
            annotation_count += 1
            target["notes"].append(_annotation(key, data, raw, warning))
        else:
            note = _note(key, data, raw, warning)
            parent = _optional_key(data.get("parentItem"), "parentItem")
            if parent in children and children[parent][1].get("itemType") == "attachment":
                note["attachment_source_key"] = parent
            target["notes"].append(note)
    canon_collections = _collections(collections, warning)
    collection_keys = {c["source_key"] for c in canon_collections}
    for paper in papers.values():
        for key in paper["collection_source_keys"]:
            if key not in collection_keys:
                warning.add("item_collection_missing", "文献引用的合集未出现在快照中，成员关系仅保留为来源引用。", paper["source_key"], "collections")
    return [papers[key] for key in sorted(papers)], canon_collections, annotation_count


def _csl_date(data: dict, warning: _Warnings, key: str) -> str:
    issued = data.get("issued")
    if not issued:
        return ""
    if not isinstance(issued, dict):
        raise ImportPlanError("invalid_date", "CSL issued 必须是对象。")
    date_parts = issued.get("date-parts")
    if date_parts:
        dates = _list(date_parts, "issued.date-parts", limit=8)
        parts = _list(dates[0], "issued.date-parts[]", limit=3)
        if not parts or not all(isinstance(v, int) and not isinstance(v, bool) for v in parts):
            raise ImportPlanError("invalid_date", "CSL 日期分量必须是整数。")
        if len(dates) > 1:
            warning.add("date_range_not_mapped", "日期区间暂采用起始日期，完整区间保留在来源数据中。", key, "issued")
        return "-".join(str(v) if index == 0 else f"{v:02d}" for index, v in enumerate(parts))
    return _text(issued.get("literal", issued.get("raw")), "issued.literal")


def _csl_plan(records: list, warning: _Warnings) -> list[dict]:
    papers = {}
    mapped = {"id", "type", "title", "author", "issued", "DOI", "URL", "abstract"}
    for raw in records:
        if not isinstance(raw, dict):
            raise ImportPlanError("invalid_record", "CSL JSON 文献必须是对象。")
        key = _identifier(raw["id"], "id") if raw.get("id") not in (None, "") else "csl-content:" + hashlib.sha256(_encoded(raw)).hexdigest()
        if raw.get("id") in (None, ""):
            warning.add("csl_identity_generated", "条目没有 CSL id，以完整来源记录内容哈希生成稳定键；后续改写内容会视为新条目。", key, "id")
        if key in papers:
            if _encoded(papers[key]["raw_source"]) != _encoded(raw):
                raise ImportPlanError("duplicate_key_conflict", "同一 CSL id 出现不同内容，请先整理导出文件。")
            warning.add("duplicate_source_record", "完全相同的重复记录只导入一次，不按 DOI 合并不同条目。", key)
            continue
        _unmapped(raw, mapped, warning, key)
        papers[key] = {"source_key": key, "source_version": 0,
                       "title": _text(raw.get("title"), "title") or "未命名 CSL 文献",
                       "item_type": _text(raw.get("type"), "type") or "article",
                       "authors": _authors(raw, warning, key, csl=True), "date": _csl_date(raw, warning, key),
                       "doi": _doi(raw.get("DOI")), "url": _safe_url(raw.get("URL"), warning, key),
                       "abstract": _text(raw.get("abstract"), "abstract"),
                       "tags": [], "collection_source_keys": [], "attachments": [], "notes": [], "raw_source": raw}
    warning.add("csl_bibliography_only", "CSL JSON 路线只迁移书目信息；请手动导入并关联 PDF。")
    for code, message in [("collections_not_in_csl", "CSL JSON 不保留 Zotero 合集层级与成员关系。"),
                          ("tags_not_in_csl", "CSL JSON 不迁移 Zotero 标签，请在导入后重新分类。"),
                          ("attachments_not_in_csl", "CSL JSON 不包含附件文件与 Zotero 附件身份。"),
                          ("notes_not_in_csl", "CSL JSON 不迁移 Zotero 独立笔记与富文本结构。"),
                          ("annotations_not_in_csl", "CSL JSON 不包含 Zotero 数据库中的 PDF 批注。")]:
        warning.add(code, message)
    return [papers[key] for key in sorted(papers)]


def _fit_to_store(items: list[dict], collections: list[dict], warning: _Warnings):
    # Never shorten an identity key: keys over 500 characters fail in parsing.
    def scalar(record: dict, field: str, maximum: int, key: str, *, identifier_value: bool = False):
        value = record.get(field, "")
        if len(value) <= maximum:
            return
        if identifier_value:
            record[field] = ""
            message = f"字段 {field} 超过 {maximum} 字符；不创建截断的错误标识或网址，原值完整保存在来源数据中。"
        else:
            record[field] = value[:maximum]
            message = f"字段 {field} 超过 {maximum} 字符，仅映射前 {maximum} 字符；原值完整保存在来源数据中。"
        warning.add("FIELD_TRUNCATED", message, key, field)

    def values(record: dict, field: str, key: str):
        value = record[field]
        if len(value) > 100:
            warning.add("FIELD_TRUNCATED", f"字段 {field} 有 {len(value)} 项，仅映射前 100 项；未映射 {len(value) - 100} 项，完整列表保存在来源数据中。", key, field)
            value = value[:100]
        result = []
        for index, entry in enumerate(value):
            if len(entry) > 500:
                warning.add("FIELD_TRUNCATED", f"字段 {field} 的第 {index + 1} 项超过 500 字符，仅映射前 500 字符；原值保留。", key, f"{field}[{index}]")
                entry = entry[:500]
            if entry and entry not in result:
                result.append(entry)
        record[field] = result

    for item in items:
        key = item["source_key"]
        for field, maximum in {"title": 1000, "item_type": 500, "date": 500, "abstract": 200_000}.items():
            scalar(item, field, maximum, key)
        scalar(item, "doi", 500, key, identifier_value=True)
        scalar(item, "url", 2000, key, identifier_value=True)
        for field in ("authors", "tags", "collection_source_keys"):
            values(item, field, key)
        for note in item["notes"]:
            for field in ("body", "quote", "translated_quote"):
                scalar(note, field, 100_000, note["source_key"])
        for attachment in item["attachments"]:
            scalar(attachment, "filename", 1000, attachment["source_key"])
            scalar(attachment, "mime", 500, attachment["source_key"])
    for collection in collections:
        scalar(collection, "name", 500, collection["source_key"])


def build_import_plan(payload: dict) -> dict:
    """Normalize an explicit Zotero API / CSL JSON snapshot without side effects.

    Identity is (source_id, entity kind, source_key), never DOI or title. Repeated
    identical records are deduplicated; conflicting duplicate source keys fail.
    Original records are retained as JSON data, not executable HTML. Annotation
    page_idx is deliberately null until the actual attachment is locally verified.
    """
    payload = _bounded_copy(payload)
    format_name = payload.get("format")
    if format_name not in {"zotero-api", "csl-json"}:
        raise ImportPlanError("unsupported_format", "首版支持 Zotero API JSON 与 CSL JSON，暂不支持 RDF、RIS 或 BibTeX 导入。")
    source_id = _identifier(payload.get("source_id"), "source_id")
    data = payload.get("data")
    if isinstance(data, dict) and format_name == "zotero-api":
        items = data.get("items", [])
        collections = data.get("collections", payload.get("collections", []))
    else:
        items = data
        collections = payload.get("collections", [])
    items = _list(items, "data/items", limit=MAX_ITEMS)
    collections = _list(collections, "collections", limit=MAX_COLLECTIONS)
    warning = _Warnings()
    for entry in _list(payload.get("warnings"), "warnings", limit=MAX_WARNINGS):
        if not isinstance(entry, dict):
            raise ImportPlanError("invalid_warning", "来源警告必须是对象。")
        warning.add(_identifier(entry.get("code"), "warning.code"), _text(entry.get("message"), "warning.message", limit=8192))
    if format_name == "csl-json":
        canonical_items = _csl_plan(items, warning)
        canonical_collections, annotation_count = [], 0
    else:
        canonical_items, canonical_collections, annotation_count = _zotero_plan(items, collections, warning)
    _fit_to_store(canonical_items, canonical_collections, warning)
    warning.add("word_citations_not_migrated", "不保留既有 Word 文档与 Zotero 引用的连接关系；导入不是完整库备份。")
    warning.add("plugin_data_not_migrated", "不迁移 Zotero 插件状态、任意插件私有数据或同步设置。")
    all_tags = {tag for item in canonical_items for tag in item["tags"]}
    notes = sum(len(item["notes"]) for item in canonical_items)
    plan = {"source_id": source_id, "source_kind": _text(payload.get("source_kind", format_name), "source_kind", limit=128),
            "items": canonical_items, "collections": canonical_collections, "warnings": warning.result(),
            "counts": {"items": len(canonical_items), "collections": len(canonical_collections),
                       "tags": len(all_tags), "attachments": sum(len(p["attachments"]) for p in canonical_items),
                       "notes": notes - annotation_count, "annotations": annotation_count}}
    if "snapshot" in payload:
        if not isinstance(payload["snapshot"], dict):
            raise ImportPlanError("invalid_snapshot", "快照状态必须是对象。")
        plan["snapshot"] = payload["snapshot"]
    plan["plan_hash"] = hashlib.sha256(_encoded(plan)).hexdigest()
    return plan


def _local_base_url(base_url: str) -> str:
    try:
        url = urlsplit(base_url)
        safe = (url.scheme == "http" and url.hostname in {"127.0.0.1", "localhost"}
                and url.port == 23119 and url.path == "/api/" and not url.query
                and not url.fragment and url.username is None and url.password is None)
    except (ValueError, TypeError):
        safe = False
    if not safe:
        raise LocalSnapshotError("local_url_required", "Zotero 只读预览仅允许本机 http://127.0.0.1:23119/api/，不能请求外部地址。")
    # Resolve no arbitrary hostname; localhost is deliberately pinned to loopback.
    return "http://127.0.0.1:23119/api/"


def fetch_local_snapshot(*, client=None, base_url="http://127.0.0.1:23119/api/", source_namespace: str | None = None) -> dict:
    """Explicitly fetch a bounded, read-only snapshot of Zotero's personal library.

    An injected synchronous httpx.Client enables fully offline MockTransport
    tests. The function never follows server-supplied pagination or file URLs.
    Version checks detect concurrent edits. A pre-10 client requires a manually
    named source_namespace and is explicitly marked best-effort because its
    versions cannot reliably detect local mutations; no shared fallback is used.
    """
    import httpx

    base = _local_base_url(base_url)
    owned = client is None
    if owned:
        client = httpx.Client(timeout=httpx.Timeout(8.0, connect=2.0), follow_redirects=False, trust_env=False)
    consumed_bytes = 0
    server_id = None
    identity_checked = False
    schema_version = None
    library_version = None
    observed_version_presence = None
    snapshot_warnings = []
    legacy_namespace = None

    def request(path: str, params: dict | None = None, *, root: bool = False, conditional: bool = False):
        nonlocal consumed_bytes, server_id, identity_checked, schema_version, library_version, observed_version_presence
        if path not in {"", "users/0/items", "users/0/collections"}:
            raise LocalSnapshotError("local_path_not_allowed", "此 Zotero API 路径不在首版只读范围内。")
        headers = {"Zotero-API-Version": "3", "Accept": "application/json"}
        if server_id is not None:
            headers["Zotero-Server-ID"] = server_id
        if conditional and library_version is not None:
            headers["If-Modified-Since-Version"] = str(library_version)
        try:
            # Avoid inheriting credentials/cookies from a supplied Client.
            request_object = httpx.Request("GET", base + path, params=params, headers=headers,
                                           extensions={"timeout": httpx.Timeout(8.0, connect=2.0).as_dict()})
            with closing(client.send(request_object, stream=True, auth=None, follow_redirects=False)) as response:
                if response.status_code == 403:
                    raise LocalSnapshotError("local_api_disabled", "请在 Zotero 设置 → 高级中开启“允许此计算机上的其他程序与 Zotero 通信”，然后重试预览。")
                if response.status_code == 412:
                    raise LocalSnapshotError("instance_changed", "Zotero 实例已切换，请重新获取预览，不要确认旧计划。")
                if 300 <= response.status_code < 400 and response.status_code != 304:
                    raise LocalSnapshotError("redirect_refused", "Zotero 返回了重定向；首版不会读取附件路径或转到其他地址。")
                if response.status_code not in ({200, 204} if root else {200, 304} if conditional else {200}):
                    raise LocalSnapshotError("local_http_error", f"Zotero 本地 API 暂不可用（HTTP {response.status_code}）。")
                if response.headers.get("Zotero-API-Version") != "3":
                    raise LocalSnapshotError("api_version_unsupported", "此 Zotero 本地 API 不是已验证的版本 3。")
                current_id = response.headers.get("Zotero-Server-ID")
                if current_id is not None and not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", current_id):
                    raise LocalSnapshotError("invalid_server_id", "Zotero 实例身份响应无效。")
                if identity_checked and current_id != server_id:
                    raise LocalSnapshotError("instance_changed", "Zotero 实例已切换，请重新获取预览。")
                if not identity_checked:
                    if not root:
                        raise LocalSnapshotError("instance_changed", "Zotero 实例身份在读取过程中变化，请重新获取预览。")
                    server_id = current_id
                    identity_checked = True
                schema = response.headers.get("Zotero-Schema-Version")
                if schema is not None:
                    if not re.fullmatch(r"[0-9]{1,12}", schema):
                        raise LocalSnapshotError("invalid_schema_version", "Zotero 模式版本响应无效。")
                    if schema_version is not None and schema_version != schema:
                        raise LocalSnapshotError("schema_changed", "Zotero 数据格式在读取过程中变化，请重新获取预览。")
                    schema_version = schema
                version_header = response.headers.get("Last-Modified-Version")
                if not root:
                    present = version_header is not None
                    if server_id is not None and not present:
                        raise LocalSnapshotError("library_version_missing", "Zotero 本地 API 未返回库版本，无法核验一致快照。")
                    if observed_version_presence is not None and observed_version_presence != present:
                        raise LocalSnapshotError("library_version_missing", "Zotero 库版本响应不完整，请重新获取预览。")
                    observed_version_presence = present
                    if present:
                        if not re.fullmatch(r"[0-9]{1,19}", version_header):
                            raise LocalSnapshotError("invalid_library_version", "Zotero 库版本响应无效。")
                        version = int(version_header)
                        if library_version is None:
                            library_version = version
                        elif version != library_version:
                            raise LocalSnapshotError("library_changed", "读取期间 Zotero 文献库发生变化，请停止修改后重新预览。")
                chunks = []
                for chunk in response.iter_bytes(chunk_size=65536):
                    consumed_bytes += len(chunk)
                    if consumed_bytes > MAX_PAYLOAD_BYTES:
                        raise LocalSnapshotError("snapshot_byte_limit", "Zotero 快照超过首版 16 MiB 限制，请使用分批 CSL JSON 导入。")
                    chunks.append(chunk)
                content = b"".join(chunks)
                return response.status_code, dict(response.headers), content
        except LocalSnapshotError:
            raise
        except httpx.TimeoutException as exc:
            raise LocalSnapshotError("local_timeout", "Zotero 本地 API 读取超时，请确认 Zotero 已启动后重试。") from exc
        except httpx.HTTPError as exc:
            raise LocalSnapshotError("local_connection_failed", "无法连接 Zotero 本地 API，请启动 Zotero 并启用本机通信设置。") from exc

    def records(path: str, maximum: int) -> list:
        result = []
        seen_keys = set()
        total = None
        for page in range(maximum // PAGE_SIZE + 2):
            _, response_headers, content = request(path, {"format": "json", "limit": PAGE_SIZE, "start": len(result)})
            try:
                batch = json.loads(content)
            except (ValueError, UnicodeError, RecursionError) as exc:
                raise LocalSnapshotError("local_invalid_json", "Zotero 返回了无效的 JSON 数据。") from exc
            if not isinstance(batch, list) or len(batch) > PAGE_SIZE:
                raise LocalSnapshotError("local_pagination_invalid", "Zotero 分页返回格式或数量不符合首版约束。")
            total_header = response_headers.get("total-results")
            if total_header is not None:
                if not re.fullmatch(r"[0-9]{1,12}", total_header):
                    raise LocalSnapshotError("local_total_invalid", "Zotero 分页总数响应无效。")
                current_total = int(total_header)
                if current_total > maximum:
                    raise LocalSnapshotError("snapshot_item_limit", "Zotero 库超出首版条目数量限制，请分批导出导入。")
                if total is not None and total != current_total:
                    raise LocalSnapshotError("library_changed", "Zotero 分页总数变化，请重新获取快照。")
                total = current_total
            for raw in batch:
                try:
                    key, _, _ = _unwrap(raw)
                except ImportPlanError as exc:
                    raise LocalSnapshotError("local_invalid_record", "Zotero 返回的条目缺少有效的来源键或版本。") from exc
                if key in seen_keys:
                    raise LocalSnapshotError("pagination_duplicate_key", "Zotero 分页出现重复来源键，无法确认完整快照，请重新预览。")
                seen_keys.add(key)
            result.extend(batch)
            if len(result) > maximum or (total is not None and len(result) > total):
                raise LocalSnapshotError("snapshot_item_limit", "Zotero 分页超出声明的条目数量限制。")
            if len(batch) < PAGE_SIZE or (total is not None and len(result) == total):
                if total is not None and len(result) != total:
                    raise LocalSnapshotError("local_snapshot_incomplete", "Zotero 分页缺少条目，拒绝确认不完整快照。")
                return result
        raise LocalSnapshotError("snapshot_page_limit", "Zotero 分页请求超过首版限制。")

    try:
        request("", root=True)
        if server_id is None:
            try:
                legacy_namespace = _text(source_namespace, "source_namespace", limit=200)
                if not legacy_namespace or any(ord(c) < 32 or ord(c) == 127 for c in legacy_namespace):
                    raise ValueError
            except (ImportPlanError, ValueError):
                raise LocalSnapshotError("LOCAL_SOURCE_NAMESPACE_REQUIRED", "此 Zotero 未提供实例 ID；请填写并持续复用此本地库的专用来源名（1–200 字符、单行），然后重试预览。") from None
        items = records("users/0/items", MAX_ITEMS)
        collections = records("users/0/collections", MAX_COLLECTIONS)
        status, _, final_content = request("users/0/items", {"format": "json", "limit": 1, "start": 0}, conditional=True)
        if status == 200:
            try:
                final_data = json.loads(final_content)
                if not isinstance(final_data, list) or len(final_data) > 1:
                    raise ValueError
            except (ValueError, UnicodeError, RecursionError) as exc:
                raise LocalSnapshotError("local_invalid_json", "Zotero 快照校验响应无效。") from exc
        request("", root=True)
        if server_id is None:
            snapshot_warnings.extend([
                {"code": "legacy_instance_named", "message": "此 Zotero 未提供实例 ID；此次以你指定的专用来源名隔离条目身份，请为同一库持续复用此名，为不同库使用不同名称。"},
                {"code": "legacy_snapshot_best_effort", "message": "旧版 Zotero 的库版本不能可靠反映本地改动；此次快照只能尽力核验，预览期间请勿修改来源库。"},
            ])
        snapshot_warnings.append({"code": "personal_library_only", "message": "首版本地预览只覆盖个人文献库，不含群组库、已删除条目、保存的搜索与插件状态。"})
        source_id = f"local:{server_id}:users:0" if server_id else f"local:legacy:{legacy_namespace}:users:0"
        payload = {"format": "zotero-api", "source_kind": "zotero-local", "source_id": source_id,
                   "data": {"items": items, "collections": collections}, "warnings": snapshot_warnings,
                   "snapshot": {"api_version": 3, "server_id": server_id, "schema_version": schema_version,
                                "library_version": library_version, "source_namespace": legacy_namespace,
                                "consistency": "version_checked" if server_id else "legacy_best_effort",
                                "scope": "users/0", "source_read_only": True}}
        # Enforce the same JSON limits before handing the snapshot to the API.
        return _bounded_copy(payload)
    finally:
        if owned:
            client.close()
