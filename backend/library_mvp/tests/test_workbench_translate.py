"""Translation commands using real synthetic PDFs and mocked native HTTP, never a model."""
import copy
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
import httpx
from backend.library_mvp.api import create_app
from backend.library_mvp.native_bridge import NativeBridge
from backend.library_mvp.tests.test_store import synthetic_pdf
from backend.library_mvp.workbench_translate import TranslationCommands
from backend.library_mvp.workbench_translation import summarize_jobs, TranslationStatus
from backend.library_mvp.workbench_translation_errors import translation_error, safe_detail

REPO = Path(__file__).resolve().parents[3]


def golden():
    result = subprocess.run(['node', '--import', './tests/helpers/register-jsx.mjs', 'tests/workbench/translation-golden.mjs'],
                            cwd=REPO / 'frontend/web', capture_output=True, check=True, text=True)
    return json.loads(result.stdout)


class TranslationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_upload_payload = golden()
        cls.payload = copy.deepcopy(cls.old_upload_payload)
        cls.payload["source"] = {}

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.temp.name))
        self.store = self.app.state.store
        upload = self.store.add_pdf(synthetic_pdf(['Synthetic readable paper']), filename='fixture.pdf')
        self.item, self.attachment = upload['item'], upload['attachment']
        self.submissions, self.jobs, self.cancels = [], [], []
        self.bridge = SimpleNamespace(document_jobs=lambda *_args, **_kw: copy.deepcopy(self.jobs),
            register=lambda *_args: {'reader_ready': True}, submit_translation=self.submit,
            translation_job=lambda _job: {'error': '401 invalid api_key: 演示凭据'}, cancel_translation=self.cancel)
        self.modules = SimpleNamespace(list=lambda: [{'status': 'ready'}])
        self.commands = self.app.state.translation_commands
        self.commands.bridge, self.commands.modules = self.bridge, self.modules

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def submit(self, digest, payload):
        self.submissions.append((digest, payload))
        return {'job_id': 'fixture-job'}

    def cancel(self, job):
        self.cancels.append(job)
        self.jobs = [{'job_id': job, 'workflow': 'book', 'status': 'cancelled'}]
        return {}

    def test_submission_is_structurally_identical_to_old_frontend_golden(self):
        result = self.commands.submit(self.item['id'], self.payload)
        self.assertEqual(result['translation']['status'], 'queued')
        self.assertEqual(self.submissions[0][0], self.attachment['sha256'])
        # Use boolean equality so a failing assertion never prints credential fields.
        bound = copy.deepcopy(self.submissions[0][1])
        bound["source"]["upload_id"] = "fixture-upload"  # Existing Rust document endpoint binds the stored upload.
        self.assertTrue(bound == self.old_upload_payload)
        self.assertEqual(self.payload['source'], {})  # Native endpoint binds the stored upload_id.
        self.assertEqual(self.payload['translation']['glossary_id'], 'fixture-glossary')

    def test_concurrent_and_eventually_consistent_duplicate_submissions_are_reused(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.commands.submit(self.item['id'], self.payload), range(4)))
        self.assertEqual(len(self.submissions), 1)
        self.assertEqual(sum(bool(r['reused']) for r in results), 3)

    def test_active_native_job_is_reused_after_restart_even_without_credentials(self):
        self.jobs = [{'job_id': 'existing-job', 'workflow': 'book', 'status': 'running'}]
        result = self.commands.submit(self.item['id'], {})
        self.assertTrue(result['reused'])
        self.assertEqual(self.submissions, [])

    def test_missing_configuration_never_registers_or_submits(self):
        for field in ['base_url', 'model', 'api_key']:
            body = copy.deepcopy(self.payload); body['translation'].pop(field)
            result = self.commands.submit(self.item['id'], body)
            self.assertEqual(result['error']['code'], 'unconfigured')
        self.assertEqual(self.submissions, [])

    def test_scan_requires_installed_module_native_text_does_not(self):
        self.modules.list = lambda: []
        self.assertIn('translation', self.commands.submit(self.item['id'], self.payload))
        upload = self.store.add_pdf(synthetic_pdf(['']), filename='scan.pdf')
        result = self.commands.submit(upload['item']['id'], self.payload)
        self.assertEqual(result['error']['settings'], 'ocr')
        self.assertEqual(len(self.submissions), 1)

    def test_cancel_uses_only_the_job_owned_by_the_attachment(self):
        self.jobs = [{'job_id': 'owned-job', 'status': 'running', 'workflow': 'book'}]
        self.commands.cancel(self.item['id'])
        self.assertEqual(self.cancels, ['owned-job'])

    def test_failed_job_is_redacted_and_classified(self):
        self.jobs = [{'job_id': 'failed-job', 'status': 'failed', 'workflow': 'book'}]
        result = self.commands.status(self.item['id'])
        self.assertEqual(result['translation']['error']['code'], 'credentials')
        self.assertNotIn('演示凭据', result['translation']['error']['details'])

    def test_rendering_is_not_prematurely_reported_as_done(self):
        job = {'job_id': 'j', 'status': 'running', 'workflow': 'book', 'stages': {'translation': {'state': 'completed'}, 'render': {'state': 'running', 'progress': {'percent': 17}}}}
        state = summarize_jobs([job])
        self.assertEqual((state['status'], state['stage'], state['percent']), ('running', 'render', 17))

    def test_errors_have_actionable_classes_and_no_secret(self):
        for raw, status, code in [('invalid', 401, 'credentials'), ('quota', 429, 'quota'), ('connect timeout', None, 'network'), ('model not found', 404, 'model'), ('OCR failed', None, 'ocr'), ('unknown', None, 'other')]:
            self.assertEqual(translation_error(raw, status)['code'], code)
        self.assertEqual(safe_detail('prefix 演示凭据 suffix', ['演示凭据']), 'prefix [已隐藏] suffix')

    def test_native_http_translate_and_cancel_use_original_routes(self):
        paths = []
        def handler(request):
            paths.append((request.method, request.url.path))
            if request.url.path.endswith('/translate'):
                self.assertTrue(json.loads(request.content) == self.payload)
            return httpx.Response(200, json={'code': 0, 'data': {'job_id': 'fixture-job'}})
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            bridge = NativeBridge('http://127.0.0.1:9', 'fixture', client=client)
            bridge.submit_translation(self.attachment['sha256'], self.payload)
            bridge.cancel_translation('fixture-job')
        self.assertEqual(paths, [('POST', f'/api/v1/documents/{self.attachment["sha256"]}/translate'), ('POST', '/api/v1/jobs/fixture-job/cancel')])

    def test_http_routes_submit_reuse_read_status_and_cancel(self):
        async def scenario():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://fixture.test") as client:
                path = f"/api/research/workbench/items/{self.item['id']}/translate"
                missing = await client.post(path, json={})
                self.assertEqual(missing.json()['error']['code'], 'unconfigured')
                first = await client.post(path, json=self.payload)
                self.assertEqual(first.status_code, 200)
                self.assertEqual(first.json()['translation']['job_id'], 'fixture-job')
                again = await client.post(path, json=self.payload)
                self.assertTrue(again.json()['reused'])
                self.assertEqual((await client.get(path)).json()['translation']['status'], 'queued')
                canceled = await client.post(path + '/cancel', json={})
                self.assertEqual(canceled.json()['translation']['error']['code'], 'cancelled')
        asyncio.run(scenario())

    def test_trash_and_registration_failure_cannot_submit(self):
        self.bridge.register = lambda *_args: {'reader_ready': False, 'native_bridge': {'message': 'registration unavailable'}}
        with self.assertRaises(Exception):
            self.commands.submit(self.item['id'], self.payload)
        self.app.state.workbench.set_trashed({'item_ids': [self.item['id']]}, True)
        with self.assertRaises(Exception):
            self.commands.submit(self.item['id'], self.payload)
        self.assertEqual(self.submissions, [])

    def test_busy_status_cache_expires_faster_than_idle_cache(self):
        clock = [0.0]
        calls = []
        def fetch(_digest):
            calls.append(1)
            return [{'workflow': 'book', 'status': 'running', 'job_id': 'j'}]
        status = TranslationStatus(fetch, clock=lambda: clock[0])
        try:
            status.states(['fixture']); clock[0] = 1; status.states(['fixture'])
            self.assertEqual(len(calls), 1)
            clock[0] = 3; status.states(['fixture']); self.assertEqual(len(calls), 2)
        finally:
            status.close()

    def test_partial_output_never_hides_running_or_failed_job(self):
        for status in ['running', 'failed']:
            summary = summarize_jobs([{'job_id': 'j', 'status': status, 'workflow': 'book', 'output_pdf_ready': True}])
            self.assertEqual(summary['status'], status)
