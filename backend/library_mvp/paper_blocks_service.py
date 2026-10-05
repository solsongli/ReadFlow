"""Small owned task runner. Credentials live only in running worker arguments, never job snapshots."""
from concurrent.futures import ThreadPoolExecutor
import json
import threading
import uuid
from .store import StoreError
from .ai_runtime import RequestControl
from .paper_blocks_storage import BlockStorage, write_json
from .paper_blocks_model import cache_key, EXTRACTOR_VERSION, SKIP
from .paper_blocks_translate import translate_blocks
from .paper_blocks_inline import rich_text, source_runs
from .paper_blocks_render import latex_zip, runtime_paths
from .paper_blocks_outputs import render_snapshot
from .paper_blocks_options import submission
from .reader_assistance_model import mapped_error
from .paper_blocks_labels import translation_units, translated_labels
from .paper_blocks_transport import token_usage
from .document_models import revision
from .translation_speed import workers
from .paper_blocks_batches import prioritize_pages
from . import paper_terms
from .paper_quality import summary


class BlockService:
    def __init__(self, store, assistance):
        self.storage = BlockStorage(store)
        self.assistance = assistance
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="readflow-blocks")
        self.lock = threading.RLock()
        self.pdf_lock = threading.Lock()
        self.terms_lock = threading.Lock()
        self.policy = assistance.translation_policy
        self.jobs, self.controls = {}, {}
        self.closed = False

    def status(self, item, attachment=None, language="zh-CN"):
        entry = self.storage.attachment(item, attachment)
        root = self.storage.directory(entry)
        document = self.storage.load(entry, accept_stale=True)
        with self.lock:
            contexts = (
                json.loads((root / "contexts.json").read_text()) if (root / "contexts.json").exists() else {}
            )
            old = (
                json.loads((root / "selection.json").read_text())
                if (root / "selection.json").exists()
                else {}
            )
            context = contexts.get(language, old if old.get("language") == language else {})
            cache = self.storage.cache(entry)
            jobs = [dict(j) for j in self.jobs.values() if j["sha256"] == entry["sha256"]]
        active = [j for j in jobs if j["status"] in ("queued", "running", "cancelling")]
        job = next(
            (j for j in active if j["scope"] == "full"), next(iter(active), jobs[-1] if jobs else None)
        )
        stale = bool(
            document
            and (
                document["extractor_version"] != EXTRACTOR_VERSION
                or revision()
                and document.get("model_revision") != revision()
            )
        )
        has_translation = False
        if document:
            blocks = []
            for block in document["blocks"]:
                value = (
                    None
                    if block["type"] in SKIP
                    else cache.get(cache_key(block, language, context.get("fingerprint", "")))
                )
                has_translation = has_translation or bool(value)
                runs = (
                    value.get("runs")
                    if isinstance(value, dict)
                    else source_runs(block, value)
                    if value
                    else None
                )
                labels = translated_labels(block, cache, language, context.get("fingerprint", ""))
                qa = value.get("qa") if isinstance(value, dict) else None
                label_qa = [label["qa"] for label in labels if label.get("qa")]
                if label_qa:
                    qa = {
                        "issues": sorted({issue for q in label_qa for issue in q.get("issues", [])}),
                        "retried": any(q.get("retried") for q in label_qa),
                    }
                blocks.append(
                    {
                        **block,
                        "translation": rich_text(value),
                        "translation_runs": runs,
                        "qa": qa,
                        "figure_text": labels,
                    }
                )
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
            "terms": paper_terms.load(root, language),
            "qa": summary(
                cache.get(cache_key(b, language, context.get("fingerprint", "")))
                for b in translation_units(document["blocks"])
                if document
            )
            if document
            else {},
        }

    def edit_terms(self, item, body):
        language = body.get("language", "zh-CN")
        if language not in ("zh-CN", "en", "ja", "de", "fr"):
            raise StoreError("INVALID_LANGUAGE", "目标语言无效。")
        rows = body.get("entries")
        if not isinstance(rows, list) or len(rows) > 100 or len(json.dumps(rows)) > 50000:
            raise StoreError("INVALID_TERMS", "术语表格式无效。")
        entries = paper_terms.normalize(rows)
        if len(entries) != len(rows):
            raise StoreError("INVALID_TERMS", "术语不能为空、重复或过长。")
        entry = self.storage.attachment(item, body.get("attachment_id"))
        root = self.storage.directory(entry)
        with self.lock:
            prior = paper_terms.load(root, language)
            if body.get("revision") != prior["revision"]:
                raise StoreError("CONFLICT", "术语已在其他窗口修改，请刷新后重试。", 409)
            old = {r["source"].casefold(): r["target"] for r in prior["entries"]}
            new = {r["source"].casefold(): r["target"] for r in entries}
            changed = {key for key in old.keys() | new.keys() if old.get(key) != new.get(key)}
            document = self.storage.load(entry, accept_stale=True) or {"blocks": []}
            affected = [
                b["id"]
                for b in translation_units(document["blocks"])
                if b["type"] not in SKIP and any(paper_terms.occurs(t, b["text"]) for t in changed)
            ]
            value = {
                "entries": [dict(r, keep=r["source"] == r["target"]) for r in entries],
                "prepared": True,
                "revision": prior["revision"] + 1,
                "affected": affected,
            }
            paper_terms.save(root, language, value)
            return value

    def start(self, item, body, *, extraction=False, render_only=False):
        density = body.get("density", "balanced")
        if density not in {"balanced", "compact"}:
            raise StoreError("INVALID_DENSITY", "排版密度无效。")
        if self.closed:
            raise StoreError("service_closed", "文献服务正在关闭。", 503)
        entry = self.storage.attachment(item, body.get("attachment_id"))
        ids = body.get("block_ids")
        if ids is not None and (
            not isinstance(ids, list)
            or len(ids) > 5000
            or any(not isinstance(i, str) or len(i) > 100 for i in ids)
        ):
            raise StoreError("INVALID_BLOCKS", "相关块列表无效。")
        config, terms, language, fingerprint = submission(self, entry, body, extraction, render_only)
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
                "usage": token_usage({}),
                "notices": [],
                "concurrency": workers(config),
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
                body.get("image_text") is not False,
                body.get("current_page") if type(body.get("current_page")) is int else None,
                render_only,
                ids,
                density,
            )
            return dict(job)

    from .paper_blocks_worker import run

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
            context = (
                json.loads((root / "selection.json").read_text())
                if (root / "selection.json").exists()
                else {}
            )
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
