from pathlib import Path
import json
import re
import subprocess
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[3]

# Names a Windows checkout cannot create: reserved characters, reserved device names, trailing dot/space.
WINDOWS_INVALID = re.compile(r'[<>:"|?*\\\x00-\x1f]|^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$|[. ]$', re.I)


class ReadFlowCiTests(unittest.TestCase):
    def test_ci_is_readonly_branch_only_bounded_and_has_no_release(self):
        directory = ROOT / '.github/workflows'
        self.assertEqual(sorted(p.name for p in directory.glob('*.yml')), ['readflow-ci.yml', 'readflow-windows.yml'])
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

    def test_lock_links_every_workspace_for_npm_ci(self):
        # The first GitHub run failed in `npm ci` because three workspace links were missing.
        lock = json.loads((ROOT / 'package-lock.json').read_text())['packages']
        for pattern in json.loads((ROOT / 'package.json').read_text())['workspaces']:
            for manifest in sorted(ROOT.glob(pattern + '/package.json')):
                path = manifest.parent.relative_to(ROOT).as_posix()
                package = json.loads(manifest.read_text())
                self.assertIn(path, lock)
                self.assertEqual(lock[path].get('version'), package.get('version'), path)
                self.assertEqual(lock.get('node_modules/' + package['name']), {'resolved': path, 'link': True}, path)

    def test_windows_build_is_manual_private_and_publishes_nothing(self):
        # The user asked for a protected Windows installer for a few colleagues: manual runs only,
        # read-only token, no secrets, no release; the installer is a short-lived private artifact.
        source = (ROOT / '.github/workflows/readflow-windows.yml').read_text()
        workflow = yaml.safe_load(source)
        self.assertEqual(workflow['on'], {'workflow_dispatch': {}})
        self.assertEqual(workflow['permissions'], {'contents': 'read'})
        for value in ['secrets.', 'action-gh-release', 'gh release', 'npm publish', '--publish always', 'docker ']:
            self.assertNotIn(value, source)
        self.assertIn('--publish never', source)
        steps = workflow['jobs']['windows']['steps']
        uploads = [step for step in steps if step.get('uses', '').startswith('actions/upload-artifact')]
        self.assertEqual(len(uploads), 1)
        self.assertLessEqual(uploads[0]['with']['retention-days'], 7)
        names = ' '.join(step.get('name', '') for step in steps)
        for required in ['Protect Python', 'Protect JavaScript', 'Verify protection', 'Licence notices']:
            self.assertIn(required, names)

    def test_every_path_checks_out_on_windows(self):
        # The first Windows run failed in actions/checkout on a stray ':memory:.ses' at the repository root.
        try:
            listed = subprocess.run(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=ROOT,
                                    capture_output=True, check=True).stdout.decode()
        except (OSError, subprocess.CalledProcessError):
            self.skipTest('not a git work tree')
        paths = [p for p in listed.split('\0') if p]
        bad = [p for p in paths if any(WINDOWS_INVALID.search(part) for part in p.split('/'))]
        self.assertEqual(bad, [])
        folded = {}
        for path in paths:
            folded.setdefault(path.lower(), []).append(path)
        self.assertEqual([v for v in folded.values() if len(v) > 1], [])

