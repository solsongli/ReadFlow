"""Local source evidence and an explicit, testable AI boundary.

The production route never invokes a paid or external model. A provider can be
injected by tests to check citation contracts; such responses remain labelled
mock-interface and never count as real model validation.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

MAX_QUERY_CHARS = 2000
MAX_RESULTS = 6
MAX_BLOCKS = 50000
MAX_QUOTE_CHARS = 1200
_STOP = {"a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
         "in", "is", "it", "of", "on", "or", "the", "this", "to", "was", "what",
         "which", "with", "does", "do", "paper", "study"}


class EvidenceError(ValueError):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def _terms(query: str) -> list[str]:
    terms: list[str] = []
    for word in re.findall(r"[a-zA-Z0-9]+|[\u3400-\u9fff]+", query.casefold()):
        if word in _STOP or len(word) < 2:
            continue
        if re.fullmatch(r"[\u3400-\u9fff]+", word) and len(word) > 2:
            terms.extend(word[i:i + 2] for i in range(len(word) - 1))
        else:
            terms.append(word)
    return list(dict.fromkeys(terms))


def find_evidence(store: Any, item_id: str, query: str,
                  attachment_id: str | None = None) -> dict[str, Any]:
    if not isinstance(query, str) or not query.strip() or len(query) > MAX_QUERY_CHARS:
        raise EvidenceError("INVALID_QUERY", "请输入非空问题，长度不超过2000字符。")
    query = query.strip()
    item = store.get_item(item_id)
    if not item:
        raise EvidenceError("ITEM_NOT_FOUND", "文献不存在。", 404)
    attachments = item.get("attachments", [])
    if attachment_id:
        attachments = [a for a in attachments if a["id"] == attachment_id]
        if not attachments:
            raise EvidenceError("ATTACHMENT_SCOPE_MISMATCH", "附件不属于当前文献。", 409)
    terms = _terms(query)
    if not terms:
        raise EvidenceError("QUERY_TOO_SHORT", "请输入能用于原文检索的词语。")
    ranked: list[tuple[float, int, str, str, dict[str, Any]]] = []
    count = 0
    needs_ocr = False
    for attachment in attachments:
        if not attachment.get("available", True):
            continue
        parsed = store.get_pages(attachment["id"])
        needs_ocr = needs_ocr or parsed.get("parse_status") in {"needs_ocr", "partial_needs_ocr"}
        if parsed.get("sha256") != attachment["sha256"]:
            raise EvidenceError("PARSE_HASH_MISMATCH", "解析修订与源PDF哈希不一致，不能提供引用。", 409)
        revision = parsed.get("revision_id")
        if not revision:
            raise EvidenceError("PARSE_REVISION_MISSING", "解析修订缺失，不能提供引用。", 409)
        for page in parsed.get("pages", []):
            page_idx = page.get("page_idx")
            if not isinstance(page_idx, int) or page_idx < 0 or page_idx >= attachment["page_count"]:
                raise EvidenceError("INVALID_PARSE_PAGE", "解析页码越界，不能提供引用。", 409)
            for block in page.get("blocks", []):
                count += 1
                if count > MAX_BLOCKS:
                    raise EvidenceError("EVIDENCE_BUDGET_EXCEEDED", "原文块过多，请选择一个附件后检索。", 413)
                text = block.get("text", "")
                if not isinstance(text, str) or not text.strip():
                    continue
                lower = text.casefold()
                matches = [(term, lower.find(term)) for term in terms if term in lower]
                if not matches:
                    continue
                score = sum(1 + min(lower.count(term), 4) / 4 for term, _ in matches)
                if query.casefold() in lower:
                    score += 4
                # The excerpt is an exact slice of the parsed source block.
                start = max(0, min(pos for _, pos in matches) - 180)
                if len(text) <= MAX_QUOTE_CHARS:
                    start = 0
                quote = text[start:start + MAX_QUOTE_CHARS]
                citation = {
                    "attachment_id": attachment["id"],
                    "sha256": attachment["sha256"],
                    "document_id": attachment["sha256"],
                    "revision_id": revision,
                    "page_idx": page_idx,
                    "page_label": page.get("page_label") or str(page_idx + 1),
                    "block_id": block.get("block_id", ""),
                    "quote": quote,
                    "quote_sha256": hashlib.sha256(quote.encode("utf-8")).hexdigest(),
                    "block_text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                    "bbox": block.get("bbox"),
                    "source_type": "pdf-ocr" if block.get("source") == "ocr" or page.get("text_source") == "ocr" else "pdf-text",
                }
                if not citation["block_id"]:
                    raise EvidenceError("PARSE_BLOCK_ID_MISSING", "原文块身份缺失，不能提供引用。", 409)
                ranked.append((-score, page_idx, attachment["id"], citation["block_id"], citation))
    ranked.sort(key=lambda row: row[:4])
    citations: list[dict[str, Any]] = []
    for row in ranked[:MAX_RESULTS]:
        citations.append({"ref": len(citations) + 1, **row[4]})
    if citations:
        answer = "找到以下原文摘录。它们是检索结果，尚未由模型生成或验证综合结论。"
    elif needs_ocr:
        answer = "未找到可匹配的原文；部分PDF缺少文本，需要OCR后才能做证据问答。"
    elif not attachments:
        answer = "请先关联PDF附件，再检索原文证据。"
    else:
        answer = "在当前文献已解析的原文中未找到匹配依据，请调整关键词。"
    return {"kind": "source-search", "query": query, "answer": answer,
            "citations": citations, "model_verified": False,
            "claim_support_verified": False, "needs_ocr": needs_ocr}


def validate_answer(answer: Any, citations: list[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(answer, str) or not answer.strip() or len(answer) > 50000:
        raise EvidenceError("INVALID_MODEL_ANSWER", "模型回答为空或超过限制。", 502)
    markers = [int(ref) for ref in re.findall(r"\[(\d+)\]", answer)]
    allowed = {c["ref"]: c for c in citations}
    if not markers:
        raise EvidenceError("MODEL_CITATIONS_MISSING", "模型回答未指向可核验的原文依据。", 502)
    if any(ref not in allowed for ref in markers):
        raise EvidenceError("MODEL_CITATION_INVALID", "模型回答引用了不存在的原文编号。", 502)
    refs = list(dict.fromkeys(markers))
    return {"kind": "ai-answer", "answer": answer,
            "citations": [allowed[ref] for ref in refs], "model_verified": False,
            "validation_mode": "mock-interface", "claim_support_verified": False}


def probe_ai_status() -> dict[str, Any]:
    # A harmless fixed-loopback health probe; never read credentials or config files.
    available = False
    try:
        with httpx.Client(timeout=0.6, trust_env=False, follow_redirects=False) as client:
            response = client.get("http://127.0.0.1:41100/healthz")
            if response.status_code == 200:
                value = response.json()
                available = isinstance(value, dict) and value.get("ok") is True
    except (httpx.HTTPError, ValueError):
        pass
    return {
        "status": "not-verified", "model_verified": False,
        "transport_available": available, "configuration": "not-inspected",
        "message": ("检测到现有本机AI服务健康接口；模型配置与真实回答尚未验证。"
                    if available else
                    "当前未检测到现有本机AI服务；本版可使用离线原文证据检索。"),
        "authorization_required": True,
    }


def register_evidence_routes(app: FastAPI, store: Any,
                             ask_provider: Callable[[str, list[dict[str, Any]]], str] | None = None) -> None:
    def failure(exc: EvidenceError) -> JSONResponse:
        return JSONResponse(status_code=exc.status,
                            content={"error": {"code": exc.code, "message": exc.message}})

    async def payload(request: Request) -> dict[str, Any]:
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            raise EvidenceError("JSON_REQUIRED", "此接口需要JSON请求。", 415)
        chunks, length = [], 0
        async for chunk in request.stream():
            length += len(chunk)
            if length > 10000:
                raise EvidenceError("REQUEST_TOO_LARGE", "请求超过大小限制。", 413)
            chunks.append(chunk)
        try:
            value = json.loads(b"".join(chunks))
        except (ValueError, UnicodeDecodeError):
            raise EvidenceError("INVALID_JSON", "JSON格式无效。") from None
        if not isinstance(value, dict):
            raise EvidenceError("INVALID_JSON", "请求必须是JSON对象。")
        return value

    @app.get("/api/research/ai/status")
    def status() -> dict[str, Any]:
        return probe_ai_status()

    @app.post("/api/research/items/{item_id}/evidence")
    async def evidence(item_id: str, request: Request) -> Any:
        try:
            value = await payload(request)
            return find_evidence(store, item_id, value.get("query"), value.get("attachment_id"))
        except EvidenceError as exc:
            return failure(exc)

    @app.post("/api/research/items/{item_id}/ai/ask")
    async def ask(item_id: str, request: Request) -> Any:
        try:
            value = await payload(request)
            # Production defaults to no provider, and cannot be enabled by a browser flag.
            if ask_provider is None:
                raise EvidenceError(
                    "AI_MODEL_NOT_AUTHORIZED",
                    "真实模型尚未获调用授权或验证。可先使用原文证据检索；模型mock不代表真实AI通过。", 503)
            result = find_evidence(store, item_id, value.get("query"), value.get("attachment_id"))
            if not result["citations"]:
                raise EvidenceError("SOURCE_EVIDENCE_MISSING", "没有可供模型引用的原文依据。", 409)
            answer = ask_provider(result["query"], result["citations"])
            return validate_answer(answer, result["citations"])
        except EvidenceError as exc:
            return failure(exc)
