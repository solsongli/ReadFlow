"""Publish the page-preserving PDF first, then its optional reflow companion."""
from datetime import datetime, timezone
from contextlib import nullcontext
from .paper_blocks_layout import render_layout
from .paper_blocks_aligned import render_aligned
from .paper_blocks_render import render
from .paper_blocks_storage import write_json


def render_outputs(
    storage,
    entry,
    document,
    cache,
    language,
    fingerprint,
    check,
    update,
    image_text,
    extra,
    density="balanced",
):
    root = storage.directory(entry)
    repair = storage.repair_state(entry)
    update(phase="生成逐行对齐译文 PDF", percent=84)
    aligned = render_aligned(
        storage.store.attachment_path(entry["id"]),
        root,
        document,
        cache,
        language,
        fingerprint,
        check,
        image_text=image_text,
        refresh_outline=repair.get("pending", False),
        progress=lambda done, total: update(percent=84 + round(5 * done / max(1, total))),
    )
    update(phase="生成原版式译文 PDF", percent=89)
    layout = (
        aligned
        if density == "aligned"
        else render_layout(
            storage.store.attachment_path(entry["id"]),
            root,
            document,
            cache,
            language,
            fingerprint,
            check,
            image_text=image_text,
            refresh_outline=repair.get("pending", False),
            density=density,
            progress=lambda done, total: update(percent=89 + round(5 * done / max(1, total))),
        )
    )
    if density == "aligned":
        from shutil import copyfile

        copyfile(root / "translated-aligned.pdf", root / "translated-layout.pdf")
        copyfile(root / "layout-aligned-audit.json", root / "layout-audit.json")
        copyfile(root / "layout-aligned-pages.json", root / "layout-pages.json")
    result = {
        **extra,
        "marker_cleanup": {k: repair.get(k, 0) for k in ("tokens", "unresolved")},
        "language": language,
        "fingerprint": fingerprint,
        "image_text": image_text,
        "revision": datetime.now(timezone.utc).isoformat(),
        "layout_ready": True,
        "aligned_ready": True,
        "reflow_ready": False,
        "layout_overflow": layout["layout_overflow"],
        "layout_truncated": layout["layout_truncated"],
        "layout_label_fallback": layout["label_fallback"],
        "layout_render_fallback": layout["render_fallback"],
        "layout_seconds": layout["seconds"],
        "layout_rendered_pages": layout.get("rendered_pages", []),
        "layout_reused_pages": layout.get("reused_pages", []),
        "layout_density": density,
        "aligned_seconds": aligned["seconds"],
        "aligned_metrics": aligned["metrics"],
        "aligned_overflow": aligned["aligned_overflow"],
        "aligned_shrunk": aligned["aligned_shrunk"],
    }
    check()
    write_json(root / "result.json", result)
    update(phase="生成重排译文 PDF", percent=96)
    warnings = render(root, document, cache, language, fingerprint, check, image_text=image_text)
    check()
    result.update(warnings, reflow_ready=True)
    write_json(root / "result.json", result)
    storage.finish_repair(entry, repair.get("revision"))
    return result


def render_snapshot(
    service,
    entry,
    document,
    language,
    fingerprint,
    check,
    update,
    image_text,
    extra,
    density="balanced",
    metrics=None,
):
    while not service.pdf_lock.acquire(timeout=0.1):
        check()
    try:
        check()
        with service.lock:
            cache = service.storage.cache(entry)
        with metrics.stage("render") if metrics else nullcontext():
            result = render_outputs(
                service.storage,
                entry,
                document,
                cache,
                language,
                fingerprint,
                check,
                update,
                image_text,
                extra,
                density,
            )
        if metrics:
            result["performance"] = metrics.snapshot()
            write_json(service.storage.directory(entry) / "result.json", result)
        return result
    finally:
        service.pdf_lock.release()
