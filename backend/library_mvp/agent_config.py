"""Isolated, owner-only model configuration; never reads legacy credentials."""
from __future__ import annotations
import json
import ipaddress
import re
import os
import stat
import tempfile
import threading
from pathlib import Path
from urllib.parse import urlsplit
from .evidence import EvidenceError

# Windows has no owner/mode bits, getuid or O_NOFOLLOW; there the file sits in the user's private profile
# (%APPDATA%), symlinks are refused explicitly, and the regular-file and size checks still apply.
POSIX = os.name == 'posix'

class AgentConfig:
    def __init__(self, path: Path | None, *, allow_external_models: bool = False):
        self.path = Path(path) if path is not None else None
        self.allow_external_models = allow_external_models is True
        self._memory = None
        self._lock = threading.RLock()

    def _load(self):
        if self.path is None:
            return self._memory
        if not POSIX and self.path.is_symlink():
            raise EvidenceError('CONFIG_PERMISSIONS', '模型配置文件必须仅对当前用户可读写。', 409)
        try:
            fd = os.open(self.path, os.O_RDONLY | (os.O_NOFOLLOW if POSIX else 0))
        except FileNotFoundError:
            return None
        with os.fdopen(fd, encoding='utf-8') as stream:
            info = os.fstat(stream.fileno())
            private = not POSIX or (not info.st_mode & 0o077 and info.st_uid == os.getuid())
            if not stat.S_ISREG(info.st_mode) or not private or info.st_size > 12000:
                raise EvidenceError('CONFIG_PERMISSIONS', '模型配置文件必须仅对当前用户可读写。', 409)
            value = json.load(stream)
        return self._validate(value)

    @staticmethod
    def _validate(value):
        if not isinstance(value, dict) or set(value) != {'base_url', 'model', 'api_key'}:
            raise EvidenceError('INVALID_CONFIG', '请提供 base_url、model 和 api_key。')
        if any(not isinstance(value[k], str) for k in value) or not value['base_url'].strip() or not value['model'].strip():
            raise EvidenceError('INVALID_CONFIG', '模型地址和名称不能为空；本地无需认证的模型可留空密钥。')
        clean = {k: v.strip() for k, v in value.items()}
        try:
            url = urlsplit(clean['base_url'])
            port = url.port
            hostname = url.hostname or ''
            ascii_host = hostname.encode('idna').decode('ascii')
            try:
                loopback = ipaddress.ip_address(hostname).is_loopback
            except ValueError:
                loopback = hostname.lower() == 'localhost'
            valid_host = bool(ascii_host) and (':' in ascii_host or all(
                re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?', label)
                for label in ascii_host.rstrip('.').split('.')))
        except (ValueError, UnicodeError):
            raise EvidenceError('INVALID_CONFIG', '模型地址无效。') from None
        if (url.scheme not in {'http', 'https'} or not valid_host or url.username is not None or url.password is not None
                or url.query or url.fragment or len(clean['base_url']) > 2000
                or (url.scheme == 'http' and not loopback)
                or (port is not None and not 1 <= port <= 65535)
                or any(c.isspace() for c in clean['base_url']) or '\\' in clean['base_url']
                or '%' in hostname
                or (not clean['api_key'] and not loopback)
                or len(clean['model']) > 200 or len(clean['api_key']) > 4000
                or any(ord(c) < 32 for v in clean.values() for c in v)):
            raise EvidenceError('INVALID_CONFIG', '远程模型须使用HTTPS并显式填写密钥；本地回环服务可无密钥。地址不得包含凭据、查询、片段或空白。')
        clean['base_url'] = clean['base_url'].rstrip('/')
        return clean

    def status(self):
        with self._lock:
            config = self._load()
            return {'configured': bool(config), 'base_url': config['base_url'] if config else '',
                    'model': config['model'] if config else '', 'api_key_configured': bool(config and config['api_key']),
                    'external_models_allowed': self.allow_external_models,
                    'model_verified': False, 'claim_support_verified': False,
                    'runtime': 'retainpdf-retrieval-agent', 'local_search_available': True}

    def save(self, value):
        clean = self._validate(value)
        with self._lock:
            if self.path is None:
                self._memory = clean
            else:
                parent = self.path.parent
                if parent.is_symlink() or not parent.is_dir() or self.path.is_symlink():
                    raise EvidenceError('CONFIG_PATH_UNSAFE', '模型配置目录不安全。', 409)
                fd, temporary = tempfile.mkstemp(prefix='.agent-config-', dir=parent)
                try:
                    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                        if POSIX:
                            os.fchmod(stream.fileno(), 0o600)
                        json.dump(clean, stream)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.replace(temporary, self.path)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
            return self.status()

    def clear(self):
        with self._lock:
            self._memory = None
            if self.path is not None:
                self.path.unlink(missing_ok=True)
            return self.status()

    def for_execution(self):
        if not self.allow_external_models:
            raise EvidenceError('AI_MODEL_NOT_AUTHORIZED', '本机服务未启用外部模型调用；可使用本地证据检索。', 403)
        with self._lock:
            value = self._load()
        if not value:
            raise EvidenceError('AI_MODEL_NOT_CONFIGURED', '请先手动配置模型地址、名称和密钥。', 409)
        return value
