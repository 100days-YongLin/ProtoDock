import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


def write_snapshot(root: Path, name: str):
    root.mkdir(parents=True, exist_ok=True)
    (root / server.MANIFEST_FILE).write_text(json.dumps({
        "project": {"id": "project-demo", "name": name},
        "pages": {},
        "canvas": {"nodes": [], "edges": [], "notes": []},
    }), encoding="utf-8")


class PublishingTests(unittest.TestCase):
    def test_branch_reference_paths_match_public_routes(self):
        self.assertEqual(server.normalize_share_reference("pictale/v1"), "pictale/v1")
        self.assertEqual(server.share_reference_path("pictale/v1"), "/s/pictale/v1")
        self.assertEqual(server.normalize_share_reference("legacy_123"), "legacy_123")
        self.assertEqual(server.normalize_share_reference("pictale/canvas"), "")

    def test_publish_uses_branch_as_stable_share_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shares = root / "shares"
            snapshot = root / "snapshot"
            write_snapshot(snapshot, "First")
            with patch.object(server, "SHARES_DIR", shares):
                result = server.publish_project_snapshot(snapshot, "pictale", "v1", "", False)
                published = server.share_directory_for("pictale/v1")
                published_name = server.project_name_for_directory(published, "")

        self.assertEqual(result["id"], "pictale/v1")
        self.assertEqual(result["path"], "/s/pictale/v1")
        self.assertEqual(result["action"], "created")
        self.assertEqual(published_name, "First")

    def test_publish_rolls_back_share_when_github_push_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shares = root / "shares"
            existing = shares / "pictale" / "v1"
            snapshot = root / "snapshot"
            write_snapshot(existing, "Stable")
            write_snapshot(snapshot, "Broken")
            with patch.object(server, "SHARES_DIR", shares), patch.object(
                server,
                "push_project_to_github",
                side_effect=server.ProtoDockError(server.HTTPStatus.BAD_REQUEST, "push failed"),
            ):
                with self.assertRaises(server.ProtoDockError):
                    server.publish_project_snapshot(snapshot, "pictale", "v1", "update", True)
                restored = server.share_directory_for("pictale/v1")
                restored_name = server.project_name_for_directory(restored, "")

        self.assertEqual(restored_name, "Stable")

    def test_publish_returns_github_result_from_same_branch(self):
        github_result = {
            "branch": "pictale/v2",
            "commit": "abc123",
            "action": "pushed",
            "branchUrl": "https://github.com/example/repo/tree/pictale/v2",
            "commitUrl": "https://github.com/example/repo/commit/abc123",
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shares = root / "shares"
            snapshot = root / "snapshot"
            write_snapshot(snapshot, "Second")
            with patch.object(server, "SHARES_DIR", shares), patch.object(
                server,
                "push_project_to_github",
                return_value=github_result,
            ) as push:
                result = server.publish_project_snapshot(snapshot, "pictale", "v2", "release v2", True)

        push.assert_called_once()
        self.assertEqual(result["branch"], "pictale/v2")
        self.assertEqual(result["github"], github_result)


if __name__ == "__main__":
    unittest.main()
