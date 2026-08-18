import json
import os
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
        self.assertEqual(server.github_product_branch_name("pictale"), "project/pictale")
        self.assertEqual(server.github_release_tag_name("pictale", "v1"), "release/pictale/v1")

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
        self.assertEqual(result["latestPath"], "/s/pictale/latest")
        self.assertEqual(result["action"], "created")
        self.assertEqual(published_name, "First")

    def test_latest_reference_tracks_last_successful_publish(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shares = root / "shares"
            first = root / "first"
            second = root / "second"
            write_snapshot(first, "First")
            write_snapshot(second, "Second")
            with patch.object(server, "SHARES_DIR", shares):
                server.publish_project_snapshot(first, "pictale", "v1", "", False)
                server.publish_project_snapshot(second, "pictale", "v2", "", False)
                latest = server.latest_share_reference("pictale")

        self.assertEqual(latest, "pictale/v2")

    def test_latest_reference_falls_back_for_existing_products(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shares = root / "shares"
            older = shares / "pictale" / "v1"
            newer = shares / "pictale" / "v2"
            write_snapshot(older, "First")
            write_snapshot(newer, "Second")
            older_manifest = older / server.MANIFEST_FILE
            newer_manifest = newer / server.MANIFEST_FILE
            os.utime(older_manifest, (100, 100))
            os.utime(newer_manifest, (200, 200))
            with patch.object(server, "SHARES_DIR", shares):
                latest = server.latest_share_reference("pictale")

        self.assertEqual(latest, "pictale/v2")

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

    def test_failed_publish_does_not_advance_latest_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shares = root / "shares"
            stable = root / "stable"
            broken = root / "broken"
            write_snapshot(stable, "Stable")
            write_snapshot(broken, "Broken")
            with patch.object(server, "SHARES_DIR", shares):
                server.publish_project_snapshot(stable, "pictale", "v1", "", False)
                with patch.object(
                    server,
                    "push_project_to_github",
                    side_effect=server.ProtoDockError(server.HTTPStatus.BAD_REQUEST, "push failed"),
                ):
                    with self.assertRaises(server.ProtoDockError):
                        server.publish_project_snapshot(broken, "pictale", "v2", "update", True)
                latest = server.latest_share_reference("pictale")
                failed_version_exists = (shares / "pictale" / "v2").exists()

        self.assertEqual(latest, "pictale/v1")
        self.assertFalse(failed_version_exists)

    def test_publish_returns_github_product_branch_and_release_tag(self):
        github_result = {
            "branch": "project/pictale",
            "tag": "release/pictale/v2",
            "commit": "abc123",
            "action": "pushed",
            "branchUrl": "https://github.com/example/repo/tree/project/pictale",
            "tagUrl": "https://github.com/example/repo/tree/release/pictale/v2",
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

    def test_github_push_uses_stable_branch_and_release_tag_urls(self):
        delivery = {
            "branch": "project/pictale",
            "tag": "release/pictale/v2",
            "commit": "abc123",
            "previousCommit": "def456",
            "action": "pushed",
            "changes": ["M\tdocs/home.md"],
            "diffStat": "1 file changed",
            "workspaceReused": True,
        }
        with tempfile.TemporaryDirectory() as directory, patch.object(
            server,
            "GITHUB_REPO_URL",
            "https://github.com/example/prototypes.git",
        ), patch.object(server, "GITHUB_DELIVERY_DIR", Path(directory) / "delivery"), patch.object(
            server,
            "publish_git_delivery",
            return_value=delivery,
        ) as publish:
            result = server.push_project_to_github(Path(directory), "pictale", "v2", "release v2")

        self.assertEqual(result["branchUrl"], "https://github.com/example/prototypes/tree/project/pictale")
        self.assertEqual(result["tagUrl"], "https://github.com/example/prototypes/tree/release/pictale/v2")
        publish.assert_called_once()


if __name__ == "__main__":
    unittest.main()
