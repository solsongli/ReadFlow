"""Safety adapter around the existing OpenAI-compatible model transport."""
from __future__ import annotations
import re
import httpx
from .evidence import EvidenceError
from .ai_runtime import build_deepseek_chat_fn
from .ai_runtime import Settings


def build_library_chat(config, control, *, test_transport=None):
    """Reuse the original transport while binding credentials to one exact endpoint.

    test_transport is offline dependency injection; production never chooses one.
    The non-secret marker only opens the original builder's required-key branch;
    a request hook always removes Authorization for explicitly unauthenticated config.
    """
    endpoint = httpx.URL(config['base_url'].rstrip('/') + '/chat/completions')
    no_auth = not config['api_key']

    def guard_request(request):
        control.raise_if_stopped()
        if request.url != endpoint or request.method != 'POST':
            raise EvidenceError('MODEL_ENDPOINT_CHANGED', '模型请求地址与配置不一致，已阻止发送。', 502)
        if no_auth:
            request.headers.pop('Authorization', None)

    def guard_response(response):
        if 300 <= response.status_code < 400:
            raise EvidenceError('MODEL_REDIRECT_REJECTED', '模型服务返回重定向；请直接配置最终API地址。', 502)
        if response.status_code in {400, 404, 422, 501}:
            # Inspect only for classification; never return provider response bodies.
            body = response.read()[:8192].decode('utf-8', errors='replace').lower()
            if (re.search(r'tool|function.?call|functions', body)
                    and re.search(r'not.support|unsupported|not.allowed|unrecognized|unknown|not.implement', body)):
                raise EvidenceError('MODEL_TOOLS_UNSUPPORTED', '该模型或服务不支持工具调用。请选择支持OpenAI function/tool calling的模型，或使用本地证据检索。', 502)

    client = httpx.Client(timeout=45, trust_env=False, follow_redirects=False,
                          event_hooks={'request': [guard_request], 'response': [guard_response]},
                          transport=test_transport)
    control.add_cancel_callback(client.close)
    settings = Settings(llm_base_url=config['base_url'], llm_model=config['model'],
                        llm_api_key=config['api_key'] or 'local-unauthenticated-no-secret', llm_timeout_s=45)
    return build_deepseek_chat_fn(settings, client=client, request_control=control), client
