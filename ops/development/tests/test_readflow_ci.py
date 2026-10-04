from pathlib import Path
import json
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[3]


class ReadFlowCiTests(unittest.TestCase):
    def test_ci_is_readonly_branch_only_bounded_and_has_no_release(self):
        directory = ROOT / '.github/workflows'
        self.assertEqual([p.name for p in directory.glob('*.yml')], ['readflow-ci.yml'])
        workflow = yaml.safe_load((directory / 'readflow-ci.yml').read_text())
        self.assertEqual(workflow['on']['push'], {'branches': ['checkpoint-20261001']})
        self.assertEqual(workflow['permissions'], {'contents': 'read'})
        for job in workflow['jobs'].values():
            self.assertGreater(job['timeout-minutes'], 0)
            self.assertTrue(job['concurrency']['cancel-in-progress'])
            self.assertEqual(job['if'], "github.ref_type != 'tag'")
        source = (directory / 'readflow-ci.yml').read_text()
        for value in ['secrets.', 'cargo ', 'docker ', 'packages/reader', 'release-desktop']:
            self.assertNotIn(value, source)

    def test_job_commands_and_workspace_lock(self):
        root = json.loads((ROOT / 'package.json').read_text())
        lock = json.loads((ROOT / 'package-lock.json').read_text())
        self.assertEqual(root['workspaces'], lock['packages']['']['workspaces'])
        web = json.loads((ROOT / 'frontend/web/package.json').read_text())
        for script in ['typecheck', 'build', 'test', 'prepare:workspace']:
            self.assertIn(script, web['scripts'])
        self.assertIn('--test-concurrency=2', web['scripts']['test'])
        desktop = json.loads((ROOT / 'frontend/desktop/package.json').read_text())
        self.assertIn('--test-concurrency=2', desktop['scripts']['test'])
