"""Opt-in delayed fake benchmark. Run alone after tests; no network/model/credential I/O."""
import argparse
import asyncio
import json
from pathlib import Path
import threading
import time
import httpx
from backend.library_mvp.paper_blocks_batches import planned_batches, prioritize_pages, batches
from backend.library_mvp.paper_blocks_labels import translation_units
from backend.library_mvp.paper_blocks_model import SKIP, cache_key
from backend.library_mvp.paper_blocks_translate import translate_blocks
from backend.library_mvp.paper_blocks_transport import run_batch
from backend.library_mvp.translation_speed import TranslationPolicy
from ops.development.readflow_fake_openai import completion_response, response_delay


def measure(document, mode, fixed, per_kchar, current_page):
    concurrency = {"serial": 1, "previous-two": 2, "adaptive-eight": 8}[mode]
    title = next((b["text"] for b in document["blocks"] if b["type"] == "title"), "")
    section, contextual = "", []
    for block in document["blocks"]:
        if block["type"] == "heading":
            section = block["text"][:250]
        contextual.append({**block, "section": section})
    blocks = translation_units(contextual)
    selected = [b for b in blocks if b["type"] not in SKIP and b["text"].strip()]
    if mode == "adaptive-eight":
        blocks = prioritize_pages(blocks, current_page)
    policy, lock = TranslationPolicy(), threading.Lock()
    cache, writes, first, active, peak, count = {}, 0, None, 0, 0, 0
    config = {
        "base_url": "https://api.deepseek.com/v1",
        "model": "readflow-test",
        "api_key": "benchmark-fixture-only",
        "workers": concurrency,
    }
    started = time.perf_counter()

    async def handle(request):
        nonlocal active, peak, count
        body = json.loads(request.content)
        with lock:
            active += 1
            count += 1
            peak = max(peak, active)
        try:
            status, response = completion_response(body)
            await asyncio.sleep(response_delay(response, fixed, per_kchar))
            return httpx.Response(status, json=response)
        finally:
            with lock:
                active -= 1

    def call(messages):
        return run_batch(config, messages, policy=policy, transport=httpx.MockTransport(handle))

    def save(delta):
        nonlocal first, writes
        writes += 1
        if first is None:
            first = time.perf_counter() - started

    failed = translate_blocks(
        blocks,
        cache,
        "zh-CN",
        "benchmark",
        call,
        [],
        lambda: None,
        lambda *_: None,
        save,
        title=title,
        concurrency=concurrency,
        plan=planned_batches if mode == "adaptive-eight" else lambda rows, *_: list(batches(rows)),
    )
    elapsed = time.perf_counter() - started
    assert not failed and len(cache) == len(selected)
    assert all(cache_key(block, "zh-CN", "benchmark") in cache for block in selected)
    return {
        "mode": mode,
        "units": len(selected),
        "requests": count,
        "cache_writes": writes,
        "peak_requests": peak,
        "first_batch_seconds": round(first or 0, 3),
        "total_seconds": round(elapsed, 3),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--safevla-blocks", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--delay-seconds", type=float, default=1.5)
    parser.add_argument("--delay-per-kchar", type=float, default=0.5)
    options = parser.parse_args()
    if min(options.delay_seconds, options.delay_per_kchar) < 0:
        parser.error("Delays must be nonnegative")
    fixture = Path(__file__).resolve().parents[3] / "frontend/web/tests/fixtures/blocks/manifest.json"
    report = {
        "fixed_seconds": options.delay_seconds,
        "per_kchar_seconds": options.delay_per_kchar,
        "transport": "in-process fake, actual wall time; no HTTP network",
        "datasets": {},
    }
    for name, path, page in (("synthetic", fixture, 1), ("SafeVLA", options.safevla_blocks, 4)):
        if path.is_symlink():
            raise ValueError("Use a regular blocks.json fixture")
        document = json.loads(path.read_text())
        report["datasets"][name] = []
        for mode in ("serial", "previous-two", "adaptive-eight"):
            result = measure(document, mode, options.delay_seconds, options.delay_per_kchar, page)
            report["datasets"][name].append(result)
            print(json.dumps({"dataset": name, **result}), flush=True)
            options.output.parent.mkdir(parents=True, exist_ok=True)
            options.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
