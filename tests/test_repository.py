"""Lightweight repository and metadata checks; no Home Assistant runtime required."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
INTEGRATION = ROOT / "custom_components" / "smartify_energy_row"

class RepositoryChecks(unittest.TestCase):
    def test_manifest_hacs_and_resource(self):
        manifest = json.loads((INTEGRATION / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["domain"], "smartify_energy_row")
        self.assertRegex(manifest["version"], r"^\d+\.\d+\.\d+$")
        self.assertTrue(manifest["config_flow"])
        self.assertTrue((INTEGRATION / "frontend" / "smartify-energy-row.js").is_file())
        self.assertTrue((ROOT / "hacs.json").is_file())

    def test_json_translations_are_valid(self):
        for path in [INTEGRATION / "strings.json", * (INTEGRATION / "translations").glob("*.json")]:
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertIn("config", data, path.name)

    def test_no_secrets_in_shipping_code_or_documentation(self):
        # JWT-looking three-segment token, plus typical authentication patterns.
        candidates = [*INTEGRATION.rglob("*"), ROOT / "README.md", ROOT / "AGENTS.md"]
        for path in candidates:
            if not path.is_file() or path.suffix in {".pyc", ".png", ".jpg"}:
                continue
            content = path.read_text(encoding="utf-8")
            self.assertIsNone(re.search(r"eyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{10,}",content), str(path))
            self.assertNotIn("Bearer eyJ",content, str(path))

    def test_resource_path_is_stable(self):
        ns = {}
        exec((INTEGRATION / "const.py").read_text(encoding="utf-8"), ns)
        self.assertEqual(ns["RESOURCE_PATH"], "/smartify_energy_row/smartify-energy-row.js")

if __name__ == "__main__":
    unittest.main()
