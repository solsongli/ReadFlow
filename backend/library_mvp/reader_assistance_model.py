"""Bounded reader context and request-scoped model privacy policy."""
import hashlib
import json
from urllib.parse import urlsplit
from .store import StoreError, text
from .agent_config import AgentConfig
from .workbench_translation_errors import translation_error

AI_OFFLINE = '本地 AI 服务未运行。AI 伴读需要它在后台运行；正式版启动时会自动开启。'


def provider(config):
    address = urlsplit(config['base_url'])
    host = address.hostname or '自定义服务'
    label = host + (f':{address.port}' if address.port else '')
    return f'DeepSeek · {label}' if host.lower() == 'api.deepseek.com' else label


def target(config):
    return hashlib.sha256(json.dumps([config['base_url'], config['model']], ensure_ascii=False).encode()).hexdigest()


def translation_config(value):
    if not isinstance(value, dict) or not all(value.get(key) for key in ('base_url', 'model', 'api_key')):
        raise StoreError('unconfigured', '还没有配置翻译服务', 409)
    try:
        config = AgentConfig._validate({key: value[key] for key in ('base_url', 'model', 'api_key')})
        config['disable_thinking'] = value.get('disable_thinking') is not False
        candidate = value.get('workers')
        if isinstance(candidate, (int, str)) and not isinstance(candidate, bool):
            try:
                config['workers'] = max(1, min(16, int(candidate)))
            except ValueError:
                pass
        return config
    except Exception:
        raise StoreError('unconfigured', '翻译服务配置无效，请前往设置检查。', 409) from None


def runtime_config(value):
    if value.get('configured_runtime') == 'fx':
        raise StoreError('runtime_mode', '请在 AI 伴读设置选择 Markdown 检索问答或 OpenAI 兼容模式。', 409)
    if value.get('restart_required'):
        raise StoreError('runtime_pending', 'AI 设置正在应用，请稍后重试。', 409)
    try:
        return AgentConfig._validate({'base_url': value.get('llm_base_url', ''),
                                     'model': value.get('llm_model', ''), 'api_key': value.get('llm_api_key', '')})
    except Exception:
        raise StoreError('unconfigured', '还没有配置 AI 伴读模型，请前往设置。', 409) from None


def context(value, item):
    page = value.get('page')
    count = max((a['page_count'] for a in item.get('attachments', [])), default=0)
    if type(page) is not int or not 1 <= page <= max(1, count):
        raise StoreError('INVALID_READER_CONTEXT', '当前页码无效。')
    return {'page': page, 'title': item['title'][:1000], 'abstract': item.get('abstract', '')[:6000],
            'page_text': text(value.get('page_text', ''), 'page_text', 20000),
            'selection': text(value.get('selection', ''), 'selection', 8000)}


def mapped_error(error, secret=''):
    if isinstance(error, StoreError):
        return {'code': error.code, 'message': str(error).replace(secret, '[已隐藏]') if secret else str(error)}
    detail = getattr(error, 'safe_error', None)
    if detail:
        return detail
    result = translation_error(str(error), secrets=[secret])
    # Provider bodies and exception details can echo source text; never expose them.
    return {'code': result['code'], 'message': result['message'].replace('翻译服务', '模型服务').replace('翻译未能完成', '请求未能完成')}
