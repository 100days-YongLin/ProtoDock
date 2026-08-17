import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pdf_renderer
import server


def write_snapshot(root: Path, name: str = "Demo"):
    root.mkdir(parents=True, exist_ok=True)
    (root / server.MANIFEST_FILE).write_text(json.dumps({
        "project": {"id": "project-demo", "name": name},
        "pages": {},
        "canvas": {"nodes": [], "edges": []},
    }), encoding="utf-8")


class PdfServerTests(unittest.TestCase):
    def setUp(self):
        server.PDF_SERVICE.jobs.clear()

    def test_share_resource_routes(self):
        self.assertEqual(
            server.PDF_SERVICE.parse_resource_path("/api/shares/pictale/v1/pdf/status"),
            ("pdf-status", "pictale/v1"),
        )
        self.assertEqual(
            server.PDF_SERVICE.parse_resource_path("/api/shares/pictale/v1/pdf"),
            ("pdf", "pictale/v1"),
        )
        self.assertEqual(
            server.PDF_SERVICE.parse_resource_path("/api/shares/legacy_123/download"),
            ("download", "legacy_123"),
        )

    def test_latest_pdf_route_resolves_to_current_version(self):
        with tempfile.TemporaryDirectory() as directory:
            shares = Path(directory) / "shares"
            snapshot = shares / "pictale" / "v2"
            write_snapshot(snapshot)
            (shares / "pictale" / server.LATEST_POINTER_FILE).write_text(
                json.dumps({"version": "v2"}),
                encoding="utf-8",
            )
            with patch.object(server, "SHARES_DIR", shares):
                route = server.PDF_SERVICE.parse_resource_path("/api/shares/pictale/latest/pdf/status")

        self.assertEqual(route, ("pdf-status", "pictale/v2"))

    def test_pdf_status_reuses_content_revision_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shares = root / "shares"
            cache = root / "pdf-cache"
            snapshot = shares / "pictale" / "v1"
            write_snapshot(snapshot)
            with patch.object(server, "SHARES_DIR", shares), patch.object(
                server.PDF_SERVICE,
                "cache_dir",
                cache,
            ):
                revision = server.PDF_SERVICE.content_revision(snapshot)
                artifact = server.PDF_SERVICE.artifact_path("pictale/v1", revision)
                artifact.parent.mkdir(parents=True)
                artifact.write_bytes(b"%PDF-test")
                status = server.PDF_SERVICE.status("pictale/v1", enqueue=True)

        self.assertEqual(status["status"], "ready")
        self.assertEqual(status["revision"], revision)

    def test_pdf_status_is_unavailable_without_renderer_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shares = root / "shares"
            snapshot = shares / "pictale" / "v1"
            write_snapshot(snapshot)
            with patch.object(server, "SHARES_DIR", shares), patch.object(
                server.PDF_SERVICE,
                "cache_dir",
                root / "pdf-cache",
            ), patch.object(server.PDF_SERVICE, "renderer_python", root / "missing-python"):
                status = server.PDF_SERVICE.status("pictale/v1", enqueue=True)

        self.assertEqual(status["status"], "unavailable")

    def test_renderer_rejects_external_urls(self):
        with self.assertRaises(ValueError):
            pdf_renderer.validate_render_url("https://example.com/s/demo/v1")
        self.assertEqual(
            pdf_renderer.validate_render_url("http://127.0.0.1:6080/s/demo/v1?pdf-render=1"),
            "http://127.0.0.1:6080/s/demo/v1?pdf-render=1",
        )


if __name__ == "__main__":
    unittest.main()
