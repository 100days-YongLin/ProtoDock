import unittest

from protodock_validation import validate_changelog


class ChangeLogValidationTests(unittest.TestCase):
    def test_missing_changelog_is_legacy_warning(self):
        result = validate_changelog({"pages": {}})
        self.assertEqual(result["issues"], [])
        self.assertEqual(result["stats"]["changeLogCount"], 0)
        self.assertTrue(result["warnings"])

    def test_valid_changelog_reports_current_version(self):
        result = validate_changelog({
            "changelog": [
                {
                    "version": "v1.0",
                    "changedAt": "2026-08-16T08:00:00+08:00",
                    "description": "建立项目。",
                },
                {
                    "version": "v1.1",
                    "changedAt": "2026-08-17T09:30:00+08:00",
                    "description": "补充变更历史。",
                },
            ]
        })
        self.assertEqual(result["issues"], [])
        self.assertEqual(result["warnings"], [])
        self.assertEqual(result["stats"]["changeLogCount"], 2)
        self.assertEqual(result["stats"]["currentVersion"], "v1.1")

    def test_invalid_entry_is_blocking(self):
        result = validate_changelog({
            "changelog": [{
                "version": "",
                "changedAt": "2026-08-17 09:30:00",
                "description": "",
            }]
        })
        self.assertGreaterEqual(len(result["issues"]), 3)


if __name__ == "__main__":
    unittest.main()
