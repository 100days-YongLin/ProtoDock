import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts" / "protodock-validate"


SHARED_DOCS = {
    "01-product-overview.md": ["产品目标", "用户与使用场景", "产品边界", "端与职责", "成功标准"],
    "02-roles-permissions.md": ["角色定义", "权限矩阵", "数据范围", "越权处理"],
    "03-domain-data-contract.md": ["术语", "核心实体", "字段与口径", "状态机", "数据归属与来源", "一致性与生命周期"],
    "04-interface-event-contract.md": ["前端职责", "后端职责", "接口契约", "错误与重试", "幂等与并发", "权限与审计", "联调数据"],
    "05-cross-end-flows.md": ["流程索引", "主流程", "状态与事件", "异常与补偿", "跨端验收"],
    "90-decisions-open-questions.md": ["已确认决策", "待确认问题", "变更记录"],
}


class WorkspaceValidationTests(unittest.TestCase):
    def make_workspace(self, root: Path, *, include_contract_link: bool = True):
        (root / "README.md").write_text("# Demo\n\n## 端列表\n\n## 构建与验证\n", encoding="utf-8")
        (root / ".gitignore").write_text("temps/\nprotodock/backups/\n", encoding="utf-8")
        (root / "protodock.workspace.json").write_text(json.dumps({
            "schemaVersion": 1,
            "product": {"id": "demo", "name": "Demo", "version": "v1.0.0"},
            "sharedDocs": "shared-docs",
            "projects": [{"id": "web", "name": "Web 端", "path": "prototypes/web"}],
        }), encoding="utf-8")
        shared_dir = root / "shared-docs"
        shared_dir.mkdir()
        for name, headings in SHARED_DOCS.items():
            content = [f"# {name[:-3]}"] + [f"\n## {heading}\n\n- 示例契约。" for heading in headings]
            (shared_dir / name).write_text("\n".join(content), encoding="utf-8")
        project = root / "prototypes" / "web"
        (project / "pages" / "home").mkdir(parents=True)
        (project / "docs").mkdir()
        (project / "README.md").write_text("# Web 端\n\n## 源码与构建\n\n## 验证\n", encoding="utf-8")
        (project / "pages" / "home" / "index.html").write_text(
            "<!doctype html><html><body><main>首页</main></body></html>", encoding="utf-8"
        )
        contract = (
            "\n## 关联共享契约\n\n"
            "- 共享契约：`03-domain-data-contract`、`04-interface-event-contract`\n"
            "- 本页职责：展示服务端返回的内容。\n"
        ) if include_contract_link else ""
        sections = [
            "页面定位", "使用场景", "前置条件", "页面内容", "交互规则",
            "业务规则", "状态与异常", "数据影响", "产品验收", "非本期范围",
        ]
        document = ["# 首页", contract]
        for heading in sections:
            if heading == "产品验收":
                document.append(
                    "## 产品验收\n\n### 验收场景 1：打开首页\n\n"
                    "- 前提：用户已登录。\n- 操作：用户进入首页。\n- 预期：页面展示首页内容。"
                )
            else:
                document.append(f"## {heading}\n\n- 示例说明。")
        (project / "docs" / "home.md").write_text("\n\n".join(document), encoding="utf-8")
        (project / "protodock.project.json").write_text(json.dumps({
            "schemaVersion": 1,
            "project": {"id": "demo-web", "name": "Web 端", "devicePreset": "web-landscape"},
            "changelog": [],
            "pendingChanges": [],
            "pages": {"home": {"title": "首页", "entry": "pages/home/index.html", "doc": "docs/home.md"}},
            "canvas": {"nodes": [{"id": "node-home", "pageId": "home", "x": 0, "y": 0}], "edges": []},
        }), encoding="utf-8")

    def validate(self, root: Path, *extra_args: str):
        result = subprocess.run(
            [sys.executable, str(VALIDATOR), str(root), "--json", *extra_args],
            check=False,
            capture_output=True,
            text=True,
        )
        return result, json.loads(result.stdout)

    def test_complete_workspace_collaboration_contract(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.make_workspace(root)
            result, report = self.validate(root)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(report["stats"]["workspaceCoreDocCount"], 5)
            self.assertEqual(report["stats"]["workspaceMissingCoreDocCount"], 0)
            self.assertEqual(report["stats"]["workspaceUnlinkedPageDocCount"], 0)
            self.assertFalse(any("核心协作文档" in warning for warning in report["warnings"]))
            strict_result, strict_report = self.validate(root, "--workspace-contracts-as-errors")
            self.assertEqual(strict_result.returncode, 0, strict_report["workspaceContractWarnings"])

    def test_legacy_workspace_stays_valid_with_upgrade_warnings(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.make_workspace(root, include_contract_link=False)
            (root / "shared-docs" / "04-interface-event-contract.md").unlink()
            result, report = self.validate(root)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(report["ok"])
            self.assertEqual(report["stats"]["workspaceMissingCoreDocCount"], 1)
            self.assertEqual(report["stats"]["workspaceUnlinkedPageDocCount"], 1)
            self.assertTrue(any("缺少核心协作文档" in warning for warning in report["warnings"]))
            self.assertTrue(any("关联共享契约" in warning for warning in report["warnings"]))
            strict_result, strict_report = self.validate(root, "--workspace-contracts-as-errors")
            self.assertEqual(strict_result.returncode, 1)
            self.assertGreaterEqual(len(strict_report["workspaceContractWarnings"]), 2)

    def test_workspace_manifest_must_be_object(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "protodock.workspace.json").write_text("[]", encoding="utf-8")
            result, report = self.validate(root)
            self.assertEqual(result.returncode, 1)
            self.assertFalse(report["ok"])
            self.assertTrue(any("必须是 JSON 对象" in issue for issue in report["errors"]))


if __name__ == "__main__":
    unittest.main()
