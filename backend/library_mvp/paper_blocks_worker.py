"""One document translation worker. Its credentials are cleared on every exit path."""
import json
from .store import StoreError
from .ai_runtime import RequestControl
from .paper_blocks_storage import write_json
from .paper_blocks_model import cache_key
from .paper_blocks_translate import translate_blocks
from .paper_blocks_render import runtime_paths
from .paper_blocks_outputs import render_snapshot
from .reader_assistance_model import mapped_error
from .paper_blocks_labels import translation_units
from .paper_blocks_transport import token_usage
from .translation_speed import workers, parallel_workers
from .paper_blocks_batches import prioritize_pages
from .paper_context import contextualize
from . import paper_terms
from .paper_quality import summary
from .paper_blocks_inline import rich_text
from .translation_metrics import TranslationMetrics
from .paper_blocks_batches import estimate_tokens


def run(
    self,
    identity,
    entry,
    config,
    terms,
    language,
    fingerprint,
    block_id,
    force,
    extraction,
    image_text=True,
    current_page=None,
    render_only=False,
    block_ids=None,
    density="balanced",
):
    token = self.controls[identity]
    secret = config.get("api_key", "")
    metrics = TranslationMetrics()
    if not extraction and not render_only:
        metrics.policy = {"configured_workers": workers(config), "pool_workers": parallel_workers(config)}

    def check():
        if token["cancel"].is_set():
            raise StoreError("cancelled", "已取消。")

    def update(**changes):
        with self.lock:
            self.jobs[identity].update(changes)

    try:
        update(status="running")
        check()
        with metrics.stage("extraction"), self.pdf_lock:
            document = self.storage.extract(entry, check)
        check()
        root = self.storage.directory(entry)
        if extraction:
            update(status="done", phase="已提取", percent=100)
            return
        if render_only:
            old = self.storage.result(entry) or {}
            with self.lock:
                cached = self.storage.cache(entry)
            extra = {key: old.get(key, default) for key, default in (
                ("usage", token_usage({})), ("notices", []), ("translation_fallback", []))}
            extra["qa"] = summary(cached.get(cache_key(b, language, fingerprint))
                                  for b in translation_units(document["blocks"]))
            update(qa=extra["qa"])
            render_snapshot(
                self,
                entry,
                document,
                language,
                fingerprint,
                check,
                update,
                image_text,
                extra,
                density,
                metrics=metrics,
            )
            update(status="done", phase="完成", percent=100)
            return
        blocks = document["blocks"]
        title = next((b["text"] for b in blocks if b["type"] == "title"), "")
        if not any(
            b["type"] in ("text", "title", "abstract", "heading", "caption", "list", "figure_text")
            and b["text"].strip()
            for b in translation_units(blocks)
        ):
            raise StoreError("no_text", "未识别到可翻译文字，请检查扫描质量或本地 OCR 资源。", 409)
        if block_id:
            requested = next((b for b in blocks if b["id"] == block_id), None)
            if requested is None:
                raise StoreError("NOT_FOUND", "找不到所选块。", 404)
            selected = requested.get("caption_id") or block_id
            blocks = [b for b in blocks if b["id"] in {selected, block_id}]
        else:
            runtime_paths()  # Fail before any paid request if packaged rendering resources are absent.
        if block_ids is not None:
            blocks = [b for b in translation_units(blocks) if b["id"] in block_ids]
            if not blocks:
                raise StoreError("NOT_FOUND", "没有需要重译的相关块。", 404)
        else:
            blocks = translation_units(blocks)
        with self.lock:
            cache = self.storage.cache(entry)

        def select_context():
            with self.lock:
                context = {"language": language, "fingerprint": fingerprint}
                contexts = (
                    json.loads((root / "contexts.json").read_text())
                    if (root / "contexts.json").exists()
                    else {}
                )
                contexts[language] = context
                write_json(root / "contexts.json", contexts)
                write_json(root / "selection.json", context)

        def call(messages):
            control = RequestControl(180)
            payload = json.loads(messages[-1]["content"])
            phase = (
                "qa_retranslation"
                if "review" in payload
                else (
                    "terminology"
                    if messages[0]["content"].startswith("READFLOW_PAPER_TERMS")
                    else "main_batches"
                )
            )
            control.translation_metrics = metrics
            control.translation_phase = phase
            with self.lock:
                token["requests"].add(control)
            try:
                check()
                with metrics.batch(
                    phase, estimate_tokens("".join(m["content"] for m in messages))
                ), self.policy.slot(config, control) as permit:
                    response = self.assistance.chat(
                        config, messages, control=control, batch=True, policy=self.policy, permit=permit
                    )
                update(notices=self.policy.notices(config))
                if isinstance(response, dict):
                    usage = token_usage(response.get("usage"))
                    with self.lock:
                        for key, value in usage.items():
                            self.jobs[identity]["usage"][key] += value
                    return {**response, "content": response.get("content", "").replace(secret, "[已隐藏]")}
                return response.replace(secret, "[已隐藏]")
            finally:
                control.finish()
                with self.lock:
                    token["requests"].discard(control)

        def save(patch):
            check()
            with metrics.stage("cache_commit"), self.lock:
                check()
                self.merge_cache(entry, patch)
                select_context()
                latest = self.storage.cache(entry)
                update(
                    qa=summary(
                        latest.get(cache_key(b, language, fingerprint))
                        for b in translation_units(document["blocks"])
                    )
                )

        if not block_id:
            term_started = metrics.clock()
            while not self.terms_lock.acquire(timeout=0.1):
                check()
            try:
                with self.lock:
                    terminology = paper_terms.load(root, language)
                if not terminology["prepared"]:
                    update(phase="统一本篇术语", percent=8)
                    proposals = paper_terms.propose(
                        paper_terms.candidates(document["blocks"]), call, language
                    )
                    check()
                    with self.lock:
                        # An explicit user edit made during the request takes priority.
                        if not paper_terms.load(root, language)["prepared"]:
                            affected = [
                                b["id"]
                                for b in translation_units(document["blocks"])
                                if (value := cache.get(cache_key(b, language, fingerprint)))
                                and any(
                                    paper_terms.occurs(t["source"], b["text"])
                                    and t["target"].casefold() not in rich_text(value).casefold()
                                    for t in proposals
                                )
                            ]
                            paper_terms.save(
                                root,
                                language,
                                {"entries": proposals, "prepared": True, "revision": 1, "affected": affected},
                            )
            finally:
                metrics.timings["terminology"] += metrics.clock() - term_started
                self.terms_lock.release()
        with self.lock:
            terms = paper_terms.effective(paper_terms.load(root, language)["entries"], terms)
        context = {b["id"]: b for b in translation_units(contextualize(document["blocks"], terms))}
        blocks = prioritize_pages([context.get(b["id"], b) for b in blocks], current_page)

        update(phase="翻译", percent=10)
        translation_started = metrics.clock()
        failed = translate_blocks(
            blocks,
            cache,
            language,
            fingerprint,
            call,
            terms,
            check,
            lambda done, total: update(
                percent=10 + round(75 * done / max(1, total)), completed_blocks=done, total_blocks=total
            ),
            save,
            force,
            clean=lambda text: text.replace(secret, "[已隐藏]"),
            title=title,
            concurrency=parallel_workers(config),
            quality=True,
        )
        metrics.timings["translation"] = metrics.clock() - translation_started
        check()
        if any(cache_key(block, language, fingerprint) in cache for block in blocks):
            select_context()
        if not block_id or self.storage.result(entry):
            render_snapshot(
                self,
                entry,
                document,
                language,
                fingerprint,
                check,
                update,
                image_text,
                {
                    "usage": dict(self.jobs[identity]["usage"]),
                    "notices": self.policy.notices(config),
                    "translation_fallback": failed,
                    "qa": self.jobs[identity].get("qa", {}),
                },
                density,
                metrics=metrics,
            )
        update(
            status="done",
            phase="完成",
            percent=100,
            translation_fallback=failed,
            performance=metrics.snapshot(),
        )
    except Exception as error:
        if token["cancel"].is_set():
            update(status="cancelled", phase="已取消", error=None)
        else:
            update(status="failed", phase="失败", error=mapped_error(error, secret))
    finally:
        update(performance=metrics.snapshot())
        config.clear()
        secret = ""
        with self.lock:
            self.controls.pop(identity, None)
            # Keep only a bounded in-memory public history.
            for key in list(self.jobs)[:-100]:
                if key not in self.controls:
                    self.jobs.pop(key, None)
