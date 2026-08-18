import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class ShareHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.shares = Path(self.temp.name) / "shares"
        project = self.shares / "pictale" / "v1"
        (project / "assets").mkdir(parents=True)
        (project / server.MANIFEST_FILE).write_text(json.dumps({
            "project": {"id": "pictale", "name": "Pictale"},
            "pages": {}
        }), encoding="utf-8")
        (project / "assets" / "icon.svg").write_text("<svg></svg>", encoding="utf-8")
        self.shares_patch = patch.object(server, "SHARES_DIR", self.shares)
        self.shares_patch.start()
        self.httpd = server.ProtoDockHTTPServer(("127.0.0.1", 0), server.ProtoDockHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        self.shares_patch.stop()
        self.temp.cleanup()

    def request(self, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=3)
        connection.request(
            "GET",
            "/shares/pictale/v1/assets/icon.svg",
            headers=headers or {},
        )
        response = connection.getresponse()
        body = response.read()
        result = response.status, dict(response.getheaders()), body
        connection.close()
        return result

    def test_server_uses_large_queue_and_http_11(self):
        self.assertGreaterEqual(self.httpd.request_queue_size, 64)
        self.assertEqual(server.ProtoDockHandler.protocol_version, "HTTP/1.1")

    def test_versioned_share_assets_are_immutable_and_revalidate_with_etag(self):
        status, headers, body = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(body, b"<svg></svg>")
        self.assertEqual(headers["Cache-Control"], "public, max-age=31536000, immutable")
        self.assertTrue(headers["ETag"].startswith('"'))

        status, cached_headers, body = self.request({"If-None-Match": headers["ETag"]})
        self.assertEqual(status, 304)
        self.assertEqual(body, b"")
        self.assertEqual(cached_headers["ETag"], headers["ETag"])


if __name__ == "__main__":
    unittest.main()
