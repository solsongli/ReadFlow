"""Import/start the sidecar from a synthetic packaged layout, without repo sys.path."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class PackagedLocalRuntimeTests(unittest.TestCase):
    def test_packaged_sidecar_starts_without_source_namespace(self):
        backend = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(prefix='retain-packaged-local-') as temporary:
            root = Path(temporary)
            service = root / 'resources' / 'backend' / 'research-library'
            ai = service.parent / 'ai_service'
            shutil.copytree(backend / 'library_mvp', service / 'library_mvp',
                            ignore=shutil.ignore_patterns('tests', '__pycache__', '*.pyc'))
            shutil.copytree(backend / 'ai' / 'retainpdf_ai', ai / 'retainpdf_ai',
                            ignore=shutil.ignore_patterns('tests', '__pycache__', '*.pyc'))
            code = '''
import asyncio, pathlib, sys
service, ai, data = map(pathlib.Path, sys.argv[1:])
sys.path.insert(0, str(service))
from library_mvp.api import create_app
from library_mvp import ai_runtime
import retainpdf_ai
assert pathlib.Path(retainpdf_ai.__file__).resolve().is_relative_to(ai.resolve())
app = create_app(data)
async def check():
    async with app.router.lifespan_context(app):
        modules = app.state.ocr_modules.list()
        assert modules[0]['builtin'] is True
        assert modules[0]['download_enabled'] is False
        assert modules[1]['status'] == 'not_installed'
        assert app.state.ocr_modules.allow_download is False
asyncio.run(check())
print('packaged_sidecar_import_and_lifecycle=ok')
'''
            result = subprocess.run([sys.executable, '-I', '-B', '-c', code, str(service),
                                     str(ai), str(root / 'synthetic-data')], cwd=root,
                                    capture_output=True, text=True, timeout=25)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('packaged_sidecar_import_and_lifecycle=ok', result.stdout)


if __name__ == '__main__':
    unittest.main()
