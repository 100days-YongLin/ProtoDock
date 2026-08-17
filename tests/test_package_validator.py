import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

import server
from protodock_validation import validate_cross_page_navigation


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts" / "protodock-validate"
BACK_BRIDGE = """
<script>
document.addEventListener("click", (event) => {
  const control = event.target.closest("[data-protodock-back]");
  if (!control) return;
  const fallbackPageId = control.getAttribute("data-protodock-back") || null;
  if (typeof window.ProtoDockPreview?.back === "function") {
    window.ProtoDockPreview.back(fallbackPageId);
  } else {
    window.parent.postMessage({ type: "protodock:back", fallbackPageId }, "*");
  }
});
</script>
"""


def manifest():
    return {
        "schemaVersion": 1,
        "project": {
            "id": "navigation-test",
            "name": "Navigation Test",
            "devicePreset": "iphone-portrait",
        },
        "pages": {
            "home": {
                "title": "Home",
                "entry": "pages/home/index.html",
                "doc": "docs/home.md",
            },
            "detail": {
                "title": "Detail",
                "entry": "pages/detail/index.html",
                "doc": "docs/detail.md",
            },
        },
        "canvas": {
            "nodes": [
                {"id": "node-home", "pageId": "home", "x": 0, "y": 0},
                {"id": "node-detail", "pageId": "detail", "x": 600, "y": 0},
            ],
            "edges": [
                {"id": "edge-home-detail", "from": "node-home", "to": "node-detail", "label": "查看详情"},
            ],
            "notes": [],
        },
    }


def write_project(root: Path, home_html: str, *, detail_html: str = "<!doctype html><title>Detail</title>"):
    data = manifest()
    (root / "pages/home").mkdir(parents=True)
    (root / "pages/detail").mkdir(parents=True)
    (root / "docs").mkdir()
    (root / server.MANIFEST_FILE).write_text(json.dumps(data), encoding="utf-8")
    (root / "pages/home/index.html").write_text(home_html, encoding="utf-8")
    (root / "pages/detail/index.html").write_text(detail_html, encoding="utf-8")
    (root / "docs/home.md").write_text("# Home", encoding="utf-8")
    (root / "docs/detail.md").write_text("# Detail", encoding="utf-8")
    return data


def archive_project(root: Path, archive_path: Path):
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for file_path in root.rglob("*"):
            if file_path.is_file():
                archive.write(file_path, file_path.relative_to(root).as_posix())


