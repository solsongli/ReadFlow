"""Bounded local page OCR queue; no network or AI provider is used by a job."""
from __future__ import annotations
import copy
from contextlib import nullcontext
import json
import math
from pathlib import Path
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from fastapi import Request
from .data_layout import OCR_MODULES
from .store import StoreError, encode, fingerprint, new_id, now, MAX_EXTRACTED_CHARACTERS
from .ocr_modules import OcrModules


class OcrCancelled(Exception):
    pass


def run_page(page, runtime, cancelled):
    """Render a bounded raster locally, then OCR in the isolated CPU runtime."""
    import fitz
    scale = min(2.0, 3000 / max(page.rect.width, page.rect.height))
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    with tempfile.TemporaryDirectory(prefix='retain-ocr-page-') as temporary:
        image = Path(temporary) / 'page.png'
        pixmap.save(str(image))
        payload = json.dumps({'image': str(image), 'models': runtime['models'], 'site': runtime['site']})
        with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
            process = subprocess.Popen([runtime['python'], '-I', '-B', str(Path(__file__).with_name('ocr_worker.py'))],
                                       stdin=subprocess.PIPE, stdout=stdout, stderr=stderr, text=True)
            try:
                process.stdin.write(payload)
                process.stdin.close()
                deadline = time.monotonic() + 180
                while process.poll() is None:
                    if cancelled.wait(.1):
                        raise OcrCancelled()
                    if time.monotonic() > deadline:
                        raise StoreError('OCR_PAGE_TIMEOUT', 'The OCR page exceeded its local runtime limit.', 422)
                if process.returncode:
                    raise StoreError('OCR_PAGE_FAILED', 'The isolated local OCR worker failed.', 422)
                stdout.seek(0)
                raw = stdout.read(4_000_001)
                if len(raw) > 4_000_000:
                    raise StoreError('OCR_OUTPUT_LIMIT', 'OCR worker output exceeded the limit.', 422)
                response = json.loads(raw)
                if response.get('error'):
                    error = response['error']
                    raise StoreError(error['code'], error['message'], 422)
                result = response['blocks']
            finally:
                if process.poll() is None:
                    process.kill()
                process.wait()
    # Rendered dimensions can round up, so use actual per-axis scaling.
    for block in result:
        box = block['bbox']
        block['bbox'] = [box[0] * page.rect.width / pixmap.width,
                         box[1] * page.rect.height / pixmap.height,
                         box[2] * page.rect.width / pixmap.width,
                         box[3] * page.rect.height / pixmap.height]
    return result


