"""Opt-in, pinned, isolated OCR runtime. Importing this module never downloads anything."""
from __future__ import annotations
import hashlib
from contextlib import contextmanager
from types import SimpleNamespace
import requests
import http.client
import ssl
import urllib.error
import json
import os
import platform
from importlib import metadata
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import threading
import urllib.request
import zipfile
from .store import StoreError, fingerprint


def safe_path(root, relative):
    if not isinstance(relative, str) or '\\' in relative:
        raise StoreError('UNSAFE_OCR_PATH', 'Invalid OCR artifact path.')
    part = PurePosixPath(relative)
    if part.is_absolute() or not part.parts or any(p in ('..', '.') for p in part.parts):
        raise StoreError('UNSAFE_OCR_PATH', 'Invalid OCR artifact path.')
    path = Path(root).joinpath(*part.parts)
    if not path.resolve().is_relative_to(Path(root).resolve()) or any(p.is_symlink() for p in [path, *path.parents] if p != Path(root).parent):
        raise StoreError('UNSAFE_OCR_PATH', 'OCR artifacts cannot use symbolic links.')
    return path


class _DownloadSession(requests.Session):
    """Honor normal network/CA settings without reading unrelated netrc credentials."""
    def __init__(self):
        super().__init__()
        self.auth = lambda request: request

    def rebuild_auth(self, prepared_request, response):
        # Public pinned artifacts never need origin credentials, including redirects.
        prepared_request.headers.pop('Authorization', None)


