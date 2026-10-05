"""Fake-only QA responses: deterministic defects followed by a strict-retry repair."""
import json
import re


def quality_content(payload, system, model):
    strict = "STRICT_REVIEW" in system
    terms = []
    if "Terminology (user entries take precedence): " in system:
        raw = system.split("Terminology (user entries take precedence): ", 1)[1]
        terms = json.JSONDecoder().raw_decode(raw)[0]
    rows = []
    for block in payload["blocks"]:
        source = block["text"]
        markers = re.findall(r"__RF_[A-Za-z0-9_]+__", source)
        remaining = re.sub(r"__RF_[A-Za-z0-9_]+__", "", source)
        numeric = re.findall(r"(?<![\w.])[-−+]?\d+(?:[.,]\d+)*(?:\s*%)?", remaining)
        text = "研究结果保持准确，所用方法与实验数据一致。" + " ".join(numeric + markers)
        text += "；".join(t["target"] for t in terms)
        if not strict:
            if model == "readflow-qa-untranslated":
                text = source
            elif model == "readflow-qa-citation" and markers:
                text = text.replace(markers[0], "")
            elif model == "readflow-qa-terms":
                for term in terms:
                    text = text.replace(term["target"], "不一致译法")
        rows.append({"id": block["id"], "text": text})
    return json.dumps({"blocks": rows}, ensure_ascii=False)