class OcrJobs:
    def __init__(self, store, modules, *, page_runner=None):
        self.store, self.modules = store, modules
        self.page_runner = page_runner or run_page
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='library-local-ocr')
        self.events = {}
        self.closed = False
        with store.lock:
            store.db.execute('CREATE TABLE IF NOT EXISTS local_ocr_jobs(id TEXT PRIMARY KEY,payload_json TEXT NOT NULL)')
            # A process restart cannot leave a fictitious running task.
            for row in store.db.execute('SELECT * FROM local_ocr_jobs').fetchall():
                job = json.loads(row['payload_json'])
                if job['status'] in ('queued', 'running', 'cancelling'):
                    job.update(status='error', error={'code': 'OCR_INTERRUPTED', 'message': 'Local OCR was interrupted; retry to resume.'})
                    self._save(job)

    def _save(self, job):
        job['updated_at'] = now()
        with self.store.lock:
            self.store.db.execute('INSERT OR REPLACE INTO local_ocr_jobs VALUES(?,?)', (job['id'], encode(job)))

    def get(self, identity):
        with self.store.lock:
            row = self.store.db.execute('SELECT payload_json FROM local_ocr_jobs WHERE id=?', (identity,)).fetchone()
            if row is None:
                raise StoreError('NOT_FOUND', 'OCR task not found.', 404)
            job = json.loads(row[0])
        job.pop('_pages', None)
        return job

    def list(self):
        with self.store.lock:
            ids = [r[0] for r in self.store.db.execute('SELECT id FROM local_ocr_jobs ORDER BY rowid DESC LIMIT 100')]
        return [self.get(identity) for identity in ids]

    def create(self, attachment_id, module_id, *, prior=None):
        if self.closed:
            raise StoreError('OCR_CLOSED', 'OCR queue is closed.', 409)
        attachment = self.store.get_attachment(attachment_id)
        active_jobs = [j for j in self.list() if j['status'] in ('queued', 'running')]
        if any(j['attachment_id'] == attachment_id and j['module_id'] == module_id for j in active_jobs):
            raise StoreError('OCR_BUSY', 'This PDF already has an active OCR task.', 409)
        if len(active_jobs) >= 20:
            raise StoreError('OCR_QUEUE_FULL', 'The local OCR queue is full.', 409)
        with self.modules.lock:
            lease = self.modules.runtime_lease(module_id) if hasattr(self.modules, 'runtime_lease') else nullcontext(self.modules.runtime(module_id))
            runtime = lease.__enter__()
            self.modules.active[module_id] = self.modules.active.get(module_id, 0) + 1
        identity = new_id()
        job = {'id': identity, 'attachment_id': attachment_id, 'module_id': module_id,
               'sha256': attachment['sha256'], 'parser_version': runtime['parser_version'],
               'status': 'queued', 'completed_pages': 0, 'total_pages': attachment['page_count'],
               'current_page_idx': None, 'errors': [], 'error': None, 'revision_id': None,
               'cached': False, 'created_at': now(), '_pages': {}}
        if prior and prior['sha256'] == job['sha256'] and prior['parser_version'] == job['parser_version']:
            job['_pages'] = prior.get('_pages', {})
            job['completed_pages'] = len(job['_pages'])
            job['retry_of'] = prior['id']
        event = self.events[identity] = threading.Event()
        try:
            self._save(job)
            self.executor.submit(self._run, job, runtime, event, lease)
        except Exception:
            self.events.pop(identity, None)
            with self.modules.lock:
                self.modules.active[module_id] -= 1
            lease.__exit__(None, None, None)
            raise
        return self.get(identity)

    def cancel(self, identity):
        job = self.get(identity)
        if job['status'] in ('queued', 'running', 'cancelling'):
            event = self.events.get(identity)
            if event:
                event.set()
        return self.get(identity)

    def retry(self, identity):
        with self.store.lock:
            job = self.get(identity)
            if job['status'] not in ('error', 'cancelled'):
                raise StoreError('OCR_RETRY_INVALID', 'Only failed or cancelled OCR tasks can be retried.', 409)
            prior = json.loads(self.store.db.execute('SELECT payload_json FROM local_ocr_jobs WHERE id=?', (identity,)).fetchone()[0])
        return self.create(job['attachment_id'], job['module_id'], prior=prior)

    def _run(self, job, runtime, event, lease):
        try:
            if event.is_set():
                raise OcrCancelled()
            path = self.store.attachment_path(job['attachment_id'])
            cached = self.store.ocr_revision(job['sha256'], job['parser_version'])
            if cached:
                job.update(status='completed', completed_pages=job['total_pages'], revision_id=cached['revision_id'], cached=True)
                return
            job['status'] = 'running'
            self._save(job)
            native = self.store.get_pages(job['attachment_id'], prefer_ocr=False)
            if native['parse_status'] == 'truncated':
                raise StoreError('OCR_TEXT_LIMIT', 'Native extraction reached the document text limit.', 422)
            import fitz
            with fitz.open(path) as document:
                for source in native['pages']:
                    idx = source['page_idx']
                    if event.is_set():
                        raise OcrCancelled()
                    if str(idx) in job['_pages']:
                        continue
                    job['current_page_idx'] = idx
                    self._save(job)
                    page = copy.deepcopy(source)
                    page['physical_page_number'] = idx + 1
                    page['text_source'] = 'native' if page['text'].strip() else 'ocr'
                    if not page['text'].strip():
                        pdf_page = document[idx]
                        page['rotation'] = pdf_page.rotation
                        # PDF text boxes use unrotated page coordinates, including rotated scans.
                        pdf_page.set_rotation(0)
                        page['width'], page['height'] = pdf_page.rect.width, pdf_page.rect.height
                        raw = self.page_runner(pdf_page, runtime, event)
                        page['blocks'] = self._blocks(raw, page)
                        page['text'] = '\n\n'.join(b['text'] for b in page['blocks'])
                    if len(page['text']) + sum(len(p['text']) for p in job['_pages'].values()) > MAX_EXTRACTED_CHARACTERS:
                        raise StoreError('OCR_TEXT_LIMIT', 'OCR exceeded the document text limit.', 422)
                    job['_pages'][str(idx)] = page
                    job['completed_pages'] = len(job['_pages'])
                    self._save(job)
            if event.is_set():
                raise OcrCancelled()
            pages = [job['_pages'][str(idx)] for idx in range(job['total_pages'])]
            revision = self.store.save_ocr_revision(job['attachment_id'], job['sha256'], job['parser_version'], pages)
            job.update(status='completed', revision_id=revision['revision_id'], current_page_idx=None)
        except OcrCancelled:
            job.update(status='cancelled', current_page_idx=None)
        except Exception as exc:
            error = {'code': exc.code if isinstance(exc, StoreError) else 'OCR_FAILED',
                     'message': str(exc) if isinstance(exc, StoreError) else 'Local OCR failed; the source PDF and previous parse remain unchanged.',
                     'page_idx': job['current_page_idx']}
            job.update(status='error', error=error)
            job['errors'].append(error)
        finally:
            try:
                self._save(job)
            finally:
                self.events.pop(job['id'], None)
                with self.modules.lock:
                    self.modules.active[job['module_id']] -= 1
                lease.__exit__(None, None, None)

    @staticmethod
    def _blocks(raw, page):
        if not isinstance(raw, list) or len(raw) > 20000:
            raise StoreError('OCR_OUTPUT_INVALID', 'Invalid local OCR blocks.', 422)
        blocks = []
        for i, block in enumerate(raw):
            text, box = block.get('text'), block.get('bbox')
            if not isinstance(text, str) or not isinstance(box, (tuple, list)) or len(box) != 4 or not all(isinstance(x, (int, float)) and math.isfinite(x) for x in box):
                raise StoreError('OCR_OUTPUT_INVALID', 'Invalid local OCR text or coordinates.', 422)
            if not (0 <= box[0] <= box[2] <= page['width'] + 1 and 0 <= box[1] <= box[3] <= page['height'] + 1):
                raise StoreError('OCR_OUTPUT_INVALID', 'OCR coordinates fall outside the physical page.', 422)
            if text.strip():
                blocks.append({'block_id': f"p{page['page_idx']}-ocr{i}", 'text': text.strip(),
                               'bbox': [round(float(x), 3) for x in box], 'source': 'ocr'})
        return blocks

    def close(self):
        self.closed = True
        for event in list(self.events.values()):
            event.set()
        self.executor.shutdown(wait=True, cancel_futures=False)


