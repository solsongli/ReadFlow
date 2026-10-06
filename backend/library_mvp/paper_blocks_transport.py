"""Bounded JSON chat using the existing translation credentials and external-model gate."""
import json
import asyncio
from contextlib import nullcontext
import time
import httpx
from .ai_runtime import RequestControl
from .workbench_translation_errors import translation_error
from .translation_speed import TranslationPolicy, official_deepseek, workers
from .paper_diagnostics import provider_code, global_failure, annotate
from .paper_json import lower_keys


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


def run_batch(
    config,
    messages,
    *,
    control=None,
    transport=None,
    backoff=wait_backoff,
    json_mode=True,
    policy=None,
    permit=None,
):
    owned = control is None
    control = control or RequestControl(180)
    policy = policy or TranslationPolicy()
    slot = nullcontext(permit) if permit else policy.slot(config, control)
    try:
        with slot as lease:
            return asyncio.run(
                _request(config, messages, control, transport, backoff, json_mode, policy, lease)
            )
    finally:
        if owned:
            control.finish()


async def _request(config, messages, control, transport, backoff, json_mode, policy, permit):
    endpoint = config["base_url"].rstrip("/") + "/chat/completions"
    payload = {"model": config["model"], "messages": messages, "stream": False, "max_tokens": 4096}
    use_json = json_mode and config.get("json_mode", True)
    retry = 0
    metrics = getattr(control, "translation_metrics", None)
    phase = getattr(control, "translation_phase", "main_batches")
    loop, task = asyncio.get_running_loop(), asyncio.current_task()

    # asyncio cancellation closes in-flight sockets even before response headers;
    # closing a synchronous client's socket alone does not interrupt a blocked recv.
    def interrupt():
        loop.call_soon_threadsafe(task.cancel)

    control.add_cancel_callback(interrupt)
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(90, connect=8), trust_env=False, follow_redirects=False, transport=transport
        ) as client:
            while True:
                control.raise_if_stopped()
                body = dict(payload)
                if policy.thinking(config):
                    body["thinking"] = {"type": "disabled"}
                # Official DeepSeek ignores/rejects sampling parameters in thinking mode.
                if not official_deepseek(config):
                    body["temperature"] = 0.2
                if use_json:
                    body["response_format"] = {"type": "json_object"}
                headers = {"Authorization": "Bearer " + config["api_key"]} if config.get("api_key") else {}
                if metrics:
                    metrics.network(1)
                try:
                    async with client.stream("POST", endpoint, json=body, headers=headers) as response:
                        raw = bytearray()
                        async for chunk in response.aiter_bytes():
                            control.raise_if_stopped()
                            raw.extend(chunk)
                            if len(raw) > 2_000_000:
                                raise ValueError("翻译服务响应过大。")
                        status = response.status_code
                        retry_after = response.headers.get("retry-after", "")
                finally:
                    if metrics:
                        metrics.network(-1)
                content = raw.decode("utf-8", errors="replace")
                lowered = content.lower()
                if (
                    use_json
                    and status in (400, 422)
                    and any(word in lowered for word in ("response_format", "json_object"))
                ):
                    use_json = False
                    config["json_mode"] = False
                    continue
                if "thinking" in body and (
                    status == 400
                    or (
                        status >= 400
                        and "thinking" in lowered
                        and any(word in lowered for word in ("unknown", "unsupported", "not support"))
                    )
                ):
                    policy.reject_thinking(config)
                    continue
                http_error = None
                if not 200 <= status < 300:
                    failure = translation_error(content, status, [config.get("api_key", "")])
                    http_error = RuntimeError(failure["message"])
                    http_error.safe_error = {"code": failure["code"], "message": failure["message"]}
                    http_error.http_status = status
                    try:
                        data = json.loads(content).get("error", {})
                        http_error.provider_code = (
                            provider_code(data.get("code") or data.get("type"))
                            if isinstance(data, dict)
                            else None
                        )
                    except (ValueError, AttributeError):
                        pass
                    if global_failure(http_error):
                        raise http_error
                if status == 429:
                    policy.limiter.rate_limited(permit.epoch)
                if (status == 429 or status >= 500) and retry < 3:
                    try:
                        delay = min(30, max(2**retry, float(retry_after)))
                    except ValueError:
                        delay = 2**retry
                    permit.backoff(delay, backoff)
                    retry += 1
                    continue
                if http_error:
                    raise http_error
                value = {}
                try:
                    value = lower_keys(json.loads(content))
                    if metrics:
                        metrics.tokens(phase, value.get("usage"))
                    choice = lower_keys(value["choices"][0])
                    answer = lower_keys(choice.get("message", {})).get("content", "")
                    if not isinstance(answer, str):
                        raise ValueError("Translation response contains no text")
                except Exception as error:
                    error.http_status = status
                    error.reported_usage = (
                        token_usage(value.get("usage")) if isinstance(value, dict) else token_usage({})
                    )
                    raise annotate(error, "parse")
                if config.get("api_key"):
                    answer = answer.replace(config["api_key"], "[已隐藏]")
                policy.limiter.succeeded(permit.epoch, permit.ramp)
                return {
                    "content": answer,
                    "http_status": status,
                    "finish_reason": choice.get("finish_reason"),
                    "usage": token_usage(value.get("usage")),
                    "notices": policy.notices(config),
                }
    except asyncio.CancelledError:
        control.raise_if_stopped()
        raise RuntimeError("翻译请求已取消。") from None
    finally:
        control.remove_cancel_callback(interrupt)
