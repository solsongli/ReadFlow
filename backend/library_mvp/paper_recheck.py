"""Explicit local QA refresh using the currently selected user glossary, never model credentials."""
import json
from .store import StoreError
from .paper_blocks_model import cache_key
from .paper_blocks_labels import translation_units
from .paper_quality import summary
from .paper_job_diagnostics import recheck_cached
from .paper_blocks_storage import write_json
from . import paper_terms


def recheck(service, item, body):
    if set(body) - {"attachment_id", "language", "glossary_id"}:
        raise StoreError("INVALID_FIELD", "本地质检只接受附件、语言和术语表。")
    language = body.get("language", "zh-CN")
    if language not in {"zh-CN", "en", "ja", "de", "fr"}:
        raise StoreError("INVALID_LANGUAGE", "目标语言无效。")
    entry = service.storage.attachment(item, body.get("attachment_id"))
    glossary_id = body.get("glossary_id")
    user = []
    if glossary_id:
        if not isinstance(glossary_id, str) or len(glossary_id) > 200 or service.assistance.bridge is None:
            raise StoreError("glossary_unavailable", "当前用户术语表无法读取。", 503)
        try:
            glossary = service.assistance.bridge.reader_glossary(glossary_id)
            user = glossary.get("entries", []) if glossary.get("enabled", True) else []
        except Exception:
            raise StoreError("glossary_unavailable", "当前用户术语表无法读取，请检查设置。", 503) from None
    with service.lock:
        root = service.storage.directory(entry)
        document = service.storage.load(entry, accept_stale=True)
        if not document:
            raise StoreError("no_translation", "请先提取文献块。", 409)
        contexts = (
            json.loads((root / "contexts.json").read_text(encoding="utf-8")) if (root / "contexts.json").exists() else {}
        )
        previous = service.storage.result(entry) or {}
        selection = (
            json.loads((root / "selection.json").read_text(encoding="utf-8"))
            if (root / "selection.json").exists()
            else previous
        )
        selected = contexts.get(language, selection if selection.get("language") == language else {})
        fingerprint = selected.get("fingerprint")
        if not fingerprint:
            raise StoreError("no_translation", "当前语言没有可质检的缓存。", 409)
        cache = service.storage.cache(entry)
        terms = paper_terms.effective(paper_terms.load(root, language)["entries"], user)
        recheck_cached(service, entry, document["blocks"], cache, language, fingerprint, terms)
        quality = summary(
            cache.get(cache_key(b, language, fingerprint)) for b in translation_units(document["blocks"])
        )
        if previous.get("language") == language:
            write_json(root / "result.json", {**previous, "qa": quality})
        return {"qa": quality, "model_requests": 0}
