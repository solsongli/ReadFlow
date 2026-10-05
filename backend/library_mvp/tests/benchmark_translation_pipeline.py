"""In-process delayed fake: replay output lengths and QA incidence, never real model contents.

The prompt token counter is the same deterministic estimator in all arms, not a
DeepSeek tokenizer. Real accuracy is tested separately; QA verdict replay here
isolates scheduling while preserving the observed retry load.
"""
import argparse
import asyncio
import importlib.util
import json
from pathlib import Path
import re
import time
from unittest.mock import patch
import httpx
from backend.library_mvp.ai_runtime import RequestControl
from backend.library_mvp.paper_blocks_model import SKIP, cache_key
from backend.library_mvp.paper_blocks_labels import translation_units
from backend.library_mvp.paper_context import contextualize
from backend.library_mvp.paper_blocks_transport import run_batch
from backend.library_mvp.translation_speed import TranslationPolicy
from backend.library_mvp.translation_metrics import TranslationMetrics
from backend.library_mvp.paper_blocks_batches import estimate_tokens, planned_batches
from backend.library_mvp import paper_blocks_translate, paper_prompts
from backend.library_mvp.tests.translation_delay_fixture import (
    legacy_messages,
    legacy_plan,
    synthetic_dataset,
)


def load_dataset(root):
    names = ("blocks.json", "translations.json", "result.json", "terms.json")
    paths = [root / name for name in names]
    if any(p.is_symlink() or not p.is_file() for p in paths):
        raise ValueError("Explicit regular JSON files are required")
    document, cache, result, terms = (json.loads(p.read_text()) for p in paths)
    section, contextual = "", []
    for b in document["blocks"]:
        if b["type"] == "heading":
            section = b["text"][:250]
        contextual.append({**b, "section": section})
    blocks = translation_units(contextual)
    lengths, retry, review = {}, set(), set()
    for b in blocks:
        v = cache.get(cache_key(b, "zh-CN", result["fingerprint"]), {})
        lengths[b["id"]] = len(v.get("text", b["text"]))
        if v.get("qa", {}).get("retried"):
            retry.add(b["id"])
        if v.get("qa", {}).get("issues"):
            review.add(b["id"])
    return {
        "blocks": blocks,
        "document_blocks": document["blocks"],
        "outputs": lengths,
        "retry": retry,
        "review": review,
        "fallback": set(result.get("translation_fallback", [])),
        "terms": terms.get("zh-CN", {}).get("entries", []),
        "title": next((b["text"] for b in blocks if b["type"] == "title"), ""),
    }


