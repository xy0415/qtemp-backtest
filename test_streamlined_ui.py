"""Structural regression tests for the streamlined application contract."""
import unittest
from pathlib import Path
from app import app

class StreamlinedUiTests(unittest.TestCase):
    def test_primary_navigation_and_legacy_hashes(self):
        js=Path("platform_navigation.js").read_text(encoding="utf-8")
        self.assertIn("routes.filter(r=>!['zones','resources'].includes(r[0]))",js)
        self.assertIn("['zones','區間統計']",js)
        self.assertIn("if(key==='zones'){go('zones');return;}",js)
        self.assertIn("dataset.go='resources'",js)
    def test_single_source_of_truth_for_current_features(self):
        js=Path("research_features.js").read_text(encoding="utf-8")
        self.assertNotIn("extra-strategy-go",js)
        self.assertNotIn("extra-compare-go",js)
        self.assertNotIn("extra-watch-go",js)
        with app.test_client() as client:
            for old in ("strategy","compare_assets"):
                self.assertEqual(client.post("/api/"+old,json={"args":[]}).status_code,404)
            self.assertEqual(client.get("/health").json["status"],"ok")
    def test_advanced_statistics_available_but_collapsed(self):
        s=Path("deep_comparison_ui.js").read_text(encoding="utf-8")
        self.assertIn("document.createElement('details')",s)
        self.assertIn("Sortino",s)
        self.assertIn("maxDrawdown",s)

if __name__=="__main__":
    unittest.main()
