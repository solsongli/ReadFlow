"""Synthetic integration tests; no model installation, credential or network access."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(ROOT / 'backend'))
sys.path.insert(0, str(ROOT / 'backend/pipeline'))
import fitz
from library_mvp.ocr_modules import OcrModules
from library_mvp.store import StoreError
from retainpdf_pipeline.foundation.shared.job_dirs import ensure_job_dirs, resolve_job_dirs
from retainpdf_pipeline.ocr.ocr_provider.local_cpu_driver import run_local_cpu_ocr_to_job_dir
from retainpdf_pipeline.ocr.ocr_provider.drivers import run_registered_ocr_provider


class LocalCpuTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.dirs = ensure_job_dirs(resolve_job_dirs(self.root/'job'))
        self.source = self.dirs.source_dir/'fixture.pdf'
        self.args = SimpleNamespace(**{key:str(getattr(self.dirs,key)) for key in ('source_dir','ocr_dir','translated_dir','rendered_dir','artifacts_dir','logs_dir')},
                                    job_root=str(self.dirs.root), file_path=str(self.source), provider='local')
    def tearDown(self):
        self.tmp.cleanup()
    def pdf(self, lines, *, rotation=0):
        with fitz.open() as pdf:
            for line in lines:
                page=pdf.new_page(width=300,height=600)
                if line:
                    page.insert_text((35,65),line)
                page.set_rotation(rotation)
            pdf.save(self.source)

    def test_registered_local_native_requires_no_module_token_command_or_network(self):
        self.pdf(['native pipeline text'], rotation=90)
        with patch.dict(os.environ, {'RETAIN_LOCAL_OCR_ROOT':'', 'RETAIN_LOCAL_OCR_COMMAND':'must never execute'}), patch('library_mvp.ocr_modules.OcrModules.runtime_lease', side_effect=AssertionError('no model for text')), patch('subprocess.Popen', side_effect=AssertionError('no command')), patch('socket.create_connection',side_effect=AssertionError('offline')):
            result=run_registered_ocr_provider('local', self.args, paddle_driver=lambda args: self.fail('remote fallback'))
        payload=json.loads(result.normalized_json_path.read_text())
        self.assertEqual(payload['source']['provider'],'local')
        self.assertEqual(payload['source']['sha256'],hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.assertEqual(payload['pages'][0]['blocks'][0]['text'],'native pipeline text')
        self.assertEqual(payload['pages'][0]['metadata']['rotation'],90)
        self.assertEqual((payload['pages'][0]['width'],payload['pages'][0]['height']),(300,600))
        self.assertTrue(payload['pages'][0]['blocks'][0]['policy']['translate'])
        self.assertTrue(result.normalized_report_json_path.is_file())

    def test_loaded_config_routes_legacy_rust_worker_to_builtin_python_driver(self):
        import retainpdf_pipeline.ocr.ocr_provider_config as config
        import retainpdf_pipeline.ocr.ocr_provider.drivers as drivers
        # local_command is the existing Rust provider-stage routing tag. It does
        # not authorize a command: the Python registry reserves local for CPU OCR.
        with patch.dict(os.environ, {'RETAIN_OCR_PROVIDER_CONFIG':str(ROOT/'backend/config/ocr_providers.json'),
                                     'RETAIN_LOCAL_OCR_COMMAND':'must never execute'}):
            config._load_ocr_provider_config.cache_clear()
            try:
                definition = config.ocr_provider_definition('local')
                self.assertEqual(definition['kind'], 'local_command')
                self.assertIsNone(definition['credential'])
                self.assertEqual(definition['options'], {})
                self.assertIn('local', config.configured_command_providers())
                with patch.object(drivers, '_CONFIG_DISCOVERY_DONE', False):
                    drivers.discover_configured_ocr_provider_drivers()
                self.assertIs(drivers._PROVIDER_DRIVERS['local'], run_local_cpu_ocr_to_job_dir)
                self.pdf(['builtin despite legacy routing tag'])
                with patch('subprocess.Popen',side_effect=AssertionError('external command forbidden')):
                    result = drivers.run_registered_ocr_provider('local',self.args,paddle_driver=lambda args:self.fail('online fallback'))
                self.assertEqual(json.loads(result.normalized_json_path.read_text())['source']['provider'],'local')
            finally:
                config._load_ocr_provider_config.cache_clear()

    def test_scan_not_installed_has_actionable_chinese_error(self):
        self.pdf([''])
        with patch.dict(os.environ, {'RETAIN_LOCAL_OCR_ROOT':str(self.root/'modules')}), patch('socket.create_connection',side_effect=AssertionError('offline')):
            with self.assertRaisesRegex(RuntimeError,'设置 → OCR.*无需 Token'):
                run_local_cpu_ocr_to_job_dir(self.args)
        self.assertFalse((self.dirs.ocr_dir/'normalized/document.v1.json').exists())

    def test_mixed_pdf_native_first_scan_only_and_lease_released(self):
        self.pdf(['native text',''], rotation=90)
        entered=[]
        @contextmanager
        def lease(modules, identity):
            entered.append('open')
            try:
                yield {'parser_version':'ocr-v1-'+'a'*64}
            finally:
                entered.append('closed')
        seen=[]
        def engine(page,runtime,event):
            seen.append(page.number)
            self.assertEqual(page.rotation,0)
            return [{'text':'synthetic scan result','bbox':[10,400,100,420]}]
        with patch.dict(os.environ, {'RETAIN_LOCAL_OCR_ROOT':str(self.root/'modules')}), patch.object(OcrModules,'runtime_lease',lease),patch('library_mvp.ocr_jobs.run_page',side_effect=engine):
            result=run_local_cpu_ocr_to_job_dir(self.args)
        payload=json.loads(result.normalized_json_path.read_text())
        self.assertEqual(seen,[1])
        self.assertEqual(entered,['open','closed'])
        block=payload['pages'][1]['blocks'][0]
        self.assertEqual(block['bbox'],[10,400,100,420])
        self.assertEqual(block['metadata']['physical_page_number'],2)
        self.assertEqual(block['metadata']['text_source'],'ocr')

    def test_local_ocr_only_does_not_resolve_old_credentials(self):
        from retainpdf_pipeline.ocr.ocr_provider.provider_pipeline import _args_from_spec
        spec=MagicMock()
        spec.ocr.provider='local'
        spec.ocr.options={}
        spec.job.workflow='ocr'
        spec.translation.glossary_entries=[]
        with patch('retainpdf_pipeline.ocr.ocr_provider.provider_pipeline.resolve_credential_ref',side_effect=AssertionError('credential read')):
            args=_args_from_spec(spec)
        self.assertEqual((args.ocr_credential,args.api_key),('',''))

    def test_selected_pages_preserve_physical_indices_and_skip_unselected_scans(self):
        self.pdf(['', 'selected second page', 'unselected third page'])
        self.args.page_ranges = '2'
        with patch('library_mvp.ocr_modules.OcrModules.runtime_lease', side_effect=AssertionError('excluded scan must not OCR')):
            result = run_local_cpu_ocr_to_job_dir(self.args)
        document = json.loads(result.normalized_json_path.read_text())
        self.assertEqual(document['page_count'], 3)
        self.assertEqual(document['source']['selected_page_numbers'], [2])
        self.assertEqual(document['pages'][0]['blocks'], [])
        self.assertEqual(document['pages'][2]['blocks'], [])
        block = document['pages'][1]['blocks'][0]
        self.assertEqual(block['page_index'], 1)
        self.assertEqual(block['metadata']['physical_page_number'], 2)
        for invalid in ('0', '4', '3-1', '1;2', '1,'):
            self.args.page_ranges = invalid
            with self.assertRaisesRegex(RuntimeError, '页码范围'):
                run_local_cpu_ocr_to_job_dir(self.args)

    def test_original_ocr_only_finish_publishes_markdown_and_artifacts(self):
        from retainpdf_pipeline.ocr.ocr_provider.provider_pipeline import _finish_ocr_only_provider_job
        from retainpdf_pipeline.services.pipeline_shared.events import PipelineEventWriter, pipeline_event_writer_scope
        from retainpdf_pipeline.services.pipeline_shared.contracts import PIPELINE_SUMMARY_FILE_NAME
        self.pdf(['offline original workflow fixture'])
        result = run_local_cpu_ocr_to_job_dir(self.args)
        writer = PipelineEventWriter(job_id='fixture', job_root=self.dirs.root, logs_dir=self.dirs.logs_dir, workflow='ocr', provider='local')
        with patch('socket.create_connection',side_effect=AssertionError('offline')), patch('builtins.print'), pipeline_event_writer_scope(writer):
            _finish_ocr_only_provider_job(job_dirs=self.dirs, source_pdf_path=self.source,
                layout_json_path=result.provider_result_json_path, normalized_json_path=result.normalized_json_path,
                normalization_report_path=result.normalized_report_json_path, event_writer=writer,
                provider='local', stage_spec_schema_version='provider.stage.v1')
        summary = json.loads((self.dirs.artifacts_dir / PIPELINE_SUMMARY_FILE_NAME).read_text())
        markdown = Path(summary['markdown'])
        self.assertTrue(markdown.is_file())
        self.assertIn('offline original workflow fixture', markdown.read_text())
        self.assertTrue(Path(summary['normalized_document_json']).is_file())
        self.assertIn('finished', writer.path.read_text())

    def test_cross_process_lease_blocks_remove_and_releases_on_exit(self):
        manifest=self.root/'manifest.json'
        manifest.write_text(json.dumps({'modules':[{'id':'test','files':[]}]}))
        module_root=self.root/'modules'
        modules=OcrModules(module_root,manifest)
        script='''import sys,time
from pathlib import Path
from library_mvp.ocr_modules import OcrModules
modules=OcrModules(Path(sys.argv[1]),Path(sys.argv[2]))
modules.runtime=lambda identity: {'parser_version':'fixture'}
with modules.runtime_lease('test'):
 print('leased',flush=True)
 time.sleep(20)
'''
        process=subprocess.Popen([sys.executable,'-B','-c',script,str(module_root),str(manifest)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,
                                 env={**os.environ,'PYTHONPATH':str(ROOT/'backend')})
        try:
            ready,_,_=select.select([process.stdout],[],[],8)
            self.assertTrue(ready,'lease process did not initialize')
            self.assertEqual(process.stdout.readline().strip(),'leased')
            with self.assertRaises(StoreError) as error:
                modules.remove('test')
            self.assertEqual(error.exception.code,'OCR_BUSY')
        finally:
            process.terminate()
            process.communicate(timeout=5)
        self.assertEqual(modules.remove('test')['status'],'not_installed')

    def test_lease_exception_releases_lock(self):
        manifest=self.root/'manifest.json'
        manifest.write_text(json.dumps({'modules':[{'id':'test','files':[]}]}))
        modules=OcrModules(self.root/'modules',manifest)
        with patch.object(modules,'runtime',return_value={}):
            with self.assertRaisesRegex(ValueError,'fixture'):
                with modules.runtime_lease('test'):
                    raise ValueError('fixture')
        self.assertEqual(modules.remove('test')['status'],'not_installed')


if __name__=='__main__':
    unittest.main()
