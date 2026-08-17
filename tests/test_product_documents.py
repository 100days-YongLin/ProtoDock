import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from protodock_validation import validate_product_documents


COMPLETE_PRODUCT_DOC = """# 账号绑定

> 所属功能：账号体系

## 页面定位

帮助已有 APP 账号的家长完成微信身份关联。

## 使用场景

- 用户从登录流程进入绑定页面。

## 前置条件

- 用户已授权手机号且尚未绑定账号。

## 页面内容

- 展示手机号绑定和用户 ID 绑定入口。

## 交互规则

1. 用户选择绑定方式。
2. 系统完成校验并展示结果。

## 业务规则

- 一个 APP 账号只能绑定一个微信用户。

## 状态与异常

- 账号不存在时引导用户改用其他绑定方式。

## 数据影响

- 绑定成功后同步宝宝资料和绘本记录。

## 产品验收

### 验收场景 1：手机号绑定成功

- 前提：当前手机号存在唯一 APP 账号。
- 操作：用户确认通过手机号绑定。
- 预期：系统完成绑定并进入“我的绘本”。

## 非本期范围

- 本期不支持一个微信身份绑定多个 APP 账号。
"""


def manifest():
    return {
        "pages": {
            "bind": {
                "entry": "pages/bind/index.html",
                "doc": "docs/bind.md",
            }
        },
        "canvas": {
            "nodes": [{"id": "node-bind", "pageId": "bind", "x": 0, "y": 0}],
            "edges": [],
            "notes": [],
        },
    }


def write_project(root: Path, document: str):
    data = manifest()
    (root / "pages/bind").mkdir(parents=True)
    (root / "docs").mkdir()
    (root / server.MANIFEST_FILE).write_text(json.dumps(data), encoding="utf-8")
    (root / "pages/bind/index.html").write_text("<!doctype html><title>Bind</title>", encoding="utf-8")
    (root / "docs/bind.md").write_text(document, encoding="utf-8")
    return data


class ProductDocumentTests(unittest.TestCase):
    def test_serves_product_documentation_route_from_export(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            page = root / "product-documentation/index.html"
            page.parent.mkdir(parents=True)
            page.write_text("<!doctype html><title>产品文档规范</title>", encoding="utf-8")

            with patch.object(server, "DOCS_EXPORT_DIR", root):
                resolved = server.docs_request_path_to_file("/docs/product-documentation")

        self.assertEqual(resolved, page.resolve())

    def test_accepts_complete_product_document_with_chinese_acceptance_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(root, COMPLETE_PRODUCT_DOC)

            result = validate_product_documents(root, data)

        self.assertEqual(result["warnings"], [])
        self.assertEqual(result["stats"]["compliantDocumentCount"], 1)
        self.assertEqual(result["stats"]["acceptanceFormatCount"], 1)

    def test_warns_when_acceptance_uses_english_given_when_then(self):
        document = COMPLETE_PRODUCT_DOC.replace(
            "- 前提：当前手机号存在唯一 APP 账号。\n- 操作：用户确认通过手机号绑定。\n- 预期：系统完成绑定并进入“我的绘本”。",
            "- Given：当前手机号存在唯一 APP 账号。\n- When：用户确认通过手机号绑定。\n- Then：系统完成绑定并进入“我的绘本”。",
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(root, document)

            result = validate_product_documents(root, data)

        self.assertTrue(any("前提 / 操作 / 预期" in warning for warning in result["warnings"]))

    def test_reports_missing_sections_placeholders_and_technical_chapters_as_warnings(self):
        document = """# 绑定页面

## 页面目标

<!-- 请填写页面目标 -->

## 源码位置

- pages/bind/index.html
"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = write_project(root, document)

            result = server.validate_project_manifest_files(root)

        self.assertTrue(result["warnings"])
        self.assertEqual(result["productDocs"]["scannedDocumentCount"], 1)
        self.assertTrue(any("缺少产品文档章节" in warning for warning in result["warnings"]))
        self.assertTrue(any("占位内容" in warning for warning in result["warnings"]))
        self.assertTrue(any("技术章节" in warning for warning in result["warnings"]))


if __name__ == "__main__":
    unittest.main()
