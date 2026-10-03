#!/usr/bin/env python3
"""Offline packaged Linux smoke: real OCR/translation/render workers, local fixtures.

Run with the extracted package's Python while its desktop instance is running:
  backend/python/bin/python3 smoke-linux-translation.py --gateway URL --work-dir DIR
No external OCR/model endpoint or user credentials are used.
"""
from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shlex
import sys
import threading
import time
import unicodedata

import fitz
import requests

TEXTS = [
    ("The copper catalyst remains stable throughout the entire experiment.",
     "铜催化剂在整个实验过程中始终保持稳定。"),
    ("The measured energy follows the relation $E=mc^2$ in this experiment.",
     "本实验中测得的能量遵循关系 $E=mc^2$。"),
    ("The aqueous sample was heated under constant pressure.",
     "水溶液样品在恒定压力下加热。"),
    ("The final solution appeared clear after the filtration procedure.",
     "经过过滤操作后，最终溶液呈现澄清状态。"),
    ("The control experiment confirmed the reported chemical stability.",
     "对照实验证实了所报告的化学稳定性。"),
    ("The results demonstrate that the method preserves the document layout.",
     "结果表明，该方法保留了文档的版面布局。"),
]


def ocr_fixture():
    """A local command provider supplies genuine extracted PDF text/geometry."""
    source = fitz.open(os.environ["RETAIN_OCR_SOURCE_PDF"])
    pages = []
    for page in source:
        blocks = []
        for block in page.get_text("blocks"):
            if block[6] != 0:
                continue
            text = " ".join(block[4].split())
            blocks.append({"type": "text", "sub_type": "body", "text": text,
                           "bbox": list(block[:4])})
        pages.append({"width": page.rect.width, "height": page.rect.height,
                      "unit": "pt", "blocks": blocks})
    payload = {"provider": "generic_flat_ocr", "pages": pages}
    Path(os.environ["RETAIN_OCR_RAW_PAYLOAD_JSON"]).write_text(json.dumps(payload), encoding="utf-8")
    print(f"offline_ocr_extracted_pages={len(pages)}", flush=True)


def create_source(destination):
    doc = fitz.open()
    for page_index in range(2):
        page = doc.new_page(width=600, height=800)
        for index, (source, _) in enumerate(TEXTS[page_index * 3:page_index * 3 + 3]):
            box = fitz.Rect(48, 64 + index * 170, 552, 144 + index * 170)
            remaining = page.insert_textbox(box, source, fontsize=13, fontname="helv", color=(0.1, 0.15, 0.2))
            assert remaining >= 0, "source text does not fit the fixture"
        # This vector diagram must survive background text removal/compositing.
        page.draw_rect(fitz.Rect(48, 620, 552, 714), color=(0.2, 0.5, 0.7), width=2)
        page.draw_line(fitz.Point(70, 686), fitz.Point(530, 650), color=(0.2, 0.5, 0.7), width=2)
    doc.save(destination)
    doc.close()


