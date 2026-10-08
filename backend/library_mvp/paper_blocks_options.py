"""Submission preflight; cached-only rendering never opens an external-model channel."""
import json
from .store import StoreError
from .reader_assistance_model import translation_config
from .paper_blocks_model import service_fingerprint


def submission(service, entry, body, extraction, render_only):
    config, terms, fingerprint = {}, [], ""
    language = body.get("language", "zh-CN")
    if language not in ("zh-CN", "en", "ja", "de", "fr"):
        raise StoreError("INVALID_LANGUAGE", "暂不支持该目标语言。")
    if render_only:
        root = service.storage.directory(entry)
        with service.lock:
            contexts = (
                json.loads((root / "contexts.json").read_text(encoding="utf-8")) if (root / "contexts.json").exists() else {}
            )
            old = json.loads((root / "selection.json").read_text(encoding="utf-8")) if (root / "selection.json").exists() else {}
            context = contexts.get(language, old if old.get("language") == language else {})
        if not context.get("fingerprint"):
            previous = service.storage.result(entry) or {}
            if previous.get("language") == language and previous.get("fingerprint"):
                context = previous
        if not context.get("fingerprint"):
            raise StoreError("no_translation", "当前语言还没有块译文，请先翻译。", 409)
        return config, terms, language, context["fingerprint"]
    if not extraction:
        service.assistance.gate()
        config = translation_config(body.get("translation"))
        terms = body["translation"].get("glossary_entries") or []
        identity = body["translation"].get("glossary_id")
        if identity:
            try:
                glossary = service.assistance.bridge.reader_glossary(identity)
                terms = glossary.get("entries", []) if glossary.get("enabled", True) else []
            except Exception:
                config.clear()
                raise StoreError("glossary_unavailable", "当前术语表无法读取，请检查设置。", 503) from None
        if not isinstance(terms, list) or len(json.dumps(terms)) > 100000:
            config.clear()
            raise StoreError("INVALID_GLOSSARY", "术语表格式无效或过大。")
        fingerprint = service_fingerprint(config, terms)
    return config, terms, language, fingerprint
