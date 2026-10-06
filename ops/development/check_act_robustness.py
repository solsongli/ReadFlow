"""Read-only ACT JSON replay: normalization, cache reuse, term QA and adversarial fake requests."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import threading
from backend.library_mvp.paper_text_normalization import normalized_document
from backend.library_mvp.paper_terms import normalize, candidates
from backend.library_mvp.paper_context import contextualize
from backend.library_mvp.paper_quality import checks, summary
from backend.library_mvp.paper_blocks_labels import translation_units
from backend.library_mvp.paper_blocks_model import cache_key, SKIP
from backend.library_mvp.paper_blocks_translate import translate_blocks
from backend.library_mvp.paper_markers import has_markers
from ops.development.readflow_fake_openai import completion_response


def run(folder, output):
    names = ("blocks.json", "translations.json", "terms.json", "result.json")
    paths = [folder / name for name in names]
    if any(not p.is_file() or any(q.is_symlink() for q in (p, *p.parents)) for p in paths):
        raise ValueError("Explicit regular JSON inputs are required")
    before = [p.read_bytes() for p in paths]
    old, cached, glossary, result = [json.loads(raw) for raw in before]
    doc = normalized_document(old)
    terms = normalize(glossary[result["language"]]["entries"])
    original_terms = glossary[result["language"]]["entries"]
    current = translation_units(doc["blocks"])
    selected = [b for b in current if b["type"] not in SKIP and b["text"].strip()]
    issues, historical = Counter(), Counter()
    reused = 0
    for block in selected:
        key = cache_key(block, result["language"], result["fingerprint"])
        if key in cached:
            reused += 1
            value = cached[key]
            historical.update(value.get("qa", {}).get("issues", []))
            issues.update(checks(block, value, result["language"], terms))
    calls, lock = [], threading.Lock()

    def fake(messages):
        with lock:
            attempt = len(calls)
            calls.append(attempt)
        status, response = completion_response(
            {"model": "readflow-real-variants", "messages": messages}, attempt
        )
        assert status == 200
        return {"content": response["choices"][0]["message"]["content"], "usage": response["usage"]}

    cache = {}
    failed = translate_blocks(
        translation_units(contextualize(doc["blocks"], terms)),
        cache,
        result["language"],
        "fake",
        fake,
        terms,
        lambda: None,
        lambda *_: None,
        lambda _: None,
        quality=True,
        concurrency=2,
    )
    fake_quality = summary(cache.values())
    assert not any(has_markers(value) for value in cache.values())
    assert all(a["id"] == b["id"] for a, b in zip(old["blocks"], doc["blocks"]))
    assert before == [p.read_bytes() for p in paths], "Read-only inputs changed"
    candidate_names = [r["source"] for r in candidates(doc["blocks"])]
    report = {
        "blocks": len(doc["blocks"]),
        "translatable_units": len(selected),
        "cache_reused": reused,
        "ligatures_before": dict(
            Counter(c for b in old["blocks"] for c in b["text"] if "\ufb00" <= c <= "\ufb06")
        ),
        "ligatures_after": sum("\ufb00" <= c <= "\ufb06" for b in doc["blocks"] for c in b["text"]),
        "historical_issues": dict(historical),
        "rechecked_issues": dict(issues),
        "filtered_automatic_terms": len(original_terms) - len(terms),
        "fine_candidate": any(t.lower() == "fine manipulation" for t in candidate_names),
        "fake": {
            "requests": len(calls),
            "failed_blocks": len(failed),
            "qa": fake_quality,
            "internal_markers": 0,
        },
        "originals_unchanged": True,
        "source_sha256": hashlib.sha256(before[0]).hexdigest(),
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    (output / "normalized-blocks.json").write_text(json.dumps(doc, ensure_ascii=False))
    (output / "fake-translations.json").write_text(json.dumps(cache, ensure_ascii=False))
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    run(args.cache_dir, args.output)
