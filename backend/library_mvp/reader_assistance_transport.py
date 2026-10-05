"""Existing AI runtime chat transport, no tools, no automatic calls, bounded I/O."""
import httpx
from .ai_runtime import Settings, RequestControl, build_deepseek_chat_fn
from .workbench_translation_errors import translation_error


class ReaderModelClient(httpx.Client):
    def build_request(self, method, url, **kwargs):
        payload = kwargs.get('json')
        if isinstance(payload, dict) and payload.get('tools') == []:
            kwargs['json'] = {key: value for key, value in payload.items() if key != 'tools'}
        return super().build_request(method, url, **kwargs)


def run_chat(config, messages, delta=None, *, transport=None, control=None, batch=False,
             translation=False, policy=None, permit=None):
    if batch or translation:
        from .paper_blocks_transport import run_batch
        result = run_batch(config, messages, transport=transport, control=control,
                           policy=policy, permit=permit, json_mode=batch)
        if batch:
            return result
        answer = result['content']
        if not answer.strip() or len(answer) > 100000:
            raise ValueError('模型未返回有效文本。')
        return answer
    endpoint = httpx.URL(config['base_url'].rstrip('/') + '/chat/completions')
    control = control or RequestControl(60)

    def request_guard(request):
        control.raise_if_stopped()
        if request.url != endpoint or request.method != 'POST':
            raise ValueError('模型地址变化，已停止请求。')
        if not config['api_key']:
            request.headers.pop('Authorization', None)

    def response_guard(response):
        if not 200 <= response.status_code < 300:
            body = response.read()[:8192].decode('utf-8', errors='replace')
            value = translation_error(body, response.status_code, [config['api_key']])
            error = RuntimeError(value['message'])
            error.safe_error = {'code': value['code'], 'message': value['message']}
            raise error

    with ReaderModelClient(timeout=httpx.Timeout(45, connect=5), trust_env=False, follow_redirects=False,
                      transport=transport, event_hooks={'request': [request_guard], 'response': [response_guard]}) as client:
        control.add_cancel_callback(client.close)
        settings = Settings(llm_base_url=config['base_url'], llm_model=config['model'],
                            llm_api_key=config['api_key'] or 'local-fixture-no-auth', llm_timeout_s=45)
        secret = config['api_key']
        pending = ''
        received = 0

        def safe_delta(piece):
            nonlocal pending, received
            received += len(piece)
            if received > 100000:
                raise ValueError('模型回答超过长度限制。')
            pending += piece
            if secret:
                pending = pending.replace(secret, '[已隐藏]')
            reserve = max(0, len(secret) - 1)
            if len(pending) > reserve:
                available = pending[:-reserve] if reserve else pending
                pending = pending[-reserve:] if reserve else ''
                delta(available)

        chat = build_deepseek_chat_fn(settings, client=client, on_delta=safe_delta if delta else None,
                                     request_control=control)
        try:
            response = chat(messages, [])
            answer = response.get('content')
            if response.get('tool_calls') or not isinstance(answer, str) or not answer.strip() or len(answer) > 100000:
                raise ValueError('模型未返回有效文本。')
            if delta and pending:
                delta(pending.replace(secret, '[已隐藏]') if secret else pending)
            return answer.replace(secret, '[已隐藏]') if secret else answer
        finally:
            control.finish()
