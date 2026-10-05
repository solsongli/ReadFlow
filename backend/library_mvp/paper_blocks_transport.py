"""Bounded JSON chat using the existing translation credentials and external-model gate."""
import json
import time
import httpx
from .ai_runtime import RequestControl
from .workbench_translation_errors import translation_error


def wait_backoff(seconds, control):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        control.raise_if_stopped()
        time.sleep(min(0.1, max(0, until - time.monotonic())))


def token_usage(value):
    value = value if isinstance(value, dict) else {}
    result = {
        k: int(v) if isinstance(v, (int, float)) and 0 <= v <= 10**9 else 0
        for k, v in ((key, value.get(key)) for key in ("prompt_tokens", "completion_tokens", "total_tokens"))
    }
    if not result["total_tokens"]:
        result["total_tokens"] = result["prompt_tokens"] + result["completion_tokens"]
    details = [value.get("completion_tokens_details"), value.get("output_tokens_details"), value]
    reasoning = next(
        (
            item.get("reasoning_tokens")
            for item in details
            if isinstance(item, dict)
            and isinstance(item.get("reasoning_tokens"), (int, float))
            and not isinstance(item.get("reasoning_tokens"), bool)
            and 0 <= item["reasoning_tokens"] <= 10**9
        ),
        0,
    )
    # Reasoning is a reported subset, never added a second time to completion/total.
    result["reasoning_tokens"] = int(reasoning)
    return result


def run_batch(config, messages, *, control=None, transport=None, backoff=wait_backoff, json_mode=True):
    control = control or RequestControl(180)
    endpoint = config["base_url"].rstrip("/") + "/chat/completions"
    payload = {
        "model": config["model"],
        "messages": messages,
        "stream": False,
        "temperature": 0.2,
        "max_tokens": 4096,
    }
    use_json = json_mode and config.get("json_mode", True)
    retry = 0
    with httpx.Client(
        timeout=httpx.Timeout(90, connect=8), trust_env=False, follow_redirects=False, transport=transport
    ) as client:
        control.add_cancel_callback(client.close)
        while True:
            control.raise_if_stopped()
            body = {**payload, **({"response_format": {"type": "json_object"}} if use_json else {})}
            headers = {"Authorization": "Bearer " + config["api_key"]} if config.get("api_key") else {}
            with client.stream("POST", endpoint, json=body, headers=headers) as response:
                raw = bytearray()
                for chunk in response.iter_bytes():
                    control.raise_if_stopped()
                    raw.extend(chunk)
                    if len(raw) > 2_000_000:
                        raise ValueError("翻译服务响应过大。")
                status = response.status_code
            content = raw.decode("utf-8", errors="replace")
            if (
                use_json
                and status in (400, 422)
                and any(s in content.lower() for s in ("response_format", "json_object"))
            ):
                use_json = False
                config["json_mode"] = False  # Memory only, discarded with the task's credentials.
                continue
            if (status == 429 or status >= 500) and retry < 3:
                backoff(2**retry, control)
                retry += 1
                continue
            if not 200 <= status < 300:
                failure = translation_error(content, status, [config.get("api_key", "")])
                error = RuntimeError(failure["message"])
                error.safe_error = {"code": failure["code"], "message": failure["message"]}
                raise error
            value = json.loads(content)
            choice = value["choices"][0]
            answer = choice.get("message", {}).get("content", "")
            if not isinstance(answer, str):
                raise ValueError("翻译服务没有返回 JSON 文本。")
            if config.get("api_key"):
                answer = answer.replace(config["api_key"], "[已隐藏]")
            return {
                "content": answer,
                "finish_reason": choice.get("finish_reason"),
                "usage": token_usage(value.get("usage")),
            }
