"""Standard-library fake model variants. No upstream I/O or credential handling."""
import json
import re


def punctuate(raw):
    table = str.maketrans("{}[]:,", "｛｝［］：，")
    quote, escaped, output = False, False, []
    for char in raw:
        output.append(char if quote else char.translate(table))
        if escaped:
            escaped = False
        elif quote and char == "\\":
            escaped = True
        elif char == '"':
            quote = not quote
    return "".join(output)


def occurs(term, source):
    parts = re.split(r"[\s‐‑–—-]+", term)
    last = parts.pop()
    if re.search(r"[^aeiou]ies$", last, re.I):
        last = last[:-3] + "y"
    elif len(last) > 3 and last.lower().endswith("s") and not last.lower().endswith(("ss", "us", "is")):
        last = last[:-1]
    ending = (
        re.escape(last[:-1]) + "(?:y|ies)" if re.search(r"[^aeiou]y$", last, re.I) else re.escape(last) + "s?"
    )
    pattern = r"[\s‐‑–—-]+".join([*map(re.escape, parts), ending])
    return bool(re.search(r"(?<![A-Za-z0-9_])" + pattern + r"(?![A-Za-z0-9_])", source, re.I))


def response(body, attempt):
    user = next(
        (m.get("content", "") for m in reversed(body.get("messages", [])) if m.get("role") == "user"), ""
    )
    system = "\n".join(m.get("content", "") for m in body.get("messages", []) if m.get("role") == "system")
    try:
        payload = json.loads(user)
    except (ValueError, TypeError):
        return None
    if not isinstance(payload, dict) or not ("blocks" in payload or "terms" in payload):
        return None
    if body.get("model") == "readflow-real-faults" and "terms" in payload:
        return 503, {"error": {"code": "server_error", "message": "Temporary fake failure"}}
    if "terms" in payload:
        terms = {
            r["source"]: {
                "TARGET": r["source"]
                if r.get("keep")
                else "精细操作"
                if r["source"].lower() == "fine manipulation"
                else "示例术语",
                "confidence": 1,
            }
            for r in payload["terms"]
        }
        content = "以下是结果：\n```JSON\n" + json.dumps({"TERMS": terms}, ensure_ascii=False) + "\n```\n完毕。"
    else:
        terms = []
        if "Terminology (user entries take precedence): " in system:
            terms = json.JSONDecoder().raw_decode(
                system.split("Terminology (user entries take precedence): ", 1)[1]
            )[0]

        def translated(source, head=False):
            saved = []

            def reserve(value):
                saved.append(value)
                return chr(0xE000 + len(saved) - 1)

            text = re.sub(r"__RF_[A-Za-z0-9_]+__|https?://[^\s]+|`[^`]+`", lambda m: reserve(m[0]), source)
            for keep in sorted(payload.get("keep", []), key=len, reverse=True):
                parts = re.split(r"[\s‐‑–—-]+", keep)
                last = parts.pop()
                ending = (
                    re.escape(last[:-1]) + "(?:y|ies)"
                    if re.search(r"[^aeiou]y$", last, re.I)
                    else re.escape(last) + "s?"
                )
                pattern = r"[\s‐‑–—-]+".join([*map(re.escape, parts), ending])
                text = re.sub(
                    r"(?<![A-Za-z0-9_])" + pattern + r"(?![A-Za-z0-9_])",
                    lambda m: reserve(m[0]),
                    text,
                    flags=re.I,
                )
            for term in terms:
                source_term = term["source"]
                text = re.sub(
                    r"(?<![A-Za-z0-9_])" + re.escape(source_term) + r"(?![A-Za-z0-9_])",
                    lambda _: reserve(term["target"]),
                    text,
                    flags=re.I,
                )
            text = re.sub(
                r"(?<![A-Za-z0-9_.])[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?:[eE][-+]?\d+)?(?:\s*(?:billion\b|million\b|thousand\b|[BMk](?![A-Za-z])))?(?:\s*%)?",
                lambda m: reserve(m[0]),
                text.replace("−", "-"),
            )
            # Keep numeric operators and protected spans in their original positions.
            # This is deliberately fake prose, not an accuracy sample.
            text = re.sub(r"(?<![A-Za-z0-9_])[A-Za-z]+(?![A-Za-z0-9_])", "任务" if head else "研究", text)
            for index, literal in enumerate(saved):
                text = text.replace(chr(0xE000 + index), literal)
            if "STRICT_REVIEW" in system:
                text += "；" + "；".join(
                    t["target"] for t in terms if re.search(r"[\u3400-\u9fff]", t["target"])
                )
            return text

        rows = [
            {
                "id": r["id"],
                "text": translated(r["text"]),
                **({"head": translated(r["head"], True)} if r.get("head") else {}),
            }
            for r in payload["blocks"]
        ]
        mode = attempt % 7
        if mode in (1, 2, 5):
            for row in rows:
                if "head" in row:
                    row["text"] = row["head"] + " " + row["text"]
                    if mode == 1:
                        row["head"] = None
                    elif mode == 2:
                        row.pop("head")
                    else:
                        row["head"] = ""
                if str(row["id"]).isdigit():
                    row["id"] = int(row["id"])
        if mode == 0:
            result = {
                "BLOCKS": {
                    str(r["id"]): {"TEXT": r["text"], **({"HEAD": r["head"]} if "head" in r else {})}
                    for r in rows
                }
            }
        elif mode == 5:
            result = {"blocks": {str(r["id"]): r["text"] for r in rows}}
        else:
            result = {"blocks": rows, "extra": "Ignored explanatory field"}
        content = json.dumps(result, ensure_ascii=False)
        if mode == 3:
            content = punctuate(content)
        if mode == 4 and len(rows) > 1 and "STRICT_REVIEW" not in system:
            content = (
                json.dumps({"blocks": rows[:-1]}, ensure_ascii=False)[:-2]
                + ',{"id":"unfinished","text":"partial'
            )
        if mode == 0:
            content = "说明：\n```json\n" + content + "\n```\n结束。"
    usage = {"prompt_tokens": max(1, len(user) // 4), "completion_tokens": max(1, len(content) // 2)}
    usage["total_tokens"] = sum(usage.values())
    return 200, {"choices": [{"message": {"content": content}, "finish_reason": "stop"}], "usage": usage}
