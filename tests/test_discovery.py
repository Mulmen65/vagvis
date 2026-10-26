"""Regression for stale root files shadowing unittest discovery in an updated repo."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class DiscoveryIsolationTests(unittest.TestCase):
    def test_explicit_top_level_and_package_ignore_legacy_root_test(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            tests = root / 'tests'
            tests.mkdir()
            (root / 'test_underlag.py').write_text('LEGACY_COPY = True\n')
            (tests / 'test_a_path.py').write_text(
                'from pathlib import Path\nimport sys\n'
                'sys.path.insert(0, str(Path(__file__).resolve().parents[1]))\n')
            (tests / 'test_underlag.py').write_text(
                'from pathlib import Path\nimport unittest\n'
                'class CorrectLocation(unittest.TestCase):\n'
                '    def test_location(self):\n'
                '        self.assertEqual(Path(__file__).parent.name, "tests")\n')
            base = [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests']
            before = subprocess.run(base, cwd=root, text=True, capture_output=True, timeout=30)
            self.assertNotEqual(before.returncode, 0)
            self.assertIn('incorrectly imported from', before.stderr)
            (tests / '__init__.py').write_text('"""Isolated test package."""\n')
            after = subprocess.run(base + ['-t', '.'], cwd=root, text=True,
                                   capture_output=True, timeout=30)
            self.assertEqual(after.returncode, 0, after.stdout + after.stderr)
            self.assertIn('Ran 1 test', after.stderr)

    def test_all_packaged_workflows_use_explicit_test_top_level(self):
        root = Path(__file__).resolve().parents[1]
        self.assertTrue((root / 'tests/__init__.py').is_file())
        workflows = root / '.github/workflows'
        found = []
        for path in workflows.glob('*.yml'):
            for line in path.read_text().splitlines():
                if 'python -m unittest discover ' in line:
                    self.assertIn('-s tests -t .', line, str(path))
                    found.append(path.name)
        self.assertEqual(set(found), {'hamta-korstrackeindikatorer.yml', 'kontroller.yml',
                                      'hamta-underlag.yml', 'bygg-landmask.yml'})


if __name__ == '__main__':
    unittest.main()
