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
        "canvas": {"nodes": [], "edges": [], "notes": []},
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


if __name__ == "__main__":
    unittest.main()
