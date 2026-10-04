#!/usr/bin/env python3
"""Offline acceptance helper. No upstream requests, keys, request logging or model calls."""
from argparse import ArgumentParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import time


def translated(value):
    return '【译】' + str(value or '')


def completion_content(body):
    messages = body.get('messages', [])
    user = str(next((m.get('content', '') for m in reversed(messages) if m.get('role') == 'user'), ''))
    if '闪卡建议' in user:
        return json.dumps({'front': '这段证据支持什么结论？', 'back': '这是仅供验收的闪卡建议。'}, ensure_ascii=False)
    system = '\n'.join(str(m.get('content', '')) for m in messages if m.get('role') == 'system')
    if 'Cite known pages as' in system and 'Context:' in system:
        return '这是假回答 (p. 2)。\n\n' + '这是本地假服务的流式问答测试，不代表论文结论。' * 5
    schema = body.get('response_format', {}).get('json_schema', {}).get('schema')
    try:
        payload = json.loads(user)
    except (ValueError, TypeError):
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    items = payload.get('items', [])
    if not items:
        items = [{'item_id': identity, 'source_text': text.split('风格提示：')[0].split('仅供理解')[0].strip()}
                 for identity, text in re.findall(r'原文 ([^\s:]+):\s*([\s\S]*?)(?=\n原文 [^\s:]+:|\Z)', user)]
    current = re.search(r'【当前原文开始】\s*([\s\S]*?)\s*【当前原文结束】', user)
    plain = current.group(1) if current else payload.get('source_text', user)
    results = [{'item_id': item.get('item_id', item.get('id', 'fixture')), 'translated_text': translated(item.get('source_text', item.get('text', ''))), 'decision': 'translate'} for item in items if isinstance(item, dict)]
    if schema:
        props = schema.get('properties', {})
        if 'translations' in props:
            return json.dumps({'translations': results}, ensure_ascii=False)
        if 'domain' in props:
            return json.dumps({'domain': '通用科研', 'summary': '本地测试文本', 'translation_guidance': '逐字保留输入，添加测试前缀。'}, ensure_ascii=False)
        if 'translated_text' in props:
            return json.dumps({'translated_text': translated(plain)}, ensure_ascii=False)
        def value(spec):
            if 'enum' in spec:
                return 'break' if 'break' in spec['enum'] else spec['enum'][0]
            kind = spec.get('type')
            if kind == 'object':
                return {name: value(child) for name, child in spec.get('properties', {}).items()}
            if kind == 'array':
                return []
            return False if kind == 'boolean' else 0 if kind in ('number', 'integer') else '本地测试'
        return json.dumps(value(schema), ensure_ascii=False)
    if body.get('response_format', {}).get('type') == 'json_object':
        if 'translation_guidance' in system + user:
            return json.dumps({'domain': '通用科研', 'summary': '本地测试文本', 'translation_guidance': '逐字保留输入，添加测试前缀。'}, ensure_ascii=False)
        if results:
            return json.dumps({'translations': results}, ensure_ascii=False)
        return json.dumps({'decision': 'translate', 'translated_text': translated(plain)}, ensure_ascii=False)
    if results:
        if '<<<ITEM' in system or '<<<ITEM' in user:
            return '\n'.join(f'<<<ITEM item_id={item["item_id"]} decision=translate>>>\n{item["translated_text"]}\n<<<END>>>' for item in results)
        return json.dumps({'translations': results}, ensure_ascii=False)
    return translated(plain)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Neither headers nor PDF content are logged.

    def send_json(self, value, status=200):
        raw = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == '/v1/runtime-config' and hasattr(self.server, 'runtime_config'):
            self.send_json({'data': self.server.runtime_config})
        elif self.path == '/v1/models':
            self.send_json({'object': 'list', 'data': [{'id': 'readflow-test', 'object': 'model', 'owned_by': 'local'}]})
        else:
            self.send_json({'error': {'message': 'Unsupported path'}}, 404)

    def do_PUT(self):
        if self.path != '/v1/runtime-config' or not hasattr(self.server, 'runtime_config'):
            self.send_json({'detail': 'Unsupported fixture path'}, 404)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16000:
                raise ValueError()
            value = json.loads(self.rfile.read(size))
            config = self.server.runtime_config
            if value.get('llm_base_url', config['llm_base_url']).rstrip('/') != self.server.model_base:
                raise ValueError()
            for key in ('llm_base_url', 'llm_model', 'llm_api_key'):
                if key in value:
                    config[key] = str(value[key])
            config['configured_runtime'] = value.get('agent_runtime', 'python')
            config['agent_confirmation_mode'] = value.get('agent_confirmation_mode', 'explicit')
            config['configured_revision'] += 1
            config['active_revision'] = config['configured_revision']
            config['llm_api_key_configured'] = bool(config['llm_api_key'])
            self.send_json({'data': config})
        except (ValueError, TypeError):
            self.send_json({'detail': 'Fixture accepts only its loopback model address'}, 400)

    def do_POST(self):
        if self.path != '/v1/chat/completions':
            self.send_json({'error': {'message': 'Use /v1/chat/completions'}}, 404)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 4 * 1024 * 1024:
                raise ValueError()
            body = json.loads(self.rfile.read(size))
            content = completion_content(body)
        except (ValueError, TypeError, AttributeError):
            self.send_json({'error': {'message': 'Invalid fixture request'}}, 400)
            return
        metadata = {'id': 'readflow-fixture', 'created': int(time.time()), 'model': body.get('model', 'readflow-test')}
        if body.get('stream'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Connection', 'close')
            self.end_headers()
            deltas = [({'role': 'assistant', 'content': content[i:i + 12]}, None) for i in range(0, len(content), 12)]
            for delta, reason in [*deltas, ({}, 'stop')]:
                chunk = {**metadata, 'object': 'chat.completion.chunk', 'choices': [{'index': 0, 'delta': delta, 'finish_reason': reason}]}
                self.wfile.write(('data: ' + json.dumps(chunk, ensure_ascii=False) + '\n\n').encode())
                self.wfile.flush()
                time.sleep(.015)
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()
            self.close_connection = True
        else:
            self.send_json({**metadata, 'object': 'chat.completion', 'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': content}, 'finish_reason': 'stop'}], 'usage': {'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2}})


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=48991)
    parser.add_argument('--ai-runtime-port', type=int, help='Optional loopback fake runtime-config service for offline preview')
    options = parser.parse_args()
    if not 1024 <= options.port <= 65535 or options.port == 23119:
        parser.error('Use a free local port between 1024 and 65535 other than 23119.')
    runtime = None
    if options.ai_runtime_port is not None:
        if not 1024 <= options.ai_runtime_port <= 65535 or options.ai_runtime_port in (23119, options.port):
            parser.error('Use a distinct free loopback AI fixture port, excluding 23119.')
        import threading
        runtime = ThreadingHTTPServer(('127.0.0.1', options.ai_runtime_port), Handler)
        runtime.model_base = f'http://127.0.0.1:{options.port}/v1'
        runtime.runtime_config = {
            'configured_runtime': 'python', 'active_runtime': 'python', 'agent_confirmation_mode': 'explicit',
            'llm_base_url': runtime.model_base, 'llm_model': 'readflow-test', 'llm_api_key': 'fixture-local',
            'llm_api_key_configured': True, 'configured_revision': 1, 'active_revision': 1,
            'restart_required': False, 'restart_state': 'active',
        }
        threading.Thread(target=runtime.serve_forever, daemon=True).start()
        print(f'Offline runtime fixture ready: http://127.0.0.1:{options.ai_runtime_port}/v1/runtime-config', flush=True)
    with ThreadingHTTPServer(('127.0.0.1', options.port), Handler) as server:
        print(f'Offline fixture ready: http://127.0.0.1:{server.server_port}/v1', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