def answer(messages):
    user = messages[-1]["content"]
    try:
        payload = json.loads(user)
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    translations = dict(TEXTS)
    if "preview_text" in payload:
        return json.dumps({"domain": "chemistry", "summary": "Offline scientific PDF fixture",
                           "translation_guidance": "Translate into Chinese; preserve math."})
    if "pairs" in payload:
        return json.dumps({"decisions": [{"pair_id": pair["pair_id"], "decision": "break"}
                                        for pair in payload["pairs"]]})
    if "group" in payload:
        return json.dumps({"member_translations": [
            {"item_id": item["item_id"], "translated_text": translations[item["source_text"]]}
            for item in payload["group"]["members"]]}, ensure_ascii=False)
    if {"source_text", "issues", "current_translation"} <= payload.keys():
        return json.dumps({"repaired_text": translations[payload["source_text"]],
                           "applied_issue_kinds": [item["kind"] for item in payload["issues"]],
                           "confidence": 1, "needs_manual_review": False, "notes": ""}, ensure_ascii=False)
    members = re.findall(r"^原文 (p\d+-b\d+):\n([^\n]+)", user, re.M)
    if members:
        return "\n".join(f"<<<ITEM item_id={key}>>>\n{translations[source.strip()]}\n<<<END>>>"
                         for key, source in members)
    if "【当前原文开始】" in user:
        source = user.split("【当前原文开始】", 1)[1].split("【当前原文结束】", 1)[0].strip()
    else:
        source = payload.get("source_text", user.strip())
    if source in translations:
        return translations[source]
    raise ValueError("Unexpected offline model protocol: " + user[:200])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ocr", action="store_true")
    parser.add_argument("--gateway", default="http://127.0.0.1:40001")
    parser.add_argument("--work-dir", type=Path)
    args = parser.parse_args()
    if args.ocr:
        ocr_fixture()
        return
    if args.work_dir is None:
        parser.error("--work-dir is required")
    root = args.work_dir.resolve()
    root.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.trust_env = False
    startup_deadline = time.monotonic() + 90
    while True:
        try:
            page = session.get(args.gateway + "/workbench.html", timeout=5)
            break
        except requests.ConnectionError:
            if time.monotonic() >= startup_deadline:
                raise
            time.sleep(0.5)
    page.raise_for_status()
    marker = "window.__FRONT_RUNTIME_CONFIG__=Object.assign({},window.__FRONT_RUNTIME_CONFIG__||{},"
    config, _ = json.JSONDecoder().raw_decode(page.text.split(marker, 1)[1])
    api_base = config["apiBase"]
    session.headers["X-API-Key"] = config["xApiKey"]

    def api(method, endpoint, **kwargs):
        response = session.request(method, api_base + endpoint, timeout=30, **kwargs)
        if not response.ok:
            raise RuntimeError(f"{method} {endpoint}: {response.status_code} {response.text[:1000]}")
        data = response.json()
        if data.get("code", 0) != 0:
            raise RuntimeError(f"{method} {endpoint}: {data}")
        return data.get("data", data)

    source = root / "offline-input.pdf"
    create_source(source)
    calls = []
    failures = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *unused):
            pass

        def do_POST(self):
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            try:
                content = answer(payload["messages"])
                calls.append({"path": self.path, "model": payload.get("model"),
                              "message_count": len(payload["messages"])})
                response = {"id": "offline-fixture", "object": "chat.completion",
                            "model": payload.get("model"), "choices": [
                                {"index": 0, "message": {"role": "assistant", "content": content},
                                 "finish_reason": "stop"}],
                            "usage": {"prompt_tokens": 20, "completion_tokens": 20, "total_tokens": 40}}
                status = 200
            except Exception as exc:
                failures.append(str(exc))
                response, status = {"error": {"message": str(exc)}}, 400
            if status == 200 and payload.get("stream"):
                chunk = {"id": "offline-fixture", "choices": [
                    {"index": 0, "delta": {"content": content}, "finish_reason": None}]}
                ending = {"id": "offline-fixture", "choices": [
                    {"index": 0, "delta": {}, "finish_reason": "stop"}], "usage": response["usage"]}
                encoded = ("data: " + json.dumps(chunk, ensure_ascii=False) + "\n\n"
                           + "data: " + json.dumps(ending) + "\n\n"
                           + "data: [DONE]\n\n").encode()
                content_type = "text/event-stream"
            else:
                encoded = json.dumps(response, ensure_ascii=False).encode()
                content_type = "application/json"
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        vault = api("GET", "/api/v1/credentials")
        credential = next((item for item in vault["credentials"] if item["label"] == "Offline fixture only"), None)
        if credential is None:
            credential = api("POST", "/api/v1/credentials", json={
                "kind": "translation_api_key", "provider": "openai_compatible",
                "label": "Offline fixture only", "secret": "offline-fixture-only",
                "expected_revision": vault["revision"]})["credential"]
        ref = credential["credential_ref"]
        with source.open("rb") as stream:
            upload = api("POST", "/api/v1/uploads", files={"file": (source.name, stream, "application/pdf")})
        model_base = f"http://127.0.0.1:{server.server_port}/v1"
        job = api("POST", "/api/v1/jobs", json={
            "workflow": "book", "source": {"upload_id": upload["upload_id"]},
            "ocr": {"provider": "local", "options": {"command": shlex.join([
                sys.executable, str(Path(__file__).resolve()), "--ocr"])}},
            "translation": {"mode": "fast", "math_mode": "direct_typst", "workers": 1, "batch_size": 1,
                            "credential_ref": ref, "model": "offline-fixture", "base_url": model_base,
                            "context_mode": "off", "memory_mode": "off",
                            "glossary_mode": "off"},
            "render": {"render_mode": "typst", "compile_workers": 1},
            "runtime": {"timeout_seconds": 180, "no_output_timeout_seconds": 90}})
        job_id = job["job_id"]
        print(f"offline_job={job_id}", flush=True)
        last_stage = None
        deadline = time.monotonic() + 200
        while time.monotonic() < deadline:
            job = api("GET", f"/api/v1/jobs/{job_id}")
            stage = (job.get("status"), job.get("stage"))
            if stage != last_stage:
                print(f"job_status={stage}", flush=True)
                last_stage = stage
            if job["status"] in {"succeeded", "failed", "canceled"}:
                break
            time.sleep(0.5)
        (root / "job-result.json").write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
        (root / "model-calls.json").write_text(json.dumps({"calls": calls, "failures": failures}, indent=2))
        assert job["status"] == "succeeded", f"PDF job failed: {job.get('error')} (see job-result.json)"
        assert calls and not failures, "Expected successful requests to the local model fixture"
        response = session.get(api_base + f"/api/v1/jobs/{job_id}/pdf", timeout=60)
        response.raise_for_status()
        translated = root / "offline-translated.pdf"
        translated.write_bytes(response.content)
        doc = fitz.open(translated)
        assert len(doc) == 2, f"Unexpected page count: {len(doc)}"
        text = "".join(page.get_text() for page in doc)
        for _, target in TEXTS:
            expected = target.split("$", 1)[0].strip()
            assert expected in text, f"Missing translated PDF text: {expected}"
        normalized_text = re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))
        assert normalized_text.count("E=mc2") == 1, "Inline formula changed or was duplicated"
        assert all(page.rect == fitz.Rect(0, 0, 600, 800) for page in doc), "Page geometry changed"
        assert all(page.get_drawings() for page in doc), "Source vector diagrams were lost"
        doc.close()
        report = {"status": "passed", "verification": "offline end-to-end; local command OCR and local HTTP model fixture",
                  "job_id": job_id, "python": sys.version.split()[0], "pages": 2, "translated_paragraphs": len(TEXTS),
                  "model_http_requests": len(calls), "pdf_download_status": response.status_code,
                  "page_geometry_preserved": True, "vector_diagrams_preserved": True,
                  "inline_formula_preserved": True,
                  "source_pdf": str(source), "translated_pdf": str(translated)}
        (root / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report, ensure_ascii=False), flush=True)
    finally:
        server.shutdown()
        server.server_close()
        session.close()


if __name__ == "__main__":
    main()
