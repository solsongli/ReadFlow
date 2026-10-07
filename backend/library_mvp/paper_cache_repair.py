"""One-time local cache repair, independent of credentials and external-model permission."""
from .paper_markers import clean_rich, has_markers
from .paper_blocks_model import protect
from .paper_blocks_labels import translation_units
from .paper_blocks_aligned import ALIGNED_REVISION


def normalize_cache(document, cache):
    mappings = {}
    for block in translation_units(document.get("blocks", [])):
        _, spans = protect(block)
        mappings.update(spans)
    patch, count, unresolved = {}, 0, 0
    for key, value in cache.items():
        if not has_markers(value):
            continue
        repaired, info = clean_rich(value, mappings)
        if repaired == value:
            continue
        qa = {**(repaired.get("qa") or {})}
        if info["unresolved"]:
            qa["issues"] = sorted(set(qa.get("issues", [])) | {"internal_markers"})
        repaired.pop("marker_issues", None)
        repaired["qa"] = {**qa, "marker_cleanup": info}
        patch[key] = repaired
        count += info["tokens"]
        unresolved += info["unresolved"]
    return patch, {"entries": len(patch), "tokens": count, "unresolved": unresolved}


def aligned_stale(result):
    """A finished layout whose line-aligned PDF is missing or from an older renderer."""
    return bool(
        result
        and result.get("layout_ready")
        and (not result.get("aligned_ready") or result.get("aligned_revision") != ALIGNED_REVISION)
    )


def schedule_repair(service, item, entry):
    """Only one local render retry per process; failed repair stays available for manual rendering."""
    with service.lock:
        state = service.storage.repair_state(entry)
        result = service.storage.result(entry)
        aligned_missing = aligned_stale(result)
        if (not state.get("pending") and not aligned_missing) or not result or service.closed:
            return
        revision = state["revision"] if state.get("pending") else f"aligned-layout-v{ALIGNED_REVISION}"
        jobs = [j for j in service.jobs.values() if j["sha256"] == entry["sha256"]]
        if any(j["status"] in ("queued", "running", "cancelling") for j in jobs):
            return
        if any(j.get("repair_revision") == revision for j in jobs):
            return
        body = {
            "attachment_id": entry["id"],
            "language": result.get("language", "zh-CN"),
            "image_text": result.get("image_text", True),
            "density": result.get("layout_density", "balanced"),
        }
        job = service.start(item, body, render_only=True)
        service.jobs[job["id"]]["repair_revision"] = revision
