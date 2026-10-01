"""Synthetic PDF / injected-engine tests; these do not claim real OCR accuracy."""
import hashlib
import io
import json
import zipfile
from pathlib import Path
import tempfile
import subprocess
import sys
import tarfile
import threading
import time
import unittest
from unittest.mock import patch
import fitz
from backend.library_mvp.store import Store, StoreError
from backend.library_mvp.ocr_jobs import OcrJobs
from backend.library_mvp.ocr_modules import OcrModules, safe_path


class FakeModules:
    def __init__(self):
        self.lock = threading.RLock()
        self.active = {}
    def runtime(self, identity):
        return {'parser_version': 'ocr-v1-' + 'a' * 64}


def pdf():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((72,72), 'Native evidence')
        doc.new_page()
        return doc.tobytes()


def wait(jobs, identity):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        job = jobs.get(identity)
        if job['status'] in ('completed', 'error', 'cancelled'):
            return job
        time.sleep(.01)
    raise AssertionError('OCR job timed out')


class OcrTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'library')
        self.attachment = self.store.add_pdf(pdf())['attachment']
        self.jobs = None
    def tearDown(self):
        if self.jobs:
            self.jobs.close()
        self.store.close()
        self.tmp.cleanup()

    def test_native_first_physical_bbox_cache_and_read_only_consumer(self):
        calls = []
        def engine(page, runtime, cancelled):
            calls.append(page.number)
            return [{'text': 'Synthetic OCR result', 'bbox': [10,20,100,40]}]
        self.jobs = OcrJobs(self.store, FakeModules(), page_runner=engine)
        first = wait(self.jobs, self.jobs.create(self.attachment['id'], 'fake')['id'])
        self.assertEqual(first['status'], 'completed')
        self.assertEqual(calls, [1])
        result = self.store.get_pages(self.attachment['id'])
        self.assertEqual(result['revision_id'], first['revision_id'])
        self.assertEqual(result['pages'][0]['text_source'], 'native')
        self.assertEqual(result['pages'][1]['physical_page_number'], 2)
        self.assertEqual(result['pages'][1]['blocks'][0]['bbox'], [10,20,100,40])
        self.assertEqual(self.store.get_pages(self.attachment['id'], prefer_ocr=False)['parse_status'], 'partial_needs_ocr')
        second = wait(self.jobs, self.jobs.create(self.attachment['id'], 'fake')['id'])
        self.assertTrue(second['cached'])
        self.assertEqual(calls, [1])
        self.assertEqual(self.store.ocr_revision(self.attachment['sha256'], 'ocr-v1-'+'b'*64), None)

    def test_failure_keeps_native_and_retry_resumes_completed_pages(self):
        calls = []
        def fail(page, runtime, event):
            calls.append(page.number)
            raise ValueError('sensitive local path')
        self.jobs = OcrJobs(self.store, FakeModules(), page_runner=fail)
        failed = wait(self.jobs, self.jobs.create(self.attachment['id'], 'fake')['id'])
        self.assertEqual(failed['status'], 'error')
        self.assertNotIn('sensitive', failed['error']['message'])
        self.assertEqual(failed['completed_pages'], 1)
        self.assertEqual(self.store.get_pages(self.attachment['id'])['parse_status'], 'partial_needs_ocr')
        self.jobs.page_runner = lambda *args: [{'text':'retry result','bbox':[0,0,40,20]}]
        retried = wait(self.jobs, self.jobs.retry(failed['id'])['id'])
        self.assertEqual(retried['status'], 'completed')
        self.assertEqual(retried['retry_of'], failed['id'])

    def test_cancel_never_publishes(self):
        entered = threading.Event()
        def slow(page, runtime, event):
            entered.set()
            event.wait(3)
            return [{'text':'cancelled','bbox':[0,0,40,20]}]
        self.jobs = OcrJobs(self.store, FakeModules(), page_runner=slow)
        job = self.jobs.create(self.attachment['id'], 'fake')
        self.assertTrue(entered.wait(3))
        self.jobs.cancel(job['id'])
        self.assertEqual(wait(self.jobs, job['id'])['status'], 'cancelled')
        self.assertEqual(self.store.ocr_revision(self.attachment['sha256']), None)

    def test_uninstalled_is_a_real_failure(self):
        manifest = Path(self.tmp.name) / 'manifest.json'
        manifest.write_text(json.dumps({'modules':[{'id':'test','files':[],'models':{}}]}))
        modules = OcrModules(Path(self.tmp.name) / 'modules', manifest)
        self.jobs = OcrJobs(self.store, modules)
        with self.assertRaises(StoreError) as error:
            self.jobs.create(self.attachment['id'], 'test')
        self.assertEqual(error.exception.code, 'OCR_NOT_READY')
        with patch('urllib.request.urlopen') as network:
            with self.assertRaises(StoreError) as error:
                modules.install('test', 'anything')
            self.assertEqual(error.exception.code, 'OCR_DOWNLOAD_DISABLED')
            network.assert_not_called()

    def test_bbox_validation_and_path_traversal(self):
        self.jobs = OcrJobs(self.store, FakeModules(), page_runner=lambda *args:[{'text':'bad','bbox':[0,0,float('nan'),2]}])
        failed = wait(self.jobs, self.jobs.create(self.attachment['id'], 'fake')['id'])
        self.assertEqual(failed['error']['code'], 'OCR_OUTPUT_INVALID')
        for path in ('../escape', '/absolute', 'a/../../escape', 'a\\escape'):
            with self.assertRaises(StoreError):
                safe_path(Path(self.tmp.name), path)

    def module_fixture(self, wheel_member='safe_package/__init__.py'):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            archive.writestr(wheel_member, '# synthetic fixture; never executed')
        artifacts = {'wheels/test.whl': stream.getvalue(), 'models/det': b'det', 'models/rec': b'rec', 'models/cls': b'cls'}
        module = {'id':'test','engine_version':'synthetic','model_version':'synthetic',
                  'models':{k:'models/'+k for k in ('det','rec','cls')},
                  'files':[{'path':path,'url':'https://example.invalid/'+path,'bytes':len(data),
                            'sha256':hashlib.sha256(data).hexdigest(),'kind':'wheel' if path.endswith('.whl') else 'model'}
                           for path,data in artifacts.items()]}
        manifest = Path(self.tmp.name) / 'fixture-manifest.json'
        manifest.write_text(json.dumps({'modules':[module]}))
        modules = OcrModules(Path(self.tmp.name) / 'fixture-modules', manifest, allow_download=True)
        def source(url, **kwargs):
            result = io.BytesIO(artifacts[url.removeprefix('https://example.invalid/')])
            result.geturl = lambda: url
            return result
        return modules, module, artifacts, source

    def test_install_conflict_clears_background_reservation(self):
        modules, manifest, artifacts, source = self.module_fixture()
        other = OcrModules(modules.root, modules.manifest_path, allow_download=True)
        preview = other.preview('test')['preview_hash']
        with modules._module_file_lock('test', exclusive=True):
            with self.assertRaises(StoreError) as error:
                other.install('test', preview)
            self.assertEqual(error.exception.code, 'OCR_BUSY')
            other.start_install('test', preview)
            other.download_threads['test'].join(timeout=3)
            self.assertFalse(other.download_threads['test'].is_alive())
            self.assertEqual(other.list()[0]['status'], 'error')
            self.assertEqual(other.list()[0]['error'], 'OCR_BUSY')
            self.assertNotIn('test', other.download_events)
        with patch.object(other, '_open_source', side_effect=source), patch('subprocess.run'):
            other.install('test', preview)
        self.assertEqual(other.list()[0]['status'], 'ready')

    def test_install_holds_exclusive_lock_until_activation(self):
        modules, manifest, artifacts, source = self.module_fixture()
        other = OcrModules(modules.root, modules.manifest_path, allow_download=True)
        attempts = []
        def guarded_source(url, **kwargs):
            for operation in (lambda: other.remove('test'),
                              lambda: other.install('test', other.preview('test')['preview_hash'])):
                with self.assertRaises(StoreError) as error:
                    operation()
                self.assertEqual(error.exception.code, 'OCR_BUSY')
                attempts.append('busy')
            return source(url, **kwargs)
        with patch.object(modules, '_open_source', side_effect=guarded_source), patch('subprocess.run'):
            modules.install('test', modules.preview('test')['preview_hash'])
        self.assertTrue(attempts)
        with modules.runtime_lease('test'):
            result = other.start_install('test', other.preview('test')['preview_hash'])
            self.assertEqual(result['status'], 'ready')
            self.assertEqual(other.list()[0]['status'], 'ready')
        self.assertEqual(other.remove('test')['status'], 'not_installed')

    def test_pinned_install_atomic_activation_and_remove_using_fake_streams(self):
        modules, manifest, artifacts, source = self.module_fixture()
        preview = modules.preview('test')
        self.assertEqual(preview['total_bytes'], sum(map(len, artifacts.values())))
        with patch.object(modules, '_open_source', side_effect=source), patch('subprocess.run') as process:
            modules.install('test', preview['preview_hash'])
        self.assertEqual(modules.list()[0]['status'], 'ready')
        self.assertEqual(process.call_count, 1)
        runtime = modules.runtime('test')
        self.assertEqual(set(runtime['models']), {'det','rec','cls'})
        self.assertTrue(Path(runtime['site'], 'safe_package/__init__.py').is_file())
        self.assertEqual(modules.remove('test')['status'], 'not_installed')

    def test_transient_download_failure_retries_pinned_source_without_double_progress(self):
        import urllib.error
        modules, manifest, artifacts, source = self.module_fixture()
        attempts = []
        def interrupted(url, **kwargs):
            attempts.append(url)
            if len(attempts) == 1:
                raise urllib.error.URLError('synthetic TLS failure')
            return source(url, **kwargs)
        with patch.object(modules, '_open_source', side_effect=interrupted), patch('subprocess.run'):
            modules.install('test', modules.preview('test')['preview_hash'])
        self.assertEqual(attempts[0], attempts[1])
        self.assertEqual(len(attempts), len(artifacts) + 1)
        self.assertEqual(modules.list()[0]['status'], 'ready')

    def test_download_retries_are_bounded_and_leave_no_partial_activation(self):
        import urllib.error
        modules, manifest, artifacts, source = self.module_fixture()
        with patch.object(modules, '_open_source', side_effect=urllib.error.URLError('synthetic')) as network, patch('subprocess.run') as process:
            with self.assertRaises(StoreError):
                modules.install('test', modules.preview('test')['preview_hash'])
        self.assertEqual(network.call_count, 3)
        process.assert_not_called()
        self.assertEqual(modules.list()[0]['error'], 'OCR_DOWNLOAD_UNAVAILABLE')
        self.assertFalse(list(modules.root.glob('.ocr-stage-*')))

    def test_verified_download_cache_resumes_and_remove_clears_only_module_files(self):
        modules, manifest, artifacts, source = self.module_fixture()
        missing = 'https://example.invalid/models/rec'
        def unavailable(url, **kwargs):
            if url == missing:
                import urllib.error
                raise urllib.error.URLError('synthetic unavailable source')
            return source(url, **kwargs)
        with patch.object(modules, '_open_source', side_effect=unavailable), patch('subprocess.run'):
            with self.assertRaises(StoreError):
                modules.install('test', modules.preview('test')['preview_hash'])
        cache = modules.root / 'downloads'
        self.assertEqual(len(list(cache.iterdir())), 2)
        requested = []
        def recovered(url, **kwargs):
            requested.append(url)
            return source(url, **kwargs)
        with patch.object(modules, '_open_source', side_effect=recovered), patch('subprocess.run'):
            modules.install('test', modules.preview('test')['preview_hash'])
        self.assertEqual(requested, ['https://example.invalid/models/rec', 'https://example.invalid/models/cls'])
        modules.remove('test')
        self.assertFalse(list(cache.iterdir()))
        self.assertTrue(self.store.attachment_path(self.attachment['id']).is_file())

    def test_download_session_never_uses_netrc_or_forwards_origin_authorization(self):
        import requests
        from backend.library_mvp.ocr_modules import _DownloadSession
        with _DownloadSession() as session, patch('requests.sessions.get_netrc_auth', side_effect=AssertionError('private credential access')) as netrc:
            request = session.prepare_request(requests.Request('GET', 'https://example.invalid/artifact'))
            self.assertNotIn('Authorization', request.headers)
            request.headers['Authorization'] = 'synthetic-secret'
            session.rebuild_auth(request, None)
            self.assertNotIn('Authorization', request.headers)
            netrc.assert_not_called()

    def test_hash_failure_never_activates(self):
        modules, manifest, artifacts, source = self.module_fixture()
        artifacts['models/det'] = b'BAD'
        with patch.object(modules, '_open_source', side_effect=source), patch('subprocess.run') as process:
            with self.assertRaises(StoreError):
                modules.install('test', modules.preview('test')['preview_hash'])
        process.assert_not_called()
        self.assertEqual(modules.list()[0]['status'], 'error')
        self.assertFalse((modules._directory(manifest) / 'ready.json').exists())
        self.assertFalse(list(modules.root.glob('.ocr-stage-*')))

    def test_archive_traversal_never_extracts_or_activates(self):
        modules, manifest, artifacts, source = self.module_fixture('../../escaped.py')
        with patch.object(modules, '_open_source', side_effect=source), patch('subprocess.run') as process:
            with self.assertRaises(StoreError):
                modules.install('test', modules.preview('test')['preview_hash'])
        process.assert_not_called()
        self.assertEqual(modules.list()[0]['error'], 'UNSAFE_OCR_PATH')
        self.assertFalse((Path(self.tmp.name) / 'escaped.py').exists())

    def test_cancel_download_never_activates(self):
        modules, manifest, artifacts, source = self.module_fixture()
        def cancelled_source(url, **kwargs):
            modules.cancel_install('test')
            return source(url)
        with patch.object(modules, '_open_source', side_effect=cancelled_source), patch('subprocess.run') as process:
            with self.assertRaises(StoreError):
                modules.install('test', modules.preview('test')['preview_hash'])
        process.assert_not_called()
        self.assertEqual(modules.list()[0]['error'], 'OCR_DOWNLOAD_CANCELLED')
        self.assertFalse((modules._directory(manifest) / 'ready.json').exists())

    def test_text_limit_failed_page_cannot_bypass_limit_on_retry(self):
        self.jobs = OcrJobs(self.store, FakeModules(), page_runner=lambda *args:[{'text':'x'*100,'bbox':[0,0,40,20]}])
        with patch('backend.library_mvp.ocr_jobs.MAX_EXTRACTED_CHARACTERS', 40):
            first = wait(self.jobs, self.jobs.create(self.attachment['id'], 'fake')['id'])
            second = wait(self.jobs, self.jobs.retry(first['id'])['id'])
        self.assertEqual(first['error']['code'], 'OCR_TEXT_LIMIT')
        self.assertEqual(second['error']['code'], 'OCR_TEXT_LIMIT')
        self.assertEqual(second['completed_pages'], 1)
        self.assertEqual(self.store.ocr_revision(self.attachment['sha256']), None)

    def test_source_archive_is_copied_without_executing_setup(self):
        modules, manifest, artifacts, source = self.module_fixture()
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as archive:
            for name, content in [('antlr-4.9.3/src/antlr4/__init__.py', b'# fixture'),
                                  ('antlr-4.9.3/src/antlr4_python3_runtime.egg-info/PKG-INFO', b'Name: antlr4-python3-runtime\nVersion: 4.9.3'),
                                  ('antlr-4.9.3/setup.py', b'raise RuntimeError("must not execute")')]:
                member = tarfile.TarInfo(name)
                member.size = len(content)
                archive.addfile(member, io.BytesIO(content))
        data = artifacts['sources/antlr.tar.gz'] = stream.getvalue()
        manifest['files'].append({'path':'sources/antlr.tar.gz','url':'https://example.invalid/sources/antlr.tar.gz',
                                 'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),
                                 'kind':'python_source','extract_prefix':'antlr-4.9.3/src/'})
        modules.manifest_path.write_text(json.dumps({'modules':[manifest]}))
        with patch.object(modules, '_open_source', side_effect=source), patch('subprocess.run'):
            modules.install('test', modules.preview('test')['preview_hash'])
        site = Path(modules.runtime('test')['site'])
        self.assertTrue((site/'antlr4/__init__.py').exists())
        self.assertFalse((site/'setup.py').exists())
        self.assertTrue((site/'antlr4_python3_runtime.egg-info/PKG-INFO').exists())
        (site/'antlr4/__init__.py').write_text('modified')
        with self.assertRaises(StoreError) as error:
            modules.runtime('test')
        self.assertEqual(error.exception.code, 'OCR_INTEGRITY_FAILURE')

    def test_rapidocr_v3_worker_adapter_and_download_guard_with_fake_package(self):
        site = Path(self.tmp.name) / 'fake-site'
        package = site / 'rapidocr'
        (package/'utils').mkdir(parents=True)
        (site/'onnxruntime.py').write_text('import os\nassert os.environ.get("ORT_DISABLE_TELEMETRY") == "1"\ndisabled = False\ndef disable_telemetry_events():\n global disabled\n disabled = True\n')
        (package/'utils/download_file.py').write_text('class DownloadFile: pass')
        (package/'__init__.py').write_text(
            'from types import SimpleNamespace\n'
            'import onnxruntime\nassert onnxruntime.disabled\n'
            'EngineType = ModelType = OCRVersion = str\n'
            'class RapidOCR:\n'
            ' def __init__(self, params):\n'
            '  assert params["Det.ocr_version"] == "PP-OCRv5"\n'
            '  assert params["Cls.ocr_version"] == "PP-OCRv4"\n'
            '  assert params["EngineConfig.onnxruntime.use_cuda"] is False\n'
            ' def __call__(self, image):\n'
            '  if image == "attempt-download":\n'
            '   from .utils.download_file import DownloadFile\n'
            '   DownloadFile.run(None)\n'
            '  return SimpleNamespace(boxes=[[[1,2],[5,2],[5,8],[1,8]]], txts=["fixture"], scores=[.9])\n')
        model = Path(self.tmp.name) / 'fake.onnx'
        model.write_bytes(b'fixture, not a model')
        payload = {'site':str(site),'models':dict.fromkeys(('det','rec','cls'),str(model)), 'image':'fake'}
        worker = Path(__file__).resolve().parents[1] / 'ocr_worker.py'
        result = subprocess.run([sys.executable,'-I','-B',str(worker)], input=json.dumps(payload), text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(result.stdout)['blocks'][0]['bbox'], [1,2,5,8])
        self.assertTrue(json.loads(result.stdout)['telemetry_opt_out'])
        payload['image'] = 'attempt-download'
        result = subprocess.run([sys.executable,'-I','-B',str(worker)], input=json.dumps(payload), text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(result.stdout)['error']['code'], 'OCR_BUNDLE_INCOMPLETE')

    def test_rotated_scan_uses_unrotated_pdf_coordinates(self):
        with fitz.open() as doc:
            page = doc.new_page(width=300, height=600)
            page.set_rotation(90)
            attachment = self.store.add_pdf(doc.tobytes())['attachment']
        def engine(page, runtime, event):
            self.assertEqual(page.rotation, 0)
            return [{'text':'rotated fixture','bbox':[20,400,200,500]}]
        self.jobs = OcrJobs(self.store, FakeModules(), page_runner=engine)
        job = wait(self.jobs, self.jobs.create(attachment['id'], 'fake')['id'])
        self.assertEqual(job['status'], 'completed')
        page = self.store.get_pages(attachment['id'])['pages'][0]
        self.assertEqual((page['width'],page['height'],page['rotation']), (300,600,90))
        with fitz.open(self.store.attachment_path(attachment['id'])) as doc:
            self.assertEqual(doc[0].rotation, 90)

    def test_restart_marks_interrupted_job_retryable(self):
        self.jobs = OcrJobs(self.store, FakeModules(), page_runner=lambda *args: [])
        self.jobs._save({'id':'interrupted','status':'running'})
        self.jobs.close()
        self.jobs = OcrJobs(self.store, FakeModules(), page_runner=lambda *args: [])
        self.assertEqual(self.jobs.get('interrupted')['error']['code'], 'OCR_INTERRUPTED')


if __name__ == '__main__':
    unittest.main()
