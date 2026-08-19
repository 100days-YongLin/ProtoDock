import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

import server
from protodock_validation import validate_user_facing_copy


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts" / "protodock-validate"


def write_project(root: Path, html: str, script: str = "") -> dict:
    manifest = {
        "schemaVersion": 1,
        "project": {
            "id": "ui-copy-test",
            "name": "UI Copy Test",
            "devicePreset": "iphone-portrait",
        },
        "pages": {
            "home": {
                "title": "首页",
                "entry": "pages/home/index.html",
                "doc": "docs/home.md",
            },
        },
        "canvas": {
            "nodes": [{"id": "node-home", "pageId": "home", "x": 0, "y": 0}],
            "edges": [],
            "notes": [],
        },
    }
    (root / "pages/home").mkdir(parents=True)
    (root / "docs").mkdir()
    (root / "protodock.project.json").write_text(json.dumps(manifest), encoding="utf-8")
    (root / "pages/home/index.html").write_text(html, encoding="utf-8")
    (root / "docs/home.md").write_text("# 首页", encoding="utf-8")
    if script:
        (root / "assets").mkdir()
        (root / "assets/app.js").write_text(script, encoding="utf-8")
    return manifest


class UserFacingCopyValidationTests(unittest.TestCase):
    def test_accepts_role_appropriate_product_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_project(
                root,
                "<h1>班级回复风格</h1><p>由平台统一设置，当前不可编辑</p><button>保存设置</button>",
            )

            result = validate_user_facing_copy(root, manifest)

        self.assertEqual(result["issues"], [])
        self.assertEqual(result["warnings"], [])

    def test_blocks_visible_internal_identifiers_and_inheritance_terms(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_project(
                root,
                "<label>系统事实边界（system-boundary-v7）</label><p>三级继承</p>",
            )

            result = validate_user_facing_copy(root, manifest)

        self.assertGreaterEqual(len(result["issues"]), 2)
        self.assertTrue(any("system-boundary-v7" in issue for issue in result["issues"]))
        self.assertTrue(any("三级继承" in issue for issue in result["issues"]))

    def test_ignores_non_rendered_template_and_hidden_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_project(
                root,
                "<template>系统事实边界（system-boundary-v7）</template>"
                "<span hidden>三级继承</span><button>保存</button>",
            )

            result = validate_user_facing_copy(root, manifest)

        self.assertEqual(result["issues"], [])
        self.assertEqual(result["warnings"], [])

    def test_warns_about_runtime_and_review_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_project(
                root,
                '<main id="app"></main><script src="../../assets/app.js"></script>',
                "const panel = `<p>本页面用于演示班级配置</p>"
                "<label>班级初始提示词（class-dragon2-v4）</label>`;",
            )

            result = validate_user_facing_copy(root, manifest)

        self.assertEqual(result["issues"], [])
        self.assertTrue(any("疑似运行时文案" in warning for warning in result["warnings"]))
        self.assertTrue(any("class-dragon2-v4" in warning for warning in result["warnings"]))
        self.assertTrue(any("本页面用于" in warning for warning in result["warnings"]))

    def test_warns_about_placeholder_and_technical_error_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_project(
                root,
                "<h1>模拟空状态</h1><p>保存失败：API 500，请检查 class_policy 写入异常</p>",
            )

            result = validate_user_facing_copy(root, manifest)

        self.assertEqual(result["issues"], [])
        self.assertTrue(any("未完成或模拟内容" in warning for warning in result["warnings"]))
        self.assertTrue(any("技术错误细节" in warning for warning in result["warnings"]))

    def test_checks_assistive_copy_and_input_values(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_project(
                root,
                '<img src="avatar.png" alt="原型说明：这里展示头像">'
                '<input aria-label="页面 ID" value="待开发">',
            )

            result = validate_user_facing_copy(root, manifest)

        self.assertTrue(any("面向评审的解释" in warning for warning in result["warnings"]))
        self.assertTrue(any("内部实现术语" in warning for warning in result["warnings"]))
        self.assertTrue(any("未完成或模拟内容" in warning for warning in result["warnings"]))

    def test_warns_about_visible_secrets_and_private_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_project(
                root,
                "<p>Webhook：https://open.feishu.cn/open-apis/bot/v2/hook/"
                "a5fe0a2e-6220-4d87-a135-2ac5bb6ab54d</p>"
                "<p>文件：/Users/demo/private/config.json</p>",
            )

            result = validate_user_facing_copy(root, manifest)

        self.assertEqual(result["issues"], [])
        self.assertGreaterEqual(
            sum("敏感凭证或本地路径" in warning for warning in result["warnings"]),
            2,
        )

    def test_upload_validation_rejects_high_confidence_visible_leakage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_project(root, "<label>系统事实边界（system-boundary-v7）</label>")

            with self.assertRaises(server.ProtoDockError) as context:
                server.validate_project_manifest_files(root)

        self.assertEqual(context.exception.code, "USER_FACING_COPY_INVALID")
        self.assertTrue(any("UI 文案泄露" in detail for detail in context.exception.details))

    def test_final_zip_warnings_can_block_release(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "project"
            root.mkdir()
            write_project(root, "<p>本页面用于演示班级配置</p>")
            archive_path = Path(directory) / "ui-copy-protodock-upload.zip"
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
                for file_path in root.rglob("*"):
                    if file_path.is_file():
                        archive.write(file_path, file_path.relative_to(root).as_posix())

            completed = subprocess.run(
                [str(VALIDATOR), "--json", "--warnings-as-errors", str(archive_path)],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            report = json.loads(completed.stdout)

        self.assertEqual(completed.returncode, 1)
        self.assertTrue(report["ok"])
        self.assertEqual(report["stats"]["uiCopyWarningCount"], 1)
        self.assertTrue(any("面向评审的解释" in warning for warning in report["warnings"]))


if __name__ == "__main__":
    unittest.main()
