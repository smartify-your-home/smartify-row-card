"""Lightweight repository and metadata checks; no Home Assistant runtime required."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
INTEGRATION = ROOT / "custom_components" / "smartify_energy_row_card"

class RepositoryChecks(unittest.TestCase):
    def test_manifest_hacs_and_resource(self):
        manifest = json.loads((INTEGRATION / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["domain"], "smartify_energy_row_card")
        self.assertEqual(manifest["name"], "Smartify Energy Row Card")
        self.assertEqual(json.loads((ROOT / "hacs.json").read_text(encoding="utf-8"))["name"], manifest["name"])
        self.assertFalse((ROOT / "custom_components" / "smartify_energy_row").exists())
        self.assertEqual(len(list((ROOT / "custom_components").glob("*/manifest.json"))), 1)
        self.assertRegex(manifest["version"], r"^\d+\.\d+\.\d+$")
        self.assertTrue(manifest["config_flow"])
        js = (INTEGRATION / "frontend" / "smartify-energy-row-card.js")
        self.assertTrue(js.is_file())
        content = js.read_text(encoding="utf-8")
        self.assertIn('type: "smartify-energy-row-card"', content)
        self.assertIn('name: "Smartify Energy Row Card"', content)
        self.assertIn('customElements.define("smartify-energy-row-card"', content)
        self.assertIn("smartify_energy_row_card/get", content)
        self.assertIn("smartify_energy_row_card/save", content)
        self.assertIn("smartify_energy_row_card/save_profile", content)
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

    def test_services_are_described_and_translated(self):
        services = (INTEGRATION / "services.yaml").read_text(encoding="utf-8")
        for name in ("set_profile", "delete_profile"):
            self.assertIn(name + ":", services)
            for path in [INTEGRATION / "strings.json", INTEGRATION / "translations" / "de.json"]:
                self.assertIn(name, json.loads(path.read_text(encoding="utf-8"))["services"], path.name)

    def test_version_is_consistent_in_docs(self):
        version = json.loads((INTEGRATION / "manifest.json").read_text(encoding="utf-8"))["version"]
        self.assertIn(version, (ROOT / "RELEASE_NOTES.md").read_text(encoding="utf-8"))
        self.assertIn(f"?v={version}", (ROOT / "README.md").read_text(encoding="utf-8"))
        self.assertIn(f"Version: {version}", (INTEGRATION / "frontend" / "smartify-energy-row-card.js").read_text(encoding="utf-8"))

    def test_manifest_dependencies_and_cached_static_path(self):
        manifest = json.loads((INTEGRATION / "manifest.json").read_text(encoding="utf-8"))
        for dep in ("frontend", "http", "lovelace"):
            self.assertIn(dep, manifest["dependencies"])
        init = (INTEGRATION / "__init__.py").read_text(encoding="utf-8")
        # Versioned URL (?v=<version>) => long-lived cache is safe and intended.
        self.assertIn("StaticPathConfig(RESOURCE_PATH, str(_CARD), True)", init)
        self.assertIn('f"{RESOURCE_PATH}?v={_VERSION}"', init)
        self.assertNotIn("add_extra_js_url", init)

    def test_resource_path_is_stable(self):
        ns = {}
        exec((INTEGRATION / "const.py").read_text(encoding="utf-8"), ns)
        self.assertEqual(ns["RESOURCE_PATH"], "/smartify_energy_row_card/smartify-energy-row-card.js")

if __name__ == "__main__":
    unittest.main()