class OcrModules:
    def __init__(self, root, manifest_path=None, *, allow_download=False):
        self.root = Path(root)
        if self.root.is_symlink():
            raise StoreError('UNSAFE_OCR_PATH', 'OCR root cannot be a symbolic link.')
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.manifest_path = Path(manifest_path or Path(__file__).with_name('ocr_catalog.json'))
        self.allow_download = allow_download
        self.lock = threading.RLock()
        self.states = {}
        self.active = {}
        self.download_events = {}
        self.download_threads = {}

    def _catalog(self):
        if not self.manifest_path.exists():
            return []
        return json.loads(self.manifest_path.read_text(encoding='utf-8'))['modules']

    def _module(self, module_id):
        for module in self._catalog():
            if module['id'] == module_id and re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,79}', module_id):
                return module
        raise StoreError('OCR_MODULE_NOT_FOUND', 'Unknown OCR module.', 404)

    def preview(self, module_id):
        module = self._module(module_id)
        files = module['files']
        if not files:
            raise StoreError('OCR_MANIFEST_INVALID', 'No pinned OCR artifacts are available.')
        for entry in files:
            safe_path(self.root, entry['path'])
            if entry.get('kind') == 'python_source':
                prefix = entry.get('extract_prefix', '')
                safe_path(self.root, prefix.rstrip('/'))
                if not prefix.endswith('/'):
                    raise StoreError('OCR_MANIFEST_INVALID', 'A source package needs an explicit extraction prefix.')
            if not re.fullmatch('[0-9a-f]{64}', entry['sha256']) or not isinstance(entry['bytes'], int) or entry['bytes'] < 1 or not entry['url'].startswith('https://'):
                raise StoreError('OCR_MANIFEST_INVALID', 'Artifact source, size and SHA-256 must be pinned.')
        for notice in module.get('bundled_licenses', []):
            if not notice['path'].startswith('ocr_licenses/'):
                raise StoreError('OCR_MANIFEST_INVALID', 'Invalid bundled license path.')
            source = safe_path(Path(__file__).parent, notice['path'])
            safe_path(self.root, notice['installed_path'])
            if source.stat().st_size != notice['bytes'] or hashlib.sha256(source.read_bytes()).hexdigest() != notice['sha256']:
                raise StoreError('OCR_INTEGRITY_FAILURE', 'A bundled license notice failed verification.')
        model_files = {entry['path'] for entry in files if entry.get('kind') == 'model'}
        if any(module.get('models', {}).get(key) not in model_files for key in ('det', 'rec', 'cls')):
            raise StoreError('OCR_MANIFEST_INVALID', 'Every OCR model must be an explicit pinned artifact.')
        return {**module, 'total_bytes': sum(f['bytes'] for f in files),
                'preview_hash': fingerprint(module), 'download_enabled': self.allow_download}

    def _directory(self, module):
        return safe_path(self.root, module['id'] + '-' + fingerprint(module)[:16])

    def list(self):
        result = []
        with self.lock:
            for module in self._catalog():
                directory = self._directory(module)
                state = self.states.get(module['id'], {})
                installed = (directory / 'ready.json').is_file()
                result.append({**module, 'status': state.get('status', 'ready' if installed else 'not_installed'),
                               'error': state.get('error'), 'download_enabled': self.allow_download,
                               'downloaded_bytes': state.get('downloaded_bytes', 0),
                               'total_bytes': sum(f['bytes'] for f in module['files'])})
        return result

    @contextmanager
    def _module_file_lock(self, module_id, *, exclusive=False):
        """Stable lock inode outside the removable runtime; shared across application processes."""
        if os.name != 'posix':
            # The pinned optional bundle is Linux-only (Windows uses the built-in CPU OCR), and flock is POSIX.
            raise StoreError('OCR_PLATFORM_UNSUPPORTED', 'This pinned OCR bundle requires Linux x86_64 and Python 3.11.', 409)
        import fcntl
        import stat
        self._module(module_id)
        directory = safe_path(self.root, '.locks')
        directory.mkdir(exist_ok=True, mode=0o700)
        path = safe_path(directory, module_id + '.lock')
        descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
        try:
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                raise StoreError('UNSAFE_OCR_PATH', 'OCR lease must be a regular file.')
            try:
                fcntl.flock(descriptor, (fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH) | fcntl.LOCK_NB)
            except BlockingIOError:
                raise StoreError('OCR_BUSY', '本地 OCR 模块正在使用或维护中，请稍后重试。', 409) from None
            try:
                yield
            finally:
                fcntl.flock(descriptor, fcntl.LOCK_UN)
        finally:
            os.close(descriptor)

    @contextmanager
    def runtime_lease(self, module_id):
        """Hold this context until every worker using the returned runtime has stopped."""
        with self._module_file_lock(module_id):
            yield self.runtime(module_id)

    def runtime(self, module_id):
        module = self._module(module_id)
        directory = self._directory(module)
        with self.lock:
            if self.states.get(module_id, {}).get('status') in ('downloading', 'removing', 'error') or not (directory / 'ready.json').is_file():
                raise StoreError('OCR_NOT_READY', 'Install the optional local OCR module first.', 409)
            self.preview(module_id)
            marker = safe_path(directory, 'ready.json')
            try:
                activation = json.loads(marker.read_text(encoding='utf-8'))
                if activation.get('manifest_hash') != fingerprint(module) or not isinstance(activation.get('site_hashes'), dict):
                    raise ValueError('mismatch')
            except (ValueError, OSError):
                raise StoreError('OCR_INTEGRITY_FAILURE', 'The OCR activation marker is invalid.', 409)
            if not safe_path(directory, 'site').is_dir():
                raise StoreError('OCR_NOT_READY', 'The isolated OCR packages are missing.', 409)
            for relative, expected in activation['site_hashes'].items():
                installed_file = safe_path(directory / 'site', relative)
                if not installed_file.is_file() or hashlib.sha256(installed_file.read_bytes()).hexdigest() != expected:
                    raise StoreError('OCR_INTEGRITY_FAILURE', 'An isolated OCR package failed verification.', 409)
            for entry in module['files']:
                file = safe_path(directory, entry['path'])
                if not file.is_file() or file.stat().st_size != entry['bytes'] or hashlib.sha256(file.read_bytes()).hexdigest() != entry['sha256']:
                    raise StoreError('OCR_INTEGRITY_FAILURE', 'An installed OCR artifact failed verification.', 409)
            self._validate_runtime(module)
            python = Path(sys.executable)
            models = {key: str(safe_path(directory, module['models'][key])) for key in ('det', 'rec', 'cls')}
            return {'python': str(python), 'site': str(directory / 'site'), 'models': models, 'module': module,
                    'parser_version': 'ocr-v1-' + fingerprint(module)}

    @staticmethod
    def _validate_runtime(module):
        target = module.get('platform', {})
        checks = {'system': platform.system(), 'machine': platform.machine(),
                  'python': f'{sys.version_info.major}.{sys.version_info.minor}'}
        if any(target.get(key, value) != value for key, value in checks.items()):
            raise StoreError('OCR_PLATFORM_UNSUPPORTED', 'This pinned OCR bundle requires Linux x86_64 and Python 3.11.', 409)
        minimum = target.get('minimum_glibc')
        if minimum:
            libc, version = platform.libc_ver()
            try:
                suitable = libc == 'glibc' and tuple(map(int, version.split('.'))) >= tuple(map(int, minimum.split('.')))
            except ValueError:
                suitable = False
            if not suitable:
                raise StoreError('OCR_PLATFORM_UNSUPPORTED', 'This pinned OCR bundle requires glibc 2.28 or newer.', 409)
        for name, expected in module.get('base_packages', {}).items():
            try:
                installed = metadata.version(name)
            except metadata.PackageNotFoundError:
                installed = None
            if installed != expected:
                raise StoreError('OCR_BASE_RUNTIME_MISMATCH', 'An existing base runtime dependency differs from the reviewed OCR manifest.', 409)

    @contextmanager
    def _open_source(self, url, *, session):
        # Keep the approved HTTPS connection reusable across the pinned artifacts.
        with session.get(url, stream=True, timeout=(12, 30), headers={'Accept-Encoding': 'identity'}) as response:
            response.raise_for_status()
            chunks = response.iter_content(chunk_size=1024 * 1024)
            yield SimpleNamespace(geturl=lambda: response.url, read=lambda size: next(chunks, b''))

    def _download(self, module_id, entry, target, event, *, session):
        cache = safe_path(self.root, 'downloads/' + entry['sha256'])
        cache.parent.mkdir(exist_ok=True, mode=0o700)
        if cache.exists():
            if cache.stat().st_size != entry['bytes'] or hashlib.sha256(cache.read_bytes()).hexdigest() != entry['sha256']:
                raise StoreError('OCR_INTEGRITY_FAILURE', 'A cached OCR artifact failed verification.')
            if event.is_set():
                raise StoreError('OCR_DOWNLOAD_CANCELLED', 'OCR download cancelled.', 409)
            os.link(cache, target)
            with self.lock:
                self.states[module_id]['downloaded_bytes'] += entry['bytes']
            return
        # Transient TLS/connection failures must not require a complete UI restart.
        # Every retry uses the same pinned HTTPS source and rechecks the full hash.
        for attempt in range(3):
            if event.is_set():
                raise StoreError('OCR_DOWNLOAD_CANCELLED', 'OCR download cancelled.', 409)
            digest, size = hashlib.sha256(), 0
            try:
                with self._open_source(entry['url'], session=session) as source, target.open('xb') as output:
                    if not source.geturl().startswith('https://'):
                        raise StoreError('OCR_SOURCE_INVALID', 'Insecure artifact redirect refused.')
                    while chunk := source.read(1024 * 1024):
                        if event.is_set():
                            raise StoreError('OCR_DOWNLOAD_CANCELLED', 'OCR download cancelled.', 409)
                        size += len(chunk)
                        with self.lock:
                            self.states[module_id]['downloaded_bytes'] += len(chunk)
                        if size > entry['bytes']:
                            raise StoreError('OCR_INTEGRITY_FAILURE', 'Artifact exceeds its pinned size.')
                        digest.update(chunk)
                        output.write(chunk)
                if size != entry['bytes'] or digest.hexdigest() != entry['sha256']:
                    raise StoreError('OCR_INTEGRITY_FAILURE', 'Artifact checksum or size mismatch.')
                try:
                    os.link(target, cache)
                except FileExistsError:
                    if cache.stat().st_size != entry['bytes'] or hashlib.sha256(cache.read_bytes()).hexdigest() != entry['sha256']:
                        raise StoreError('OCR_INTEGRITY_FAILURE', 'A concurrent OCR cache entry failed verification.')
                return
            except (requests.exceptions.RequestException, urllib.error.URLError, ssl.SSLError, TimeoutError, ConnectionError, http.client.HTTPException):
                with self.lock:
                    self.states[module_id]['downloaded_bytes'] -= size
                target.unlink(missing_ok=True)
                if event.is_set() or event.wait(attempt + 1 if attempt < 2 else 0):
                    raise StoreError('OCR_DOWNLOAD_CANCELLED', 'OCR download cancelled.', 409)
                if attempt == 2:
                    raise StoreError('OCR_DOWNLOAD_UNAVAILABLE', 'The pinned OCR source could not be reached after three attempts; retry when connectivity recovers.', 503) from None

    def install(self, module_id, preview_hash, *, _reserved=False):
        # Use the same stable inode as runtime leases and removal. The lock covers
        # downloads, shared cache writes, extraction, activation, and cleanup.
        try:
            with self._module_file_lock(module_id, exclusive=True):
                return self._install_locked(module_id, preview_hash, _reserved=_reserved)
        except Exception as exc:
            if _reserved:
                with self.lock:
                    if self.states.get(module_id, {}).get('status') == 'downloading':
                        if (self._directory(self._module(module_id)) / 'ready.json').is_file():
                            self.states.pop(module_id, None)
                        else:
                            self.states[module_id] = {'status': 'error', 'error': exc.code if isinstance(exc, StoreError) else 'OCR_INSTALL_FAILED'}
                    self.download_events.pop(module_id, None)
            raise

    def _install_locked(self, module_id, preview_hash, *, _reserved=False):
        if not self.allow_download:
            raise StoreError('OCR_DOWNLOAD_DISABLED', 'OCR downloads require explicit operator authorization.', 403)
        preview = self.preview(module_id)
        if preview_hash != preview['preview_hash']:
            raise StoreError('OCR_PREVIEW_CHANGED', 'Review the exact download manifest again.', 409)
        module = self._module(module_id)
        self._validate_runtime(module)
        with self.lock:
            if self.active.get(module_id) or (not _reserved and self.states.get(module_id, {}).get('status') in ('downloading', 'removing')):
                raise StoreError('OCR_BUSY', 'The module is in use.', 409)
            if (self._directory(module) / 'ready.json').exists():
                self.states.pop(module_id, None)
                self.download_events.pop(module_id, None)
                return self.runtime(module_id)
            self.states[module_id] = {'status': 'downloading', 'downloaded_bytes': 0}
            event = self.download_events.setdefault(module_id, threading.Event())
        stage = Path(tempfile.mkdtemp(prefix='.ocr-stage-', dir=self.root))
        session = _DownloadSession()
        try:
            for entry in module['files']:
                target = safe_path(stage, entry['path'])
                target.parent.mkdir(parents=True, exist_ok=True)
                self._download(module_id, entry, target, event, session=session)
                if target.suffix == '.whl':
                    with zipfile.ZipFile(target) as wheel:
                        for info in wheel.infolist():
                            safe_path(stage, info.filename.rstrip('/'))
                            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                                raise StoreError('UNSAFE_OCR_PATH', 'Wheel symlinks are forbidden.')
            if event.is_set():
                raise StoreError('OCR_DOWNLOAD_CANCELLED', 'OCR download cancelled.', 409)
            site = stage / 'site'
            site.mkdir()
            for entry in module['files']:
                if entry.get('kind') == 'python_source':
                    prefix = entry['extract_prefix']
                    with tarfile.open(safe_path(stage, entry['path']), 'r:gz') as archive:
                        members = archive.getmembers()
                        if len(members) > 10000 or sum(m.size for m in members) > 100_000_000:
                            raise StoreError('OCR_ARCHIVE_LIMIT', 'The source archive exceeds the extraction limit.')
                        for member in members:
                            safe_path(stage, member.name.rstrip('/'))
                            if not (member.isdir() or member.isfile()):
                                raise StoreError('UNSAFE_OCR_PATH', 'Source archives cannot contain links or special files.')
                            if not member.isfile():
                                continue
                            license_name = PurePosixPath(member.name).name
                            is_license = len(PurePosixPath(member.name).parts) == 2 and license_name.upper() in ('LICENSE', 'LICENSE.TXT', 'LICENSE.MD', 'COPYING', 'NOTICE')
                            if not member.name.startswith(prefix) and not is_license:
                                continue
                            if event.is_set():
                                raise StoreError('OCR_DOWNLOAD_CANCELLED', 'OCR download cancelled.', 409)
                            relative = 'licenses/antlr4/' + license_name if is_license else member.name[len(prefix):]
                            metadata_files = {'PKG-INFO', 'SOURCES.txt', 'dependency_links.txt', 'requires.txt', 'top_level.txt'}
                            metadata_parts = PurePosixPath(relative).parts
                            is_metadata = (len(metadata_parts) == 2 and metadata_parts[0] == 'antlr4_python3_runtime.egg-info'
                                           and metadata_parts[1] in metadata_files)
                            if not is_license and not is_metadata and not relative.startswith('antlr4/'):
                                raise StoreError('UNSAFE_OCR_SOURCE', 'Only the fixed antlr4 package and declarative distribution metadata can be extracted from source.')
                            target = safe_path(site, relative)
                            target.parent.mkdir(parents=True, exist_ok=True)
                            with archive.extractfile(member) as source, target.open('xb') as output:
                                shutil.copyfileobj(source, output)
                    continue
                if not entry['path'].endswith('.whl'):
                    continue
                with zipfile.ZipFile(safe_path(stage, entry['path'])) as wheel:
                    if sum(info.file_size for info in wheel.infolist()) > 2_000_000_000:
                        raise StoreError('OCR_ARCHIVE_LIMIT', 'The OCR wheel exceeds the extraction limit.')
                    for info in wheel.infolist():
                        if event.is_set():
                            raise StoreError('OCR_DOWNLOAD_CANCELLED', 'OCR download cancelled.', 409)
                        if info.is_dir():
                            continue
                        parts = PurePosixPath(info.filename).parts
                        if parts[0].endswith('.data'):
                            if len(parts) < 3 or parts[1] not in ('purelib', 'platlib'):
                                continue  # No scripts, launchers or global data are installed.
                            parts = parts[2:]
                        if info.filename.endswith('.pth'):
                            raise StoreError('UNSAFE_OCR_WHEEL', 'Executable .pth files are not allowed.')
                        target = safe_path(site, '/'.join(parts))
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with wheel.open(info) as source, target.open('xb') as output:
                            shutil.copyfileobj(source, output)
            for notice in module.get('bundled_licenses', []):
                target = safe_path(site, notice['installed_path'])
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as output:
                    output.write(safe_path(Path(__file__).parent, notice['path']).read_bytes())
            # Only the local worker adds this isolated site directory to its import path.
            check = 'import sys; sys.path.insert(0, sys.argv[1]); import rapidocr, onnxruntime; assert "CPUExecutionProvider" in onnxruntime.get_available_providers()'
            subprocess.run([sys.executable, '-I', '-B', '-c', check, str(site)], check=True, capture_output=True, timeout=60,
                           env={**os.environ, 'ORT_DISABLE_TELEMETRY': '1'})
            if event.is_set():
                raise StoreError('OCR_DOWNLOAD_CANCELLED', 'OCR download cancelled.', 409)
            site_hashes = {str(path.relative_to(site)): hashlib.sha256(path.read_bytes()).hexdigest()
                           for path in site.rglob('*') if path.is_file()}
            (stage / 'ready.json').write_text(json.dumps({'manifest_hash': fingerprint(module), 'site_hashes': site_hashes}), encoding='utf-8')
            os.replace(stage, self._directory(module))
            with self.lock:
                self.states.pop(module_id, None)
            return {'status': 'ready', 'module_id': module_id}
        except Exception as exc:
            with self.lock:
                self.states[module_id] = {'status': 'error', 'error': exc.code if isinstance(exc, StoreError) else 'OCR_INSTALL_FAILED'}
            raise StoreError('OCR_INSTALL_FAILED', 'OCR installation failed; no partial runtime was activated.', 422)
        finally:
            session.close()
            self.download_events.pop(module_id, None)
            if stage.exists():
                shutil.rmtree(stage)

    def remove(self, module_id):
        with self._module_file_lock(module_id, exclusive=True):
            return self._remove_locked(module_id)

    def _remove_locked(self, module_id):
        module = self._module(module_id)
        with self.lock:
            if self.active.get(module_id) or self.states.get(module_id, {}).get('status') == 'downloading':
                raise StoreError('OCR_BUSY', 'Cancel or finish OCR tasks before removing this module.', 409)
            self.states[module_id] = {'status': 'removing'}
            try:
                directory = self._directory(module)
                if directory.exists():
                    shutil.rmtree(directory)
                for entry in module['files']:
                    safe_path(self.root, 'downloads/' + entry['sha256']).unlink(missing_ok=True)
                self.states.pop(module_id, None)
            except Exception:
                self.states[module_id] = {'status': 'error', 'error': 'OCR_REMOVE_FAILED'}
                raise
        return {'module_id': module_id, 'status': 'not_installed'}

    def start_install(self, module_id, preview_hash):
        if not self.allow_download:
            raise StoreError('OCR_DOWNLOAD_DISABLED', 'OCR downloads require explicit operator authorization.', 403)
        if self.preview(module_id)['preview_hash'] != preview_hash:
            raise StoreError('OCR_PREVIEW_CHANGED', 'Review the exact download manifest again.', 409)
        module = self._module(module_id)
        self._validate_runtime(module)
        if (self._directory(module) / 'ready.json').is_file():
            # A repeated request must not mark an in-use, ready module downloading.
            with self.runtime_lease(module_id):
                return {'module_id': module_id, 'status': 'ready'}
        with self.lock:
            if self.active.get(module_id) or self.states.get(module_id, {}).get('status') in ('downloading', 'removing'):
                raise StoreError('OCR_BUSY', 'The module is in use.', 409)
            self.states[module_id] = {'status': 'downloading', 'downloaded_bytes': 0}
            self.download_events[module_id] = threading.Event()
            def work():
                try:
                    self.install(module_id, preview_hash, _reserved=True)
                except Exception:
                    pass  # install records a stable public error without leaking local paths.
            thread = threading.Thread(target=work, name='optional-ocr-install', daemon=True)
            self.download_threads[module_id] = thread
            thread.start()
        return {'module_id': module_id, 'status': 'downloading'}

    def cancel_install(self, module_id):
        self._module(module_id)
        with self.lock:
            event = self.download_events.get(module_id)
            if event:
                event.set()
        return {'module_id': module_id, 'cancel_requested': event is not None}

    def close(self):
        for event in list(self.download_events.values()):
            event.set()
        for thread in list(self.download_threads.values()):
            thread.join(timeout=2)
