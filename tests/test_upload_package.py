import json
import tempfile
import unittest
import zipfile
from io import BytesIO
from pathlib import Path

import server


def project_manifest(entry="pages/login/index.html", doc="docs/login.md"):
    return {
        "schemaVersion": 1,
        "project": {
            "id": "upload-test",
            "name": "Upload Test",
            "devicePreset": "iphone-portrait",
        },
        "pages": {
            "login": {
                "title": "Login",
                "entry": entry,
                "doc": doc,
            }
        },
        "canvas": {
            "nodes": [{"id": "node-login", "pageId": "login", "x": 0, "y": 0}],
            "edges": [],
            "notes": [],
        },
    }


def build_zip(files):
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, content in files.items():
            archive.writestr(path, content)
    return buffer.getvalue()


class UploadPackageTests(unittest.TestCase):
    def extract(self, files):
        temporary = tempfile.TemporaryDirectory()
        destination = Path(temporary.name)
        server.safe_extract_project_zip(build_zip(files), destination)
        return temporary, destination

    def test_accepts_manifest_and_files_at_zip_root(self):
        temporary, destination = self.extract({
            server.MANIFEST_FILE: json.dumps(project_manifest()),
            "pages/login/index.html": "<!doctype html><title>Login</title>",
            "docs/login.md": "# Login",
        })
        self.addCleanup(temporary.cleanup)

        self.assertTrue((destination / server.MANIFEST_FILE).is_file())
        self.assertTrue((destination / "pages/login/index.html").is_file())
        self.assertTrue((destination / "docs/login.md").is_file())

    def test_rejects_extra_outer_directory_with_manifest_location(self):
        files = {
            "full-release/protodock-upload/protodock.project.json": json.dumps(project_manifest()),
            "full-release/protodock-upload/pages/login/index.html": "<!doctype html>",
            "full-release/protodock-upload/docs/login.md": "# Login",
        }
        with tempfile.TemporaryDirectory() as destination:
            with self.assertRaises(server.ProtoDockError) as context:
                server.safe_extract_project_zip(build_zip(files), Path(destination))

        self.assertEqual(context.exception.code, "INVALID_ARCHIVE_ROOT")
        self.assertIn("full-release/protodock-upload/protodock.project.json", context.exception.message)

    def test_reports_all_missing_entry_and_doc_files(self):
        files = {server.MANIFEST_FILE: json.dumps(project_manifest())}
        with tempfile.TemporaryDirectory() as destination:
            with self.assertRaises(server.ProtoDockError) as context:
                server.safe_extract_project_zip(build_zip(files), Path(destination))

        self.assertEqual(context.exception.code, "PROJECT_FILES_INVALID")
        self.assertEqual(len(context.exception.details), 2)
        self.assertIn("pages/login/index.html", context.exception.details[0])
        self.assertIn("docs/login.md", context.exception.details[1])

    def test_rejects_non_relative_manifest_paths(self):
        manifest = project_manifest(
            entry="http://localhost:4175/pages/login/index.html",
            doc="/Users/example/docs/login.md",
        )
        files = {server.MANIFEST_FILE: json.dumps(manifest)}
        with tempfile.TemporaryDirectory() as destination:
            with self.assertRaises(server.ProtoDockError) as context:
                server.safe_extract_project_zip(build_zip(files), Path(destination))

        self.assertEqual(context.exception.code, "PROJECT_FILES_INVALID")
        self.assertTrue(any("localhost" in issue for issue in context.exception.details))
        self.assertTrue(any("ZIP 根目录" in issue for issue in context.exception.details))

    def test_rejects_missing_canvas_node(self):
        manifest = project_manifest()
        manifest["canvas"]["nodes"] = []
        files = {
            server.MANIFEST_FILE: json.dumps(manifest),
            "pages/login/index.html": "<!doctype html>",
            "docs/login.md": "# Login",
        }
        with tempfile.TemporaryDirectory() as destination:
            with self.assertRaises(server.ProtoDockError) as context:
                server.safe_extract_project_zip(build_zip(files), Path(destination))

        self.assertEqual(context.exception.code, "CANVAS_LAYOUT_INVALID")
        self.assertTrue(any("login" in issue for issue in context.exception.details))

    def test_rejects_unbound_back_control_during_zip_upload(self):
        files = {
            server.MANIFEST_FILE: json.dumps(project_manifest()),
            "pages/login/index.html": '<button class="header-back" aria-label="返回"></button>',
            "docs/login.md": "# Login",
        }
        with tempfile.TemporaryDirectory() as destination:
            with self.assertRaises(server.ProtoDockError) as context:
                server.safe_extract_project_zip(build_zip(files), Path(destination))

        self.assertEqual(context.exception.code, "NAVIGATION_INVALID")
        self.assertTrue(any("返回控件但未声明" in issue for issue in context.exception.details))

    def test_rejects_duplicate_nodes_dangling_edges_and_overlap(self):
        manifest = project_manifest()
        manifest["canvas"] = {
            "nodes": [
                {"id": "node-login", "pageId": "login", "x": 0, "y": 0},
                {"id": "node-login-copy", "pageId": "login", "x": 0, "y": 0},
            ],
            "edges": [{"id": "edge-missing", "from": "node-login", "to": "node-missing"}],
            "notes": [],
        }
        result = server.validate_canvas_layout(manifest)

        self.assertTrue(result["issues"])
        self.assertEqual(result["stats"]["duplicatePageNodeCount"], 1)
        self.assertEqual(result["stats"]["danglingEdgeCount"], 1)
        self.assertEqual(result["stats"]["nodeOverlapCount"], 1)

    def test_reports_crossing_edges_as_warning(self):
        manifest = {
            "project": {"devicePreset": "iphone-landscape"},
            "pages": {page_id: {} for page_id in ("a", "b", "c", "d")},
            "canvas": {
                "nodes": [
                    {"id": "a", "pageId": "a", "x": 0, "y": 0},
                    {"id": "b", "pageId": "b", "x": 500, "y": 500},
                    {"id": "c", "pageId": "c", "x": 500, "y": 0},
                    {"id": "d", "pageId": "d", "x": 0, "y": 500},
                ],
                "edges": [
                    {"id": "ab", "from": "a", "to": "b"},
                    {"id": "cd", "from": "c", "to": "d"},
                ],
            },
        }
        result = server.validate_canvas_layout(manifest)

        self.assertEqual(result["issues"], [])
        self.assertEqual(result["stats"]["unrelatedEdgeCrossingCount"], 1)
        self.assertTrue(any("连线交叉" in warning for warning in result["warnings"]))

    def test_rejects_duplicate_edges(self):
        manifest = {
            "project": {"devicePreset": "iphone-portrait"},
            "pages": {"a": {}, "b": {}},
            "canvas": {
                "nodes": [
                    {"id": "a", "pageId": "a", "x": -600, "y": -700},
                    {"id": "b", "pageId": "b", "x": 0, "y": 0},
                ],
                "edges": [
                    {"id": "first", "from": "a", "to": "b"},
                    {"id": "second", "from": "a", "to": "b"},
                ],
            },
        }
        result = server.validate_canvas_layout(manifest)

        self.assertTrue(any("重复业务连线" in issue for issue in result["issues"]))
        self.assertGreater(result["stats"]["duplicateEdgeCount"], 0)

    def test_accepts_optional_canvas_groups(self):
        manifest = project_manifest()
        manifest["canvas"]["groups"] = [{
            "id": "account",
            "title": "账号绑定",
            "rootNodeId": "node-login",
            "nodeIds": ["node-login"],
            "collapsed": False,
        }]

        result = server.validate_canvas_layout(manifest)

        self.assertEqual(result["issues"], [])
        self.assertEqual(result["stats"]["groupCount"], 1)
        self.assertEqual(result["stats"]["groupedNodeCount"], 1)

    def test_rejects_invalid_group_membership_and_root(self):
        manifest = {
            "project": {"devicePreset": "iphone-portrait"},
            "pages": {"a": {}, "b": {}},
            "canvas": {
                "nodes": [
                    {"id": "a", "pageId": "a", "x": 0, "y": 0},
                    {"id": "b", "pageId": "b", "x": 600, "y": 0},
                ],
                "edges": [],
                "groups": [
                    {"id": "first", "title": "First", "rootNodeId": "missing", "nodeIds": ["a", "missing"]},
                    {"id": "second", "title": "Second", "rootNodeId": "a", "nodeIds": ["a", "b"]},
                ],
            },
        }

        result = server.validate_canvas_layout(manifest)

        self.assertTrue(any("不存在的节点" in issue for issue in result["issues"]))
        self.assertTrue(any("rootNodeId" in issue for issue in result["issues"]))
        self.assertEqual(result["stats"]["duplicateGroupMembershipCount"], 1)

    def test_builds_upload_url_from_valid_origin(self):
        self.assertEqual(
            server.configured_upload_url("http://100.113.173.18:6080/"),
            "http://100.113.173.18:6080/api/publish",
        )

    def test_rejects_invalid_upload_origin(self):
        self.assertEqual(server.configured_upload_url("javascript:alert(1)"), "")
        self.assertEqual(server.configured_upload_url("https://example.com/private"), "")


if __name__ == "__main__":
    unittest.main()
