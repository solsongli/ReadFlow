"""Native translation commands. Credentials are request-scoped, never stored in the library."""
from __future__ import annotations
import asyncio
import copy
import threading
import time
from fastapi import Request
from .native_bridge import NativeBridgeError
from .store import StoreError
from .workbench_translation import summarize_jobs
from .workbench_translation_errors import translation_error

ACTIVE = {'queued', 'pending', 'running', 'paused'}


class TranslationCommands:
    def __init__(self, store, bridge, modules, cache=None):
        self.store, self.bridge, self.modules, self.cache = store, bridge, modules, cache
        self.lock = threading.RLock()
        self.pending = {}

    def attachment(self, item_id):
        item = self.store.get_item(item_id)
        attachments = item.get('attachments', [])
        with self.store.lock:
            deleted = self.store.db.execute('SELECT deleted_at FROM item_state WHERE item_id=?', (item_id,)).fetchone()
        if deleted and deleted[0]:
            raise StoreError('TRASHED', '请先从回收站恢复文献。')
        if not attachments:
            raise StoreError('NO_PDF', '这篇文献没有 PDF 附件。')
        return attachments[0]

    def jobs(self, attachment):
        if self.bridge is None:
            raise NativeBridgeError('NATIVE_UNAVAILABLE', '本地翻译服务尚未连接。')
        return self.bridge.document_jobs(attachment['sha256'], limit=200)

    def status(self, item_id):
        attachment = self.attachment(item_id)
        jobs = self.jobs(attachment)
        result = summarize_jobs(jobs)
        digest = attachment['sha256']
        with self.lock:
            pending = self.pending.get(digest)
            if pending:
                known = next((j for j in jobs if j.get('job_id') == pending[1]['job_id']), None)
                if known or time.monotonic() - pending[0] > 120:
                    self.pending.pop(digest, None)
                else:
                    result = pending[1]
        if self.cache and result['status'] in {'done', 'failed'}:
            self.cache.invalidate(digest)
        terminal = next((j for j in jobs if j.get('job_id') == result.get('job_id')), {})
        if terminal.get('status') in {'cancelled', 'canceled'}:
            return {'item_id': item_id, 'translation': {**result, 'error': {'code': 'cancelled', 'message': '翻译已取消。'}}}
        if result['status'] == 'failed' and result.get('job_id'):
            try:
                detail = self.bridge.translation_job(result['job_id'])
                raw = detail.get('error') or detail.get('last_error') or detail.get('error_message') or detail.get('failure_reason') or '任务失败或已取消'
                secret = (detail.get('request_payload') or {}).get('translation', {}).get('api_key', '')
                result = {**result, 'error': translation_error(raw, secrets=[secret])}
            except Exception:
                result = {**result, 'error': translation_error('任务失败，暂时无法读取错误详情。')}
        return {'item_id': item_id, 'translation': result}

    def submit(self, item_id, payload):
        attachment = self.attachment(item_id)
        with self.lock:
            jobs = self.jobs(attachment)
            active = next((j for j in jobs if j.get('workflow') != 'ocr' and j.get('status') in ACTIVE), None)
            if active:
                return {'item_id': item_id, 'translation': summarize_jobs([active]), 'reused': True}
            previous = self.pending.get(attachment['sha256'])
            if previous and time.monotonic() - previous[0] < 120 and not any(j.get('job_id') == previous[1]['job_id'] for j in jobs):
                return {'item_id': item_id, 'translation': previous[1], 'reused': True}
            config = payload.get('translation', {})
            if not isinstance(config, dict) or not all(isinstance(config.get(k), str) and config[k].strip() for k in ['base_url', 'model']) or not any(isinstance(config.get(k), str) and config[k].strip() for k in ['api_key', 'credential_ref']):
                return {'error': {'code': 'unconfigured', 'message': '还没有配置翻译服务', 'settings': 'translation'}}
            if set(payload) - {'workflow', 'source', 'ocr', 'translation', 'render', 'runtime'} or payload.get('workflow') != 'book' or payload.get('source') != {} or payload.get('ocr', {}).get('provider') != 'local':
                raise StoreError('INVALID_TRANSLATION', '翻译请求必须使用本地文献的分组配置。')
            parsed = self.store.get_pages(attachment['id'], prefer_ocr=False)
            needs_ocr = parsed['parse_status'] in {'needs_ocr', 'partial_needs_ocr'}
            if needs_ocr and not any(m['status'] == 'ready' for m in self.modules.list()):
                return {'error': {'code': 'ocr_missing', 'message': '这篇 PDF 需要 OCR，请先安装本地 OCR 模块。', 'settings': 'ocr'}}
            registered = self.bridge.register(self.store, attachment['id'])
            if not registered.get('reader_ready'):
                raise NativeBridgeError('REGISTER_FAILED', registered.get('native_bridge', {}).get('message', '附件登记失败'))
            # Native /documents/{digest}/translate fills source.upload_id from its own verified upload.
            result = self.bridge.submit_translation(attachment['sha256'], copy.deepcopy(payload))
            job_id = result.get('job_id')
            if not isinstance(job_id, str) or not job_id:
                raise NativeBridgeError('INVALID_SUBMISSION', '翻译服务未返回任务编号。')
            state = {'status': 'queued', 'job_id': job_id, 'percent': None, 'updated_at': None}
            self.pending[attachment['sha256']] = (time.monotonic(), state)
            if self.cache:
                self.cache.invalidate(attachment['sha256'])
            return {'item_id': item_id, 'translation': state, 'reused': False, 'needs_ocr': needs_ocr}

    def cancel(self, item_id):
        attachment = self.attachment(item_id)
        with self.lock:
            current = self.status(item_id)['translation']
            if current['status'] in {'running', 'queued'}:
                self.bridge.cancel_translation(current['job_id'])
                self.pending.pop(attachment['sha256'], None)
                if self.cache:
                    self.cache.invalidate(attachment['sha256'])
        return self.status(item_id)


def register_translation_routes(app, store, json_body):
    commands = TranslationCommands(store, app.state.native_bridge, app.state.ocr_modules, app.state.workbench_translation)
    app.state.translation_commands = commands
    root = '/api/research/workbench/items/{item_id}/translate'

    async def invoke(fn, *args):
        try:
            return await asyncio.to_thread(fn, *args)
        except StoreError:
            raise
        except Exception as exc:
            return {'error': getattr(exc, 'translation_error', None) or translation_error(str(exc))}

    @app.post(root)
    async def submit(item_id: str, request: Request):
        return await invoke(commands.submit, item_id, await json_body(request))

    @app.get(root)
    async def status(item_id: str):
        return await invoke(commands.status, item_id)

    @app.post(root + '/cancel')
    async def cancel(item_id: str):
        return await invoke(commands.cancel, item_id)
