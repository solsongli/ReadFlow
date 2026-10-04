"""Small owned task runner. Credentials live only in running worker arguments, never job snapshots."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import threading
import uuid
from .store import StoreError
from .ai_runtime import RequestControl
from .paper_blocks_storage import BlockStorage, write_json
from .paper_blocks_model import cache_key, service_fingerprint, EXTRACTOR_VERSION
from .paper_blocks_translate import translate_blocks
from .paper_blocks_inline import rich_text, source_runs
from .paper_blocks_render import render, latex_zip, runtime_paths
from .reader_assistance_model import translation_config, mapped_error


class BlockService:
    def __init__(self, store, assistance):
        self.storage = BlockStorage(store)
        self.assistance = assistance
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="readflow-blocks")
        self.lock = threading.RLock()
        self.pdf_lock = threading.Lock()
        self.requests = threading.BoundedSemaphore(2)
        self.jobs, self.controls = {}, {}
        self.closed = False

    def status(self, item, attachment=None, language="zh-CN"):
        entry = self.storage.attachment(item, attachment)
        root = self.storage.directory(entry)
        document = self.storage.load(entry, accept_stale=True)
        with self.lock:
            contexts = json.loads((root / "contexts.json").read_text()) if (root / "contexts.json").exists() else {}
            old = json.loads((root / "selection.json").read_text()) if (root / "selection.json").exists() else {}
            context = contexts.get(language, old if old.get("language") == language else {})
            cache = self.storage.cache(entry)
            jobs = [dict(j) for j in self.jobs.values() if j["sha256"] == entry["sha256"]]
        active = [j for j in jobs if j["status"] in ("queued", "running", "cancelling")]
        job = next((j for j in active if j["scope"] == "full"), next(iter(active), jobs[-1] if jobs else None))
        stale = bool(document and document["extractor_version"] != EXTRACTOR_VERSION)
        has_translation = False
        if document:
            blocks = []
            for block in document["blocks"]:
                value = cache.get(cache_key(block, language, context.get("fingerprint", "")))
                has_translation = has_translation or bool(value)
                runs = value.get("runs") if isinstance(value, dict) else source_runs(block, value) if value else None
                blocks.append({**block, "translation": rich_text(value), "translation_runs": runs})
            document = {**document, "blocks": blocks}
        try:
            runtime_paths()
            renderer = True
        except StoreError:
            renderer = False
        return {
            "document": document,
            "job": job,
            "jobs": jobs[-100:],
            "has_translation": has_translation,
            "language": language,
            "needs_extract": stale,
            "result": self.storage.result(entry),
            "renderer_ready": renderer,
        }

    def start(self, item, body, *, extraction=False):
        if self.closed:
            raise StoreError("service_closed", "文献服务正在关闭。", 503)
        entry = self.storage.attachment(item, body.get("attachment_id"))
        config, terms, fingerprint = {}, [], ""
        language = body.get("language", "zh-CN")
        if language not in ("zh-CN", "en", "ja", "de", "fr"):
            raise StoreError("INVALID_LANGUAGE", "暂不支持该目标语言。")
        if not extraction:
            self.assistance.gate()
            config = translation_config(body.get("translation"))
            terms = body["translation"].get("glossary_entries") or []
            identity = body["translation"].get("glossary_id")
            if identity:
                try:
                    glossary = self.assistance.bridge.reader_glossary(identity)
                    terms = glossary.get("entries", []) if glossary.get("enabled", True) else []
                except Exception:
                    config.clear()
                    raise StoreError("glossary_unavailable", "当前术语表无法读取，请检查设置。", 503) from None
            if not isinstance(terms, list) or len(json.dumps(terms)) > 100000:
                config.clear()
                raise StoreError("INVALID_GLOSSARY", "术语表格式无效或过大。")
            fingerprint = service_fingerprint(config, terms)
        scope = "extract" if extraction else "block" if body.get("block_id") else "full"
        with self.lock:
            active = next(
                (
                    j
                    for j in self.jobs.values()
                    if j["sha256"] == entry["sha256"]
                    and j["status"] in ("queued", "running", "cancelling")
                    and j["scope"] == scope
                    and (
                        scope != "block"
                        or (
                            j["block_id"] == body.get("block_id")
                            and j["language"] == language
                            and j["fingerprint"] == fingerprint
                        )
                    )
                ),
                None,
            )
            if active:
                config.clear()
                return dict(active)
            job_id = str(uuid.uuid4())
            job = {
                "id": job_id,
                "item_id": item,
                "sha256": entry["sha256"],
                "status": "queued",
                "phase": "提取",
                "percent": 0,
                "error": None,
                "language": language,
                "scope": scope,
                "block_id": body.get("block_id"),
                "fingerprint": fingerprint,
            }
            self.jobs[job_id] = job
            self.controls[job_id] = {"cancel": threading.Event(), "requests": set(), "credentials": config}
            # Only bounded scalar options enter the worker; the incoming request dict is never retained.
            self.pool.submit(
                self.run,
                job_id,
                entry,
                config,
                terms,
                language,
                fingerprint,
                body.get("block_id"),
                body.get("force") is True,
                extraction,
            )
            return dict(job)

    def run(self, identity, entry, config, terms, language, fingerprint, block_id, force, extraction):
        token = self.controls[identity]
        secret = config.get("api_key", "")

        def check():
            if token["cancel"].is_set():
                raise StoreError("cancelled", "已取消。")

        def update(**changes):
            with self.lock:
                self.jobs[identity].update(changes)

        try:
            update(status="running")
            check()
            with self.pdf_lock:
                document = self.storage.extract(entry, check)
            check()
            root = self.storage.directory(entry)
            if extraction:
                update(status="done", phase="已提取", percent=100)
                return
            blocks = document["blocks"]
            if not any(
                b["type"] in ("text", "title", "abstract", "heading", "caption", "list") and b["text"].strip()
                for b in blocks
            ):
                raise StoreError("no_text", "未提取到可翻译文字；本阶段尚未接入 OCR。", 409)
            if block_id:
                requested = next((b for b in blocks if b["id"] == block_id), None)
                if requested is None:
                    raise StoreError("NOT_FOUND", "找不到所选块。", 404)
                selected = requested.get("caption_id") or block_id
                blocks = [b for b in blocks if b["id"] == selected]
            else:
                runtime_paths()  # Fail before any paid request if packaged rendering resources are absent.
            with self.lock:
                cache = self.storage.cache(entry)

            def select_context():
                with self.lock:
                    context = {"language": language, "fingerprint": fingerprint}
                    contexts = (
                        json.loads((root / "contexts.json").read_text()) if (root / "contexts.json").exists() else {}
                    )
                    contexts[language] = context
                    write_json(root / "contexts.json", contexts)
                    write_json(root / "selection.json", context)

            def call(messages):
                while not self.requests.acquire(timeout=0.1):
                    check()
                control = RequestControl(60)
                with self.lock:
                    token["requests"].add(control)
                try:
                    check()
                    return self.assistance.chat(config, messages, control=control).replace(secret, "[已隐藏]")
                finally:
                    control.finish()
                    with self.lock:
                        token["requests"].discard(control)
                    self.requests.release()

            def save(patch):
                check()
                with self.lock:
                    self.merge_cache(entry, patch)
                    select_context()

            update(phase="翻译", percent=10)
            failed = translate_blocks(
                blocks,
                cache,
                language,
                fingerprint,
                call,
                terms,
                check,
                lambda done, total: update(percent=10 + round(75 * done / max(1, total))),
                save,
                force,
                clean=lambda text: text.replace(secret, "[已隐藏]"),
            )
            check()
            if any(cache_key(block, language, fingerprint) in cache for block in blocks):
                select_context()
            if not block_id:
                update(phase="排版", percent=90)
                with self.pdf_lock:
                    with self.lock:
                        cache = self.storage.cache(entry)
                    warnings = render(root, document, cache, language, fingerprint, check)
                check()
                result = {
                    "language": language,
                    "fingerprint": fingerprint,
                    "revision": datetime.now(timezone.utc).isoformat(),
                    "fallback_blocks": failed + warnings,
                }
                write_json(root / "result.json", result)
            update(status="done", phase="完成", percent=100, fallback_blocks=failed)
        except Exception as error:
            if token["cancel"].is_set():
                update(status="cancelled", phase="已取消", error=None)
            else:
                update(status="failed", phase="失败", error=mapped_error(error, secret))
        finally:
            config.clear()
            secret = ""
            with self.lock:
                self.controls.pop(identity, None)
                # Keep only a bounded in-memory public history.
                for key in list(self.jobs)[:-100]:
                    if key not in self.controls:
                        self.jobs.pop(key, None)

    def merge_cache(self, entry, patch):
        with self.lock:
            latest = self.storage.cache(entry)
            latest.update(patch)
            write_json(self.storage.directory(entry) / "translations.json", latest)

    def cancel(self, item, identity):
        with self.lock:
            job = self.jobs.get(identity)
            if not job or job["item_id"] != item:
                raise StoreError("NOT_FOUND", "任务不存在。", 404)
            token = self.controls.get(identity)
            if token and job["status"] in ("queued", "running", "cancelling"):
                token["cancel"].set()
                token["credentials"].clear()
                for request in list(token["requests"]):
                    request.cancel("user_cancelled")
                job["status"] = "cancelling"
            return dict(job)

    def export(self, item, attachment=None):
        entry = self.storage.attachment(item, attachment)
        with self.pdf_lock:
            document = self.storage.extract(entry)
            root = self.storage.directory(entry)
            context = json.loads((root / "selection.json").read_text()) if (root / "selection.json").exists() else {}
            return latex_zip(
                root,
                document,
                self.storage.cache(entry),
                context.get("language", "zh-CN"),
                context.get("fingerprint", ""),
            )

    def close(self):
        with self.lock:
            self.closed = True
            jobs = list(self.controls)
        for key in jobs:
            self.cancel(self.jobs[key]["item_id"], key)
        self.pool.shutdown(wait=True)
