"""User-facing translation failures; never return credential-bearing payloads."""
import re


def safe_detail(value, secrets=()):
    text = str(value or "")[:12000]
    for secret in secrets:
        if isinstance(secret, str) and secret:
            text = text.replace(secret, "[已隐藏]")
    text = re.sub(r'(?i)(bearer\s+)[^\s,;\"\']+', r'\1[已隐藏]', text)
    text = re.sub(r'(?i)((?:api[_-]?key|token|authorization|credential)[\"\']?\s*[:=]\s*[\"\']?)[^\s,;\"\'}]+', r'\1[已隐藏]', text)
    text = re.sub(r'\b(?:sk-|sk_)[A-Za-z0-9_-]+', '[已隐藏]', text)
    text = re.sub(r'\b[A-Za-z0-9_-]{24,}\b', '[已隐藏]', text)
    return text[:2000]


def translation_error(value, status=None, secrets=()):
    raw = str(value or "")
    text = raw.lower()
    if status in (401, 403) or re.search(r'\b(401|403)\b|invalid.api.key|authentication|unauthorized', text):
        code, message, settings = 'credentials', '翻译服务的 Key 无效或没有访问权限。', 'translation'
    elif status == 429 or re.search(r'\b429\b|rate.limit|quota|insufficient.balance|余额|额度', text):
        code, message, settings = 'quota', '服务额度不足或请求过于频繁，请稍后重试。', 'translation'
    elif re.search(r'model.*(?:not.found|does.not.exist|不存在)|unknown.model', text):
        code, message, settings = 'model', '所选模型不存在或当前服务不支持它。', 'translation'
    elif re.search(r'ocr|rapidocr|扫描|识别', text):
        code, message, settings = 'ocr', '文字识别失败，请检查本地 OCR 模块后重试。', 'ocr'
    elif status in (502, 503, 504) or re.search(r'timeout|timed.out|connect|network|dns|超时|连接', text):
        code, message, settings = 'network', '无法连接翻译服务或请求超时，请检查服务地址。', 'translation'
    else:
        code, message, settings = 'other', '翻译未能完成，请查看详情后重试。', None
    return {'code': code, 'message': message, 'settings': settings, 'details': safe_detail(raw, secrets)}
