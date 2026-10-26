"""Adversarial checks for staged-byte privacy gates; no actual private data."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

GUARD = Path(__file__).resolve().parents[1] / 'scripts/check_private_material.py'

class PrivacyGateTests(unittest.TestCase):
    def run_case(self, files):
        with tempfile.TemporaryDirectory(prefix='privacy-gate-') as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '-q', directory], check=True)
            for name, data in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            subprocess.run(['git', '-C', directory, 'add', '--all'], check=True)
            return subprocess.run([sys.executable, str(GUARD)], cwd=directory, capture_output=True).returncode

    def test_rejects_staged_key(self):
        self.assertEqual(self.run_case({'config.txt': ('ghp_' + 'A' * 36).encode()}), 1)

    def test_rejects_unreviewed_image(self):
        self.assertEqual(self.run_case({'docs/capture.png': b'synthetic-image-bytes'}), 1)

    def test_accepts_reviewed_synthetic_bytes(self):
        image = b'synthetic-image-bytes'
        provenance = {'assets': {'docs/capture.png': {'sha256': hashlib.sha256(image).hexdigest(), 'category': 'synthetic-ui', 'reviewed_by': 'maintainer'}}}
        self.assertEqual(self.run_case({'docs/capture.png': image, '.privacy-assets.json': json.dumps(provenance).encode()}), 0)

    def test_rejects_stale_provenance_and_private_path(self):
        provenance = {'assets': {'private-captures/capture.png': {'sha256': '0' * 64, 'category': 'synthetic-ui', 'reviewed_by': 'maintainer'}}}
        self.assertEqual(self.run_case({'private-captures/capture.png': b'synthetic-image-bytes', '.privacy-assets.json': json.dumps(provenance).encode()}), 1)

if __name__ == '__main__':
    unittest.main()