def register_ocr_routes(app, store, *, allow_download=False, manifest_path=None):
    from .api import json_body
    modules = OcrModules(store.data_root / OCR_MODULES, manifest_path, allow_download=allow_download)
    jobs = OcrJobs(store, modules)
    app.state.ocr_modules, app.state.ocr_jobs = modules, jobs
    base = '/api/research/ocr'

    @app.get(base + '/modules')
    def list_modules():
        return {'modules': modules.list()}

    @app.get(base + '/modules/{module_id}/preview')
    def preview_module(module_id: str):
        return modules.preview(module_id)

    @app.post(base + '/modules/{module_id}/install', status_code=202)
    async def install_module(module_id: str, request: Request):
        body = await json_body(request)
        return modules.start_install(module_id, body.get('preview_hash'))

    @app.post(base + '/modules/{module_id}/cancel')
    def cancel_module(module_id: str):
        return modules.cancel_install(module_id)

    @app.delete(base + '/modules/{module_id}')
    def remove_module(module_id: str):
        return modules.remove(module_id)

    @app.post(base + '/jobs', status_code=202)
    async def create_job(request: Request):
        body = await json_body(request)
        if not isinstance(body.get('attachment_id'), str) or not isinstance(body.get('module_id'), str):
            raise StoreError('INVALID_FIELD', 'attachment_id and module_id must be strings.')
        return jobs.create(body['attachment_id'], body['module_id'])

    @app.get(base + '/jobs')
    def list_jobs():
        return {'jobs': jobs.list()}

    @app.get(base + '/jobs/{identity}')
    def get_job(identity: str):
        return jobs.get(identity)

    @app.post(base + '/jobs/{identity}/cancel')
    def cancel_job(identity: str):
        return jobs.cancel(identity)

    @app.post(base + '/jobs/{identity}/retry', status_code=202)
    def retry_job(identity: str):
        return jobs.retry(identity)

    return jobs
