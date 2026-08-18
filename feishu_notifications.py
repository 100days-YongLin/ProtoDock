from __future__ import annotations

import json
import re
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlparse


FEISHU_HOST = "open.feishu.cn"
FEISHU_HOOK_PATH = re.compile(r"^/open-apis/bot/v2/hook/[A-Za-z0-9_-]{20,128}$")


class FeishuNotificationError(ValueError):
    pass


def validate_webhook(value: str) -> str:
    text = str(value or "").strip()
    parsed = urlparse(text)
    try:
        port = parsed.port
    except ValueError as error:
        raise FeishuNotificationError("请填写飞书自定义机器人的完整 Webhook 链接") from error
    if (
        parsed.scheme != "https"
        or parsed.hostname != FEISHU_HOST
        or port is not None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or not FEISHU_HOOK_PATH.fullmatch(parsed.path)
    ):
        raise FeishuNotificationError("请填写飞书自定义机器人的完整 Webhook 链接")
    return text


def clean_text(value, label: str, *, maximum: int, required: bool = False) -> str:
    text = str(value or "").strip()
    if required and not text:
        raise FeishuNotificationError(f"{label}不能为空")
    if len(text) > maximum:
        raise FeishuNotificationError(f"{label}过长")
    return text


def clean_url(value, label: str, *, required: bool = False) -> str:
    text = clean_text(value, label, maximum=2048, required=required)
    if not text:
        return ""
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise FeishuNotificationError(f"{label}格式不正确")
    return text


def build_publish_card(payload: dict) -> dict:
    project_name = clean_text(payload.get("projectName"), "项目名称", maximum=160, required=True)
    version = clean_text(payload.get("version"), "版本号", maximum=80)
    update_content = clean_text(payload.get("updateContent"), "更新内容", maximum=4000, required=True)
    share_url = clean_url(payload.get("shareUrl"), "当前版本地址", required=True)
    latest_url = clean_url(payload.get("latestShareUrl"), "最新版地址")
    branch_url = clean_url(payload.get("branchUrl"), "GitHub 分支地址")
    title = f"{project_name}{f' {version}' if version else ''} 发布成功"

    fields = [{
        "is_short": False,
        "text": {"tag": "lark_md", "content": f"**当前版本 PRD**\n[打开当前版本]({share_url})"},
    }]
    if latest_url:
        fields.append({
            "is_short": False,
            "text": {"tag": "lark_md", "content": f"**持续最新版 PRD**\n[打开最新版]({latest_url})"},
        })
    if branch_url:
        fields.append({
            "is_short": False,
            "text": {"tag": "lark_md", "content": f"**GitHub 分支**\n[查看原型分支]({branch_url})"},
        })

    actions = [{
        "tag": "button",
        "text": {"tag": "plain_text", "content": "查看当前版本 PRD"},
        "type": "primary",
        "url": share_url,
    }]
    if latest_url:
        actions.append({
            "tag": "button",
            "text": {"tag": "plain_text", "content": "查看持续最新版"},
            "type": "default",
            "url": latest_url,
        })

    return {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {
                "template": "green",
                "title": {"tag": "plain_text", "content": title},
            },
            "elements": [
                {"tag": "div", "text": {"tag": "lark_md", "content": "**更新内容**"}},
                {"tag": "div", "text": {"tag": "plain_text", "content": update_content}},
                {"tag": "hr"},
                {"tag": "div", "fields": fields},
                {"tag": "action", "actions": actions},
            ],
        },
    }


class _NoRedirect(urllib_request.HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def send_publish_card(webhook: str, payload: dict, *, opener=None, timeout: int = 12) -> dict:
    target = validate_webhook(webhook)
    body = json.dumps(build_publish_card(payload), ensure_ascii=False).encode("utf-8")
    request = urllib_request.Request(
        target,
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    client = opener or urllib_request.build_opener(_NoRedirect())
    try:
        with client.open(request, timeout=timeout) as response:
            response_body = response.read(64 * 1024).decode("utf-8", errors="replace")
    except urllib_error.HTTPError as error:
        detail = error.read(4096).decode("utf-8", errors="replace")
        raise FeishuNotificationError(f"飞书机器人返回 HTTP {error.code}：{detail[:500]}") from error
    except urllib_error.URLError as error:
        raise FeishuNotificationError(f"无法连接飞书机器人：{error.reason}") from error

    try:
        result = json.loads(response_body or "{}")
    except json.JSONDecodeError as error:
        raise FeishuNotificationError("飞书机器人返回了无法识别的结果") from error
    code = result.get("code", result.get("StatusCode", 0))
    if code not in {0, "0", None}:
        message = result.get("msg") or result.get("StatusMessage") or "发送失败"
        raise FeishuNotificationError(f"飞书机器人发送失败：{message}")
    return result