class PackageValidatorTests(unittest.TestCase):
    def test_accepts_explicit_control_and_returns_route_table(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_project(root, '<button data-protodock-page="detail">查看详情</button>')

            result = server.validate_project_manifest_files(root)

        self.assertEqual(result["navigation"]["stats"]["routeCount"], 1)
        self.assertEqual(result["navigation"]["routes"][0]["targetPageId"], "detail")

    def test_accepts_protodock_link_and_navigation_api(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(
                root,
                """
                <a href="protodock:detail">查看详情</a>
                <script>window.ProtoDockPreview?.navigate("detail");</script>
                """,
            )

            result = validate_cross_page_navigation(root, data)

        self.assertEqual(result["issues"], [])
        self.assertEqual(result["stats"]["routeCount"], 2)

    def test_rejects_back_attribute_without_executable_bridge(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(
                root,
                '<button data-protodock-page="detail">查看详情</button>',
                detail_html='<button data-protodock-back="home" aria-label="返回"></button>',
            )

            result = validate_cross_page_navigation(root, data)

        self.assertTrue(any("页面自带返回桥接不完整" in issue for issue in result["issues"]))
        self.assertTrue(any("不能只依赖 ProtoDock 宿主自动拦截" in issue for issue in result["issues"]))

    def test_accepts_back_attribute_with_complete_inline_bridge(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(
                root,
                '<button data-protodock-page="detail">查看详情</button>',
                detail_html='<button data-protodock-back="home" aria-label="返回"></button>' + BACK_BRIDGE,
            )

            result = validate_cross_page_navigation(root, data)

        self.assertEqual(result["issues"], [])
        self.assertEqual(result["stats"]["backBridgePageCount"], 1)
        self.assertTrue(any(route["control"] == "返回" for route in result["routes"]))
        self.assertTrue(any(route["targetPageId"] == "home" for route in result["routes"]))

    def test_accepts_complete_bridge_from_local_script(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(
                root,
                '<button data-protodock-page="detail">查看详情</button>',
                detail_html=(
                    '<button data-protodock-back="home" aria-label="返回"></button>'
                    '<script src="./back-bridge.js"></script>'
                ),
            )
            script = BACK_BRIDGE.replace("<script>", "").replace("</script>", "")
            (root / "pages/detail/back-bridge.js").write_text(script, encoding="utf-8")

            result = validate_cross_page_navigation(root, data)

        self.assertEqual(result["issues"], [])
        self.assertGreaterEqual(result["stats"]["scannedFileCount"], 3)

    def test_rejects_partial_bridge_without_postmessage_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(
                root,
                '<button data-protodock-page="detail">查看详情</button>',
                detail_html="""
                    <button data-protodock-back="home" aria-label="返回"></button>
                    <script>
                    document.addEventListener("click", (event) => {
                      const control = event.target.closest("[data-protodock-back]");
                      window.ProtoDockPreview?.back(control.getAttribute("data-protodock-back"));
                    });
                    </script>
                """,
            )

            result = validate_cross_page_navigation(root, data)

        self.assertTrue(any("postMessage 兜底" in issue for issue in result["issues"]))

    def test_accepts_back_api_and_message(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(
                root,
                """
                <script>
                  window.ProtoDockPreview?.back("home");
                  window.parent.postMessage({ type: "protodock:back" }, "*");
                </script>
                """,
            )

            result = validate_cross_page_navigation(root, data)

        self.assertEqual(result["issues"], [])
        self.assertEqual(result["stats"]["routeCount"], 2)

    def test_accepts_back_api_in_button_handler(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(
                root,
                '<button onclick="window.ProtoDockPreview?.back(\'detail\')">返回</button>',
            )

            result = validate_cross_page_navigation(root, data)

        self.assertEqual(result["issues"], [])
        self.assertEqual(result["stats"]["routeCount"], 1)
        self.assertEqual(result["routes"][0]["targetPageId"], "detail")

    def test_rejects_unimplemented_back_control(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(root, '<button class="header-back" aria-label="返回"></button>')

            result = validate_cross_page_navigation(root, data)

        self.assertTrue(any("返回控件但未声明" in issue for issue in result["issues"]))

    def test_rejects_browser_history_back(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(root, '<button onclick="history.back()">返回</button>')

            result = validate_cross_page_navigation(root, data)

        self.assertTrue(any("history.back()" in issue for issue in result["issues"]))

    def test_rejects_legacy_data_page(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_project(root, '<button data-page="detail">查看详情</button>')

            with self.assertRaises(server.ProtoDockError) as context:
                server.validate_project_manifest_files(root)

        self.assertEqual(context.exception.code, "NAVIGATION_INVALID")
        self.assertTrue(any("data-page=detail" in issue for issue in context.exception.details))

    def test_rejects_script_location_and_root_page_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(
                root,
                """
                <button id="detail">查看详情</button>
                <script>window.location.href = "/pages/detail/index.html";</script>
                """,
            )

            result = validate_cross_page_navigation(root, data)

        self.assertTrue(any("location 跳转" in issue for issue in result["issues"]))
        self.assertTrue(any("根路径" in issue for issue in result["issues"]))

    def test_scans_local_script_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(root, '<script src="./navigation.js"></script>')
            (root / "pages/home/navigation.js").write_text(
                'window.location.assign("../detail/index.html");',
                encoding="utf-8",
            )

            result = validate_cross_page_navigation(root, data)

        self.assertTrue(any("navigation.js:1" in issue for issue in result["issues"]))

    def test_cli_validates_final_zip_and_returns_nonzero_on_error(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "project"
            root.mkdir()
            write_project(root, '<button data-page="detail">查看详情</button>')
            archive_path = Path(directory) / "prototype-protodock-upload.zip"
            archive_project(root, archive_path)

            completed = subprocess.run(
                [str(VALIDATOR), "--json", str(archive_path)],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            report = json.loads(completed.stdout)

        self.assertEqual(completed.returncode, 1)
        self.assertFalse(report["ok"])
        self.assertEqual(report["sourceType"], "zip")
        self.assertTrue(any("data-page=detail" in issue for issue in report["errors"]))

    def test_cli_rejects_back_attribute_without_runtime_bridge(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "project"
            root.mkdir()
            write_project(
                root,
                '<button data-protodock-page="detail">查看详情</button>',
                detail_html='<button data-protodock-back="home">返回</button>',
            )
            archive_path = Path(directory) / "prototype-protodock-upload.zip"
            archive_project(root, archive_path)

            completed = subprocess.run(
                [str(VALIDATOR), "--json", str(archive_path)],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            report = json.loads(completed.stdout)

        self.assertEqual(completed.returncode, 1)
        self.assertTrue(any("页面自带返回桥接不完整" in issue for issue in report["errors"]))


if __name__ == "__main__":
    unittest.main()
