"""Read-only full-text translation status for workbench rows.

The original RetainPDF job service owns translations; library attachments map to its documents by
PDF SHA-256. This module only reads the newest jobs per document and summarizes them. It never
starts, retries or cancels work, and any lookup failure degrades to status "unknown".
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import math
import threading
import time
from typing import Any, Callable, Iterable

QUEUED = frozenset({"queued", "pending", "paused"})
FAILED = frozenset({"failed", "cancelled", "canceled"})
NONE = {"status": "none", "job_id": None, "percent": None, "updated_at": None}


def _mapping(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def summarize_jobs(jobs: Iterable[Any]) -> dict:
    """Newest-first job list → {"status": none|queued|running|done|failed, "job_id", "percent", "updated_at"}."""
    for job in jobs:
        if not isinstance(job, dict):
            continue
        translation = _mapping(_mapping(job.get("stages")).get("translation"))
        state = translation.get("state")
        status = str(job.get("status") or "")
        job_id = job.get("job_id") if isinstance(job.get("job_id"), str) else None
        updated_at = job.get("updated_at") if isinstance(job.get("updated_at"), str) else None
        if job.get("workflow") == "ocr" and state in (None, "skipped"):
            continue  # OCR-only runs never produce a translation.
        if job.get("output_pdf_ready") is True or state == "completed" or (status == "succeeded" and state not in ("skipped", "pending")):
            return {"status": "done", "job_id": job_id, "percent": 100, "updated_at": updated_at}
        if status == "running":
            percent = _mapping(translation.get("progress")).get("percent")
            return {"status": "running", "job_id": job_id,
                    "percent": max(0, min(100, round(percent))) if isinstance(percent, (int, float)) and not isinstance(percent, bool) and math.isfinite(percent) else None,
                    "updated_at": updated_at}
        if status in QUEUED:
            return {"status": "queued", "job_id": job_id, "percent": None, "updated_at": updated_at}
        if status in FAILED:
            return {"status": "failed", "job_id": job_id, "percent": None, "updated_at": updated_at}
    return dict(NONE)


class TranslationStatus:
    """TTL-cached, parallel lookups so a list refresh costs at most one request per new PDF."""

    def __init__(self, fetch: Callable[[str], list[dict]], *, ttl: float = 20.0, workers: int = 6,
                 clock: Callable[[], float] = time.monotonic):
        self._fetch, self._ttl, self._clock = fetch, ttl, clock
        self._cache: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="workbench-translation")

    def close(self) -> None:
        self._pool.shutdown(wait=False, cancel_futures=True)

    def _lookup(self, digest: str) -> dict:
        try:
            value = summarize_jobs(self._fetch(digest))
        except Exception:  # noqa: BLE001 - any bridge/network failure only hides the status.
            value = {"status": "unknown", "job_id": None, "percent": None, "updated_at": None}
        with self._lock:
            self._cache[digest] = (self._clock(), value)
        return value

    def states(self, digests: Iterable[str]) -> dict[str, dict]:
        now, result, missing = self._clock(), {}, []
        with self._lock:
            for digest in dict.fromkeys(digests):
                cached = self._cache.get(digest)
                if cached and now - cached[0] < self._ttl:
                    result[digest] = cached[1]
                else:
                    missing.append(digest)
        for digest, value in zip(missing, self._pool.map(self._lookup, missing)):
            result[digest] = value
        return result


def _finished_time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def desk_summary(rows: list[dict], group_count: int) -> dict:
    """Aggregate all live papers, not just the small desk preview lists. Notes exclude annotations."""
    attached = [row for row in rows if row["attachment_id"]]
    done = [row for row in attached if row["translation"].get("status") == "done"]
    dated = [(stamp, row) for row in done if (stamp := _finished_time(row["translation"].get("updated_at"))) is not None]
    recent = max(dated, key=lambda entry: (entry[0], entry[1]["id"]))[1] if dated else None
    return {
        "counts": {"total": len(rows), "translated": len(done),
                   "notes": sum(row["notes_count"] - row["annotations_count"] for row in rows),
                   "annotations": sum(row["annotations_count"] for row in rows), "groups": group_count},
        "translation": {
            "running": [{"item_id": row["id"], "title": row["title"], "title_translated": row["title_translated"],
                         "percent": row["translation"].get("percent")} for row in attached if row["translation"].get("status") == "running"],
            "queued": sum(row["translation"].get("status") == "queued" for row in attached),
            "done": len(done),
            "recent_done": {"item_id": recent["id"], "title": recent["title"], "finished_at": recent["translation"]["updated_at"]} if recent else None,
        },
    }
