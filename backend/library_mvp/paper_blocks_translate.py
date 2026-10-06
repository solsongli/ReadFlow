"""ID-addressed batch translation, strict protected-span validation and selective retry."""
import json
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from .paper_blocks_inline import restore_rich, rich_text
from .paper_blocks_model import protect, cache_key, SKIP
from .paper_blocks_batches import batches, estimate_tokens, planned_batches
from .paper_context import protected_text
from .paper_terms import relevant
from .paper_quality import checks
from .paper_markers import has_markers


def parse_response(raw, structured=False, strict=False):
    from .paper_json import read_payload, records, ModelJSONError

    try:
        rows = records(read_payload(raw, "blocks"), "blocks")
        output, duplicate = {}, set()
        for row in rows:
            identity = row.get("id")
            if isinstance(identity, bool) or not isinstance(identity, (str, int, float)):
                continue
            if isinstance(identity, float):
                if not identity.is_integer():
                    continue
                identity = int(identity)
            identity = str(identity)
            if identity in output:
                duplicate.add(identity)
            output[identity] = {**row, "id": identity} if structured else row.get("text")
        result = {key: val for key, val in output.items() if key not in duplicate}
        if strict and not result:
            raise ModelJSONError("No usable block records")
        return result
    except (ValueError, TypeError, AttributeError):
        if strict:
            raise ModelJSONError("No usable block JSON") from None
        return {}


def translate_blocks(
    blocks,
    cache,
    language,
    fingerprint,
    call,
    terms,
    check,
    progress,
    save,
    force=False,
    clean=lambda value: value,
    title="",
    concurrency=4,
    plan=planned_batches,
    quality=False,
    diagnose=lambda *_: None,
    abort=lambda: None,
):
    selected = [b for b in blocks if b["type"] not in SKIP and b["text"].strip()]

    def missing_value(block):
        value = cache.get(cache_key(block, language, fingerprint))
        return not rich_text(value) or isinstance(value, dict) and bool((value.get("qa") or {}).get("failure"))

    missing = [b for b in selected if force or missing_value(b)]
    completed = len(selected) - len(missing)
    errors = []

    from collections import deque
    from .paper_prompts import messages_for
    from .paper_blocks_inline import source_runs

    def request(group, review):
        check()
        messages, maps = messages_for(group, terms, language, title, review)
        from .paper_diagnostics import annotate

        try:
            response = call(messages)
        except Exception as error:
            check()
            raise annotate(error, "qa_retry" if review else "batch")
        if isinstance(response, dict) and response.get("finish_reason") == "length" and len(group) > 1:
            return None, None  # Scheduler splits it; no serial recursion holds a worker.
        raw = response.get("content", "") if isinstance(response, dict) else response
        try:
            parsed = parse_response(raw, structured=True, strict=True)
        except Exception as error:
            raise annotate(error, "parse")
        values, reasons = {}, {}
        for block in group:
            raw_row = parsed.get(block["id"], {})
            raw_value = raw_row.get("text")
            from .paper_translation_response import restore_fields

            values[block["id"]] = restore_fields(block, raw_row, maps[block["id"]])
            if values[block["id"]] is None:
                from .paper_json import ModelJSONError

                problem = ModelJSONError("Block record could not be restored")
                if isinstance(response, dict):
                    problem.http_status = response.get("http_status")
                diagnose(problem, "parse")
                reasons[block["id"]] = (
                    "truncated"
                    if isinstance(response, dict) and response.get("finish_reason") == "length"
                    else "missing_id"
                    if raw_value is None
                    else "unresolved_marker"
                    if has_markers(raw_row) or has_markers(raw_row.get("head"))
                    else "invalid_placeholder"
                )
        return values, reasons

    main = deque((group, None, 0) for group in plan(missing, max(1, min(16, concurrency)), title, terms))
    retries = deque()
    concurrency = max(1, min(16, concurrency))
    progress(completed, len(selected))
    with ThreadPoolExecutor(max_workers=concurrency, thread_name_prefix="readflow-block-batch") as pool:
        pending = {}
        while main or retries or pending:
            check()
            qa_running = sum(review is not None for _, review, _ in pending.values())
            while len(pending) < concurrency and (main or retries):
                if retries and (not main or qa_running < max(1, concurrency // 3)):
                    entries, tokens = [], 0
                    while retries and len(entries) < 4:
                        size = estimate_tokens(retries[0][0]["text"])
                        if entries and tokens + size > 1600:
                            break
                        entries.append(retries.popleft())
                        tokens += size
                    group = [b for b, _ in entries]
                    review = {b["id"]: issues for b, issues in entries}
                    qa_running += 1
                    attempt = 0
                else:
                    group, review, attempt = main.popleft()
                pending[pool.submit(request, group, review)] = (group, review, attempt)
            finished, _ = wait(pending, timeout=0.05, return_when=FIRST_COMPLETED)
            patches = []
            for future in finished:
                patch = {}
                group, review, attempt = pending.pop(future)
                failed_request = False
                try:
                    values, reasons = future.result()
                except Exception as error:
                    check()
                    from .paper_diagnostics import global_failure

                    diagnose(error, "qa_retry" if review else "batch")
                    if global_failure(error):
                        abort()
                        raise
                    if attempt < 2:
                        size = max(1, len(group) // 2)
                        for offset in range(0, len(group), size):
                            main.appendleft((group[offset : offset + size], review, attempt + 1))
                        continue
                    failed_request = True
                    values = {b["id"]: None for b in group}
                    reasons = {b["id"]: "request_failed" for b in group}
                if values is None:
                    middle = len(group) // 2
                    # These are format/length subdivisions, not another quality retry.
                    main.appendleft((group[middle:], review, attempt))
                    main.appendleft((group[:middle], review, attempt))
                    continue
                for block in group:
                    translated = values.get(block["id"])
                    issues = (
                        checks(block, translated, language, terms)
                        if quality
                        else (["placeholders"] if translated is None else [])
                    )
                    if reasons.get(block["id"]) == "unresolved_marker":
                        issues = list(dict.fromkeys([*issues, "internal_markers"]))
                    if issues and review is None and not failed_request:
                        retries.append((block, issues))
                        continue
                    if translated is None:
                        errors.append(block["id"])
                        if quality:
                            translated = {"text": block["text"], "runs": source_runs(block)}
                    if translated is not None:
                        patch[cache_key(block, language, fingerprint)] = {
                            "text": clean(translated["text"]),
                            "runs": [{**run, "text": clean(run["text"])} for run in translated["runs"]],
                            **(
                                {
                                    "qa": {
                                        "issues": issues,
                                        "retried": review is not None,
                                        **(
                                            {"failure": reasons[block["id"]]}
                                            if block["id"] in reasons
                                            else {}
                                        ),
                                    }
                                }
                                if quality
                                else {}
                            ),
                        }
                    completed += 1
                if patch:
                    patches.append(patch)
            check()
            for patch in patches:
                save(patch)
                cache.update(patch)
            progress(completed, len(selected))
    return errors
