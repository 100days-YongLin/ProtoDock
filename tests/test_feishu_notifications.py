import json
import unittest
from urllib.parse import quote

from feishu_notifications import (
    FeishuNotificationError,
    build_publish_card,
    send_publish_card,
    validate_webhook,
)


WEBHOOK = "https://open.feishu.cn/open-apis/bot/v2/hook/11111111-2222-3333-4444-555555555555"


def publish_payload():
    return {
        "projectName": "优儿嘉幼师版小程序",
        "version": "v1.1-version7",
        "publishedAt": "2026-08-18T07:32:00.000Z",
        "updateContent": "补充发布通知与产品文档入口。",
        "shareUrl": "https://example.com/s/campus/v1.1-version7",
        "latestShareUrl": "https://example.com/s/campus/latest",
        "tagUrl": "https://github.com/example/prototypes/tree/release/campus/v1.1-version7",
        "branchUrl": "https://github.com/example/prototypes/tree/project/campus",
    }


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self, size):
        return b'{"code":0,"msg":"success"}'


class FakeOpener:
    def __init__(self):
        self.request = None
        self.timeout = None

    def open(self, request, timeout):
        self.request = request
        self.timeout = timeout
        return FakeResponse()


class FeishuNotificationTests(unittest.TestCase):
    def test_accepts_only_official_custom_bot_webhooks(self):
        self.assertEqual(validate_webhook(WEBHOOK), WEBHOOK)
        with self.assertRaises(FeishuNotificationError):
            validate_webhook(WEBHOOK + "?redirect=1")
        with self.assertRaises(FeishuNotificationError):
            validate_webhook(WEBHOOK.replace("open.feishu.cn", "open.feishu.cn.evil.example"))

    def test_builds_green_publish_card_with_prd_actions(self):
        message = build_publish_card(publish_payload())
        self.assertEqual(message["msg_type"], "interactive")
        self.assertEqual(message["card"]["header"]["template"], "green")
        self.assertEqual(
            message["card"]["header"]["title"]["content"],
            "【产品原型】优儿嘉幼师版小程序 发布成功",
        )
        metadata = message["card"]["elements"][0]["fields"]
        self.assertIn("v1.1-version7", metadata[0]["text"]["content"])
        self.assertIn("2026年8月18日 15:32", metadata[1]["text"]["content"])
        self.assertIn("更新内容", message["card"]["elements"][2]["text"]["content"])
        prd_section = message["card"]["elements"][4]["text"]["content"]
        github_section = message["card"]["elements"][5]["text"]["content"]
        self.assertIn(publish_payload()["shareUrl"], prd_section)
        self.assertIn(publish_payload()["latestShareUrl"], prd_section)
        self.assertIn(publish_payload()["tagUrl"], github_section)
        self.assertIn(publish_payload()["branchUrl"], github_section)
        actions = message["card"]["elements"][-1]["actions"]
        self.assertEqual(len(actions), 3)
        self.assertEqual(actions[0]["url"], publish_payload()["shareUrl"])
        self.assertEqual(actions[1]["url"], publish_payload()["latestShareUrl"])
        self.assertEqual(actions[2]["text"]["content"], "复制 GitHub 链接")
        self.assertEqual(
            actions[2]["url"],
            f"https://example.com/copy-link.html?url={quote(publish_payload()['tagUrl'], safe='')}",
        )

    def test_rejects_invalid_publish_time(self):
        payload = publish_payload()
        payload["publishedAt"] = "tomorrow afternoon"
        with self.assertRaisesRegex(FeishuNotificationError, "发布时间格式不正确"):
            build_publish_card(payload)

    def test_sends_interactive_card_without_echoing_webhook(self):
        opener = FakeOpener()
        result = send_publish_card(WEBHOOK, publish_payload(), opener=opener)
        body = json.loads(opener.request.data.decode("utf-8"))

        self.assertEqual(result["code"], 0)
        self.assertEqual(opener.request.full_url, WEBHOOK)
        self.assertEqual(body["msg_type"], "interactive")
        self.assertNotIn(WEBHOOK, opener.request.data.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
