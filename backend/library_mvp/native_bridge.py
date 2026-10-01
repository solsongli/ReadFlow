"""Optional local-only publication bridge to RetainPDF's original Rust library.

This module creates no Rust jobs, writes no legacy SQLite files, and reads no
credentials. The owning launcher supplies the isolated Rust origin and API key.
Registration readiness is a process-local verified cache; opening after a
restart can explicitly revalidate via POST native-reader without reuploading.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import re
import threading
from urllib.parse import urlencode, urlsplit

import httpx

from .store import MAX_PDF_BYTES, Store


class NativeBridgeError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _local_origin(value: str) -> str:
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
                 and parsed.port is not None and 1 <= parsed.port <= 65535
                 and parsed.path in {"", "/"} and not parsed.query and not parsed.fragment
                 and parsed.username is None and parsed.password is None)
    except (TypeError, ValueError):
        valid = False
    if not valid:
        raise NativeBridgeError("NATIVE_LOCAL_ORIGIN_REQUIRED", "原阅读器桥接只允许启动器指定的本机 HTTP 端口。")
    # No hostname lookup or browser-controlled upstream URL.
    return f"http://127.0.0.1:{parsed.port}"


def unavailable(attachment_id: str) -> dict:
    return {"reader_ready": False, "native_document_id": None, "reader_url": None,
            "native_bridge": {"status": "not_configured", "code": "NATIVE_BRIDGE_NOT_CONFIGURED",
                              "message": "本启动入口尚未连接原 RetainPDF 阅读器服务。",
                              "retry_url": f"/api/research/attachments/{attachment_id}/native-reader"}}


class NativeBridge:
    def __init__(self, base_url: str, api_key: str, *, client: httpx.Client | None = None):
        self.base_url = _local_origin(base_url)
        if not isinstance(api_key, str) or not api_key.strip() or len(api_key) > 4096:
            raise NativeBridgeError("NATIVE_API_KEY_REQUIRED", "启动器需要为隔离原服务提供 API 认证配置。")
        try:
            api_key.encode("ascii")
        except UnicodeEncodeError:
            raise NativeBridgeError("NATIVE_API_KEY_INVALID", "本地服务的认证配置格式无效。") from None
        self._headers = {"X-API-Key": api_key}
        self._owns_client = client is None
        self._client = client or httpx.Client(trust_env=False, follow_redirects=False,
                                              timeout=httpx.Timeout(40.0, connect=3.0))
        self._lock = threading.RLock()
        self._states: dict[str, dict] = {}

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def cached(self, attachment: dict) -> dict:
        with self._lock:
            saved = self._states.get(attachment["id"])
            if saved is not None:
                return dict(saved)
        result = unavailable(attachment["id"])
        result["native_bridge"] = {**result["native_bridge"], "status": "unverified",
                                    "code": "NATIVE_READER_NOT_VERIFIED",
                                    "message": "文件已保存；打开原阅读器前需验证本启动器的源 PDF 注册。"}
        return result

    def _status(self, response: httpx.Response, *, missing_allowed: bool = False) -> bool:
        if response.status_code == 404 and missing_allowed:
            return False
        if response.status_code in (401, 403):
            raise NativeBridgeError("NATIVE_AUTH_REJECTED", "原阅读器的本地认证未通过，请检查启动器的隔离服务配置。")
        if 300 <= response.status_code < 400:
            raise NativeBridgeError("NATIVE_REDIRECT_BLOCKED", "原服务返回重定向，桥接已停止以保护本地文件。")
        if not 200 <= response.status_code < 300:
            raise NativeBridgeError("NATIVE_SERVICE_REJECTED", "原服务未接受本次请求，PDF 仍安全保留，可稍后重试。")
        return True

    def _json(self, response: httpx.Response) -> dict:
        if len(response.content) > 2 * 1024 * 1024:
            raise NativeBridgeError("NATIVE_INVALID_RESPONSE", "原服务的响应超出元数据大小限制。")
        try:
            payload = response.json()
        except (ValueError, UnicodeDecodeError):
            raise NativeBridgeError("NATIVE_INVALID_RESPONSE", "原服务未返回可验证的 JSON 结果。") from None
        if not isinstance(payload, dict):
            raise NativeBridgeError("NATIVE_INVALID_RESPONSE", "原服务的响应结构无效。")
        if "code" in payload and payload["code"] != 0:
            raise NativeBridgeError("NATIVE_SERVICE_REJECTED", "原服务报告注册失败，PDF 仍保留在文献管理库中。")
        result = payload.get("data", payload)
        if not isinstance(result, dict):
            raise NativeBridgeError("NATIVE_INVALID_RESPONSE", "原服务缺少文档记录。")
        return result

    def document_jobs(self, sha256: str, *, limit: int = 5) -> list[dict]:
        """Newest-first OCR/translation runs the original service links to this source PDF (read-only)."""
        if not re.fullmatch(r"[0-9a-f]{64}", sha256):
            return []
        response = self._client.get(f"{self.base_url}/api/v1/documents/{sha256}/jobs", params={"limit": limit},
                                    headers=self._headers, follow_redirects=False)
        if not self._status(response, missing_allowed=True):
            return []
        items = self._json(response).get("items", [])
        return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []

    def _document(self, sha256: str) -> dict | None:
        response = self._client.get(f"{self.base_url}/api/v1/documents/{sha256}",
                                    headers=self._headers, follow_redirects=False)
        if not self._status(response, missing_allowed=True):
            return None
        record = self._json(response)
        if record.get("document_id") != sha256:
            raise NativeBridgeError("NATIVE_IDENTITY_MISMATCH", "原服务的文档身份与本地 PDF SHA256 不一致。")
        return record

    def _verify_source(self, attachment: dict, expected_size: int) -> None:
        sha256, digest, size = attachment["sha256"], hashlib.sha256(), 0
        with self._client.stream("GET", f"{self.base_url}/api/v1/documents/{sha256}/source.pdf",
                                 headers=self._headers, follow_redirects=False) as response:
            if not self._status(response, missing_allowed=True):
                raise NativeBridgeError("NATIVE_SOURCE_MISSING", "原服务尚无可读取的源 PDF。")
            for chunk in response.iter_bytes(chunk_size=65536):
                size += len(chunk)
                if size > MAX_PDF_BYTES or size > expected_size:
                    raise NativeBridgeError("NATIVE_SOURCE_HASH_MISMATCH", "原阅读器的源 PDF 字节与文献管理库不一致。")
                digest.update(chunk)
        if size != expected_size or digest.hexdigest() != sha256:
            raise NativeBridgeError("NATIVE_SOURCE_HASH_MISMATCH",
                                    "原阅读器的源 PDF 校验未通过，可能已修复或修改；未将它标为可阅读。")

    def register(self, store: Store, attachment_id: str) -> dict:
        """Idempotently verify or publish this attachment into the isolated Rust API.

        Expected upstream/transport failures are data, not deletion or rollback
        of the successfully saved Store PDF. Source mismatches never overwrite
        an existing Rust document or reset its real active job/version.
        """
        with self._lock:
            attachment = store.get_attachment(attachment_id)
            if not re.fullmatch(r"[0-9a-f]{64}", attachment["sha256"]):
                raise NativeBridgeError("NATIVE_IDENTITY_MISMATCH", "PDF SHA256 身份格式无效。")
            # Store validates the immutable local blob before supplying a path.
            raw = store.attachment_path(attachment_id).read_bytes()
            result = unavailable(attachment_id)
            try:
                document = self._document(attachment["sha256"])
                publish = document is None
                if document is not None:
                    try:
                        self._verify_source(attachment, len(raw))
                    except NativeBridgeError as exc:
                        if exc.code != "NATIVE_SOURCE_MISSING":
                            raise
                        publish = True
                if publish:
                    filename = attachment["filename"]
                    if not filename.lower().endswith(".pdf"):
                        filename += ".pdf"
                    # Original POST /uploads already publishes a source-only
                    # document. It does not consume a library_only switch.
                    response = self._client.post(f"{self.base_url}/api/v1/uploads",
                                                 headers=self._headers,
                                                 files={"file": (filename, raw, "application/pdf")},
                                                 follow_redirects=False)
                    self._status(response)
                    upload = self._json(response)
                    if upload.get("document_id") != attachment["sha256"]:
                        raise NativeBridgeError("NATIVE_IDENTITY_MISMATCH", "原服务返回的上传身份与源 PDF 不一致。")
                    document = self._document(attachment["sha256"])
                    if document is None:
                        raise NativeBridgeError("NATIVE_DOCUMENT_MISSING", "原服务尚未公布上传文档，可重试注册。")
                    self._verify_source(attachment, len(raw))
                if document.get("page_count") is not None and document["page_count"] != attachment["page_count"]:
                    raise NativeBridgeError("NATIVE_PAGE_COUNT_MISMATCH", "原服务的 PDF 页数与本地附件不一致。")
                sha256 = attachment["sha256"]
                reader_query = urlencode({"document_id": sha256, "research_item_id": attachment["item_id"],
                                          "attachment_id": attachment_id})
                result = {"reader_ready": True, "native_document_id": sha256,
                          "reader_url": "/reader.html?" + reader_query,
                          "native_bridge": {"status": "ready", "verified_sha256": sha256,
                                            "verified_at": datetime.now(timezone.utc).isoformat(),
                                            "retry_url": f"/api/research/attachments/{attachment_id}/native-reader"}}
            except NativeBridgeError as exc:
                result["native_bridge"] = {"status": "partial_failure", "code": exc.code, "message": str(exc),
                                          "retry_url": f"/api/research/attachments/{attachment_id}/native-reader"}
            except httpx.RequestError:
                result["native_bridge"] = {"status": "partial_failure", "code": "NATIVE_SERVICE_UNAVAILABLE",
                                          "message": "暂时无法连接本启动器的原阅读器服务；PDF 已保存，可重试。",
                                          "retry_url": f"/api/research/attachments/{attachment_id}/native-reader"}
            self._states[attachment_id] = result
            return dict(result)
