"""Bounded task diagnostics and safe persisted failure summaries."""
from .paper_diagnostics import diagnostic, annotate
from .reader_assistance_model import mapped_error
from .paper_blocks_storage import write_json
from .paper_blocks_model import cache_key
from .paper_blocks_labels import translation_units
from .paper_quality import checks


def record(service, identity, error, stage):
    item = diagnostic(error, stage)
    with service.lock:
        values = service.jobs[identity].setdefault("diagnostics", [])
        if item not in values and len(values) < 20:
            values.append(item)
    return item


def notice(service, identity, value):
    with service.lock:
        values = service.jobs[identity].setdefault("notices", [])
        if value not in values:
            values.append(value)


def fail(service, identity, entry, error, stage, secret, language, fingerprint):
    detail = record(service, identity, error, stage)
    safe = {**mapped_error(error, secret), "details": detail}
    service.jobs[identity].update(status="failed", phase="失败", error=safe)
    root = service.storage.directory(entry)
    previous = service.storage.result(entry) or {
        "language": language,
        "fingerprint": fingerprint,
        "revision": identity,
        "layout_ready": False,
        "reflow_ready": False,
    }
    write_json(
        root / "result.json",
        {
            **previous,
            "error": safe,
            "diagnostics": list(service.jobs[identity].get("diagnostics", [])),
            "notices": list(service.jobs[identity].get("notices", [])),
            "usage": service.jobs[identity]["usage"],
        },
    )


def recheck_cached(service, entry, blocks, cache, language, fingerprint, terms):
    """Explicit translate/resume uses its known user glossary; never silently guesses user preferences."""
    patch = {}
    for block in translation_units(blocks):
        key = cache_key(block, language, fingerprint)
        value = cache.get(key)
        if not isinstance(value, dict) or not value.get("text") or not isinstance(value.get("qa"), dict):
            continue
        qa = value["qa"]
        issues = checks(block, value, language, terms)
        if qa.get("issues") != issues:
            patch[key] = {**value, "qa": {**qa, "issues": issues}}
    if patch:
        service.merge_cache(entry, patch)
        cache.update(patch)


def exhausted(service, identity, entry, problem):
    error = problem or {
        "code": "other",
        "message": "所有块均未能完成翻译，请查看详情后重试。",
        "details": {"stage": "batch", "exception": "BatchExhausted"},
    }
    with service.lock:
        service.jobs[identity].update(status="failed", phase="未完成翻译", error=error)
        previous = service.storage.result(entry) or {}
        write_json(
            service.storage.directory(entry) / "result.json",
            {**previous, "error": error, "diagnostics": list(service.jobs[identity].get("diagnostics", []))},
        )
