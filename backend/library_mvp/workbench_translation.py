"""Read-only full-text translation status for workbench rows.

The original RetainPDF job service owns translations; library attachments map to its documents by
PDF SHA-256. This module only reads the newest jobs per document and summarizes them. It never
starts, retries or cancels work, and any lookup failure degrades to status "unknown".
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import threading
import time
from typing import Any, Callable, Iterable

QUEUED = frozenset({"queued", "pending", "paused"})
FAILED = frozenset({"failed", "cancelled", "canceled"})
NONE = {"status": "none", "job_id": None, "percent": None}


def _mapping(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def summarize_jobs(jobs: Iterable[Any]) -> dict:
    """Newest-first job list → {"status": none|queued|running|done|failed, "job_id", "percent"}."""
    for job in jobs:
        if not isinstance(job, dict):
            continue
        translation = _mapping(_mapping(job.get("stages")).get("translation"))
        state = translation.get("state")
        status = str(job.get("status") or "")
        job_id = job.get("job_id") if isinstance(job.get("job_id"), str) else None
        if job.get("workflow") == "ocr" and state in (None, "skipped"):
            continue  # OCR-only runs never produce a translation.
        if job.get("output_pdf_ready") is True or state == "completed" or (status == "succeeded" and state not in ("skipped", "pending")):
            return {"status": "done", "job_id": job_id, "percent": 100}
        if status == "running":
            percent = _mapping(translation.get("progress")).get("percent")
            return {"status": "running", "job_id": job_id,
                    "percent": round(float(percent)) if isinstance(percent, (int, float)) else None}
        if status in QUEUED:
            return {"status": "queued", "job_id": job_id, "percent": None}
        if status in FAILED:
            return {"status": "failed", "job_id": job_id, "percent": None}
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
            value = {"status": "unknown", "job_id": None, "percent": None}
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