def measure(dataset, mode="new", scale=1, before_root=None):
    engine, plan, quality, concurrency = paper_blocks_translate, planned_batches, mode != "legacy", 16
    if mode == "legacy":
        plan, concurrency = legacy_plan, 8
    if mode == "before":

        def load(name, file):
            spec = importlib.util.spec_from_file_location("backend.library_mvp." + name, before_root / file)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module

        engine = load("_timing_before", "translate-before.py")
        plan = load("_batches_before", "batches-before.py").planned_batches
    policy, metrics = TranslationPolicy(), TranslationMetrics()
    config = {
        "base_url": "https://api.deepseek.com/v1",
        "model": "fake-delayed",
        "api_key": "fixture-only",
        "workers": 8,
    }
    first, main_finished = None, 0
    overlap = False
    records = []
    if quality and dataset.get("document_blocks"):
        blocks = translation_units(contextualize(dataset["document_blocks"], dataset["terms"]))
    elif quality:
        blocks = contextualize(dataset["blocks"], dataset["terms"])
        for b, original in zip(blocks, dataset["blocks"]):
            b["section"] = original.get("section", b["section"])
            if b["type"] == "figure_text":
                for key in ("previous_sentence", "first_terms", "lead"):
                    b.pop(key, None)
    else:
        blocks = dataset["blocks"]

    async def fake(request):
        nonlocal main_finished, overlap
        body = json.loads(request.content)
        messages = body["messages"]
        payload = json.loads(messages[-1]["content"])
        strict = "STRICT_REVIEW" in messages[0]["content"]
        if "terms" in payload:
            content = json.dumps(
                {"terms": [{"source": t["source"], "target": t["target"]} for t in dataset["terms"]]},
                ensure_ascii=False,
            )
        else:
            rows = []
            if strict and main_finished < len([b for b in blocks if b["type"] not in SKIP]):
                overlap = True
            for row in payload["blocks"]:
                if quality and row["id"] in dataset["fallback"]:
                    continue
                markers = re.findall(r"__RF_[A-Za-z0-9_]+__", row["text"])
                text = ("复" if strict else "译") + "文" * max(
                    1, dataset["outputs"][row["id"]] - sum(map(len, markers))
                )
                rows.append({"id": row["id"], "text": text + "".join(markers)})
            content = json.dumps({"blocks": rows}, ensure_ascii=False, separators=(",", ":"))
        prompt = estimate_tokens("".join(m["content"] for m in messages))
        await asyncio.sleep(scale * (1.5 + len(content) / 1000 * 0.5))
        if not strict:
            main_finished += len(payload.get("blocks", []))
        records.append({"strict": strict, "blocks": len(payload.get("blocks", [])), "prompt": prompt})
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": content}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": prompt, "completion_tokens": estimate_tokens(content)},
            },
        )

    def call(messages):
        control = RequestControl(120)
        phase = (
            "qa_retranslation"
            if "STRICT_REVIEW" in messages[0]["content"]
            else (
                "terminology" if messages[0]["content"].startswith("READFLOW_PAPER_TERMS") else "main_batches"
            )
        )
        control.translation_metrics, control.translation_phase = metrics, phase
        try:
            with metrics.batch(phase, estimate_tokens("".join(m["content"] for m in messages))):
                return run_batch(
                    config, messages, policy=policy, control=control, transport=httpx.MockTransport(fake)
                )
        finally:
            control.finish()

    def assess(block, value, *_):
        if value is None:
            return ["placeholders"]
        strict = value["text"].startswith("复")
        return ["numbers"] if block["id"] in (dataset["review"] if strict else dataset["retry"]) else []

    def save(delta):
        nonlocal first
        first = first if first is not None else time.perf_counter() - started

    started = time.perf_counter()
    cache = {}
    with patch.object(engine, "checks", assess):
        if quality:
            call(
                [
                    {"role": "system", "content": "READFLOW_PAPER_TERMS"},
                    {"role": "user", "content": json.dumps({"terms": dataset["terms"]}, ensure_ascii=False)},
                ]
            )
        with patch.object(
            paper_prompts, "messages_for", legacy_messages if mode == "legacy" else paper_prompts.messages_for
        ):
            failed = engine.translate_blocks(
                blocks,
                cache,
                "zh-CN",
                "benchmark",
                call,
                dataset["terms"] if quality else [],
                lambda: None,
                lambda *_: None,
                save,
                title=dataset["title"],
                concurrency=concurrency,
                plan=plan,
                quality=quality,
            )
    wall = time.perf_counter() - started
    assert set(failed) == (dataset["fallback"] if quality else set())
    assert len(cache) == len([b for b in blocks if b["type"] not in SKIP and b["text"].strip()])
    return {
        "mode": mode,
        "wall_seconds": round(wall, 3),
        "first_batch_seconds": round(first or 0, 3),
        "estimated_prompt_tokens": sum(r["prompt"] for r in records),
        "strict_batches": [r["blocks"] for r in records if r["strict"]],
        "qa_pipeline_overlap": overlap,
        "performance": metrics.snapshot(),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--directory", type=Path)
    p.add_argument("--before-root", type=Path)
    p.add_argument("--scale", type=float, default=1)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    dataset = load_dataset(args.directory) if args.directory else synthetic_dataset()
    output = []
    for mode in ["legacy", "before", "new"] if args.before_root else ["legacy", "new"]:
        result = measure(dataset, mode, args.scale, args.before_root)
        output.append(result)
        print(json.dumps(result), flush=True)
        args.output.write_text(json.dumps(output, indent=2) + "\n")
    assert output[-1]["wall_seconds"] <= output[0]["wall_seconds"] * 1.2
    assert output[-1]["estimated_prompt_tokens"] <= output[0]["estimated_prompt_tokens"] * 1.3


if __name__ == "__main__":
    main()
