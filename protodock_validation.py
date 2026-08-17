from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit


EXPLICIT_TARGET_ATTRIBUTES = ("data-protodock-page", "data-protodock-target")
LEGACY_TARGET_ATTRIBUTES = ("data-page", "data-page-id", "data-target-page", "data-url", "data-href")
BACK_TARGET_ATTRIBUTE = "data-protodock-back"
CONTROL_TAGS = {"a", "button"}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
ACTION_PREFIX = re.compile(r"^(?:请)?(?:点击|进入|打开|前往|跳转到?|查看|选择|返回)")
LOCAL_URL_PATTERN = re.compile(r"(?:https?://localhost(?::\d+)?|file://|[A-Za-z]:[\\/])", re.IGNORECASE)
ROOT_PAGE_PATTERN = re.compile(r"(?:['\"`])(/pages/[^'\"`\s]*)", re.IGNORECASE)
LOCATION_WRITE_PATTERN = re.compile(
    r"(?:window\s*\.\s*)?location\s*(?:\.\s*href\s*)?=|"
    r"(?:window\s*\.\s*)?location\s*\.\s*(?:assign|replace)\s*\(",
    re.IGNORECASE,
)
NAVIGATE_CALL_PATTERN = re.compile(
    r"(?:window\s*\.\s*)?ProtoDockPreview\s*\??\.\s*navigate\s*\(\s*(['\"])([^'\"]+)\1",
    re.IGNORECASE,
)
POST_MESSAGE_PATTERN = re.compile(r"postMessage\s*\(\s*\{(?P<body>.{0,1200}?)\}\s*,", re.DOTALL)
MESSAGE_TYPE_PATTERN = re.compile(r"(?:['\"]?type['\"]?)\s*:\s*(['\"])protodock:navigate\1", re.IGNORECASE)
MESSAGE_BACK_TYPE_PATTERN = re.compile(r"(?:['\"]?type['\"]?)\s*:\s*(['\"])protodock:back\1", re.IGNORECASE)
MESSAGE_PAGE_PATTERN = re.compile(r"(?:['\"]?pageId['\"]?)\s*:\s*(['\"])([^'\"]+)\1", re.IGNORECASE)
MESSAGE_FALLBACK_PATTERN = re.compile(r"(?:['\"]?fallbackPageId['\"]?)\s*:\s*(['\"])([^'\"]+)\1", re.IGNORECASE)
PROTODOCK_BACK_PATTERN = re.compile(
    r"(?:window\s*\.\s*)?ProtoDockPreview\s*\??\.\s*back\s*\(\s*(?:(['\"])([^'\"]+)\1)?",
    re.IGNORECASE,
)
BACK_BRIDGE_ATTRIBUTE_PATTERN = re.compile(
    r"data-protodock-back|dataset\s*\.\s*protodockBack",
    re.IGNORECASE,
)
CLICK_BINDING_PATTERN = re.compile(
    r"addEventListener\s*\(\s*(['\"])click\1|\.\s*onclick\s*=",
    re.IGNORECASE,
)
HISTORY_BACK_PATTERN = re.compile(
    r"(?:window\s*\.\s*)?history\s*\.\s*(?:back\s*\(|go\s*\(\s*-1\s*\))",
    re.IGNORECASE,
)
BACK_LABELS = {"返回", "后退", "上一页", "返回上一页", "back", "goback"}
BACK_ACTIONS = {"back", "go-back", "navigate-back", "return"}
PRODUCT_DOC_SECTIONS = (
    ("页面定位", {"页面定位", "功能定位", "功能与页面定位"}),
    ("使用场景", {"使用场景", "用户场景"}),
    ("前置条件", {"前置条件"}),
    ("页面内容", {"页面内容", "页面结构", "功能内容"}),
    ("交互规则", {"交互规则", "主流程", "交互流程"}),
    ("业务规则", {"业务规则"}),
    ("状态与异常", {"状态与异常", "异常与空状态", "异常与边界", "异常处理"}),
    ("数据影响", {"数据影响", "数据规则"}),
    ("产品验收", {"产品验收", "产品验收标准", "验收标准"}),
    ("非本期范围", {"非本期范围", "非目标", "本期不包含"}),
)
TECHNICAL_DOC_HEADINGS = {"源码", "源码位置", "原型入口", "react来源", "技术实现", "实现说明"}
MARKDOWN_HEADING_PATTERN = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.MULTILINE)
CHINESE_ACCEPTANCE_LABELS = ("前提", "操作", "预期")


def validate_changelog(manifest: dict) -> dict:
    entries = manifest.get("changelog") if isinstance(manifest, dict) else None
    issues = []
    warnings = []
    if entries is None or entries == []:
        warnings.append("项目尚未记录 changelog；下一次修改应追加版本、时间和变更内容")
        return {
            "issues": issues,
            "warnings": warnings,
            "stats": {"changeLogCount": 0, "currentVersion": ""},
        }
    if not isinstance(entries, list):
        return {
            "issues": ["changelog 必须是数组"],
            "warnings": warnings,
            "stats": {"changeLogCount": 0, "currentVersion": ""},
        }

    previous_time = None
    current_version = ""
    for index, entry in enumerate(entries):
        label = f"changelog[{index}]"
        if not isinstance(entry, dict):
            issues.append(f"{label} 必须是对象")
            continue
        version = str(entry.get("version") or "").strip()
        changed_at = str(entry.get("changedAt") or "").strip()
        description = str(entry.get("description") or "").strip()
        if not version:
            issues.append(f"{label}.version 不能为空")
        if not description:
            issues.append(f"{label}.description 不能为空")
        parsed_time = None
        if not changed_at:
            issues.append(f"{label}.changedAt 不能为空")
        else:
            try:
                parsed_time = datetime.fromisoformat(changed_at.replace("Z", "+00:00"))
                if parsed_time.tzinfo is None:
                    issues.append(f"{label}.changedAt 必须包含时区")
                    parsed_time = None
            except ValueError:
                issues.append(f"{label}.changedAt 必须是 ISO 8601 日期时间")
        if parsed_time and previous_time and parsed_time < previous_time:
            warnings.append(f"{label}.changedAt 早于上一条记录；当前版本仍按数组末项判断")
        if parsed_time:
            previous_time = parsed_time
        if version:
            current_version = version

    return {
        "issues": issues,
        "warnings": warnings,
        "stats": {
            "changeLogCount": len(entries),
            "currentVersion": current_version,
        },
    }


def normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    return "".join(character for character in text if character.isalnum())


def action_text(value: str) -> str:
    normalized = normalize_text(value)
    previous = ""
    while normalized and normalized != previous:
        previous = normalized
        normalized = ACTION_PREFIX.sub("", normalized)
    return normalized


def markdown_heading_key(value: str) -> str:
    return normalize_text(re.sub(r"[`*_~]", "", value))


def markdown_section(source: str, aliases: set[str]) -> str:
    alias_keys = {markdown_heading_key(alias) for alias in aliases}
    headings = list(MARKDOWN_HEADING_PATTERN.finditer(source))
    for index, heading in enumerate(headings):
        if markdown_heading_key(heading.group(1)) not in alias_keys:
            continue
        level = len(heading.group(0)) - len(heading.group(0).lstrip("#"))
        end = len(source)
        for following in headings[index + 1:]:
            following_level = len(following.group(0)) - len(following.group(0).lstrip("#"))
            if following_level <= level:
                end = following.start()
                break
        return source[heading.end():end]
    return ""


def validate_product_documents(project_dir: Path, manifest: dict) -> dict:
    project_root = project_dir.resolve()
    pages = manifest.get("pages", {}) if isinstance(manifest, dict) else {}
    warnings = []
    scanned_count = 0
    compliant_count = 0
    acceptance_count = 0
    missing_section_count = 0

    for page_id, page in pages.items():
        if not isinstance(page, dict):
            continue
        doc = str(page.get("doc") or "").strip()
        doc_path = (project_root / doc).resolve()
        if not doc or not doc_path.is_file() or project_root not in doc_path.parents:
            continue
        try:
            source = doc_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            warnings.append(f"{page_id} · {doc} 不是 UTF-8，未执行产品文档质量检查")
            continue

        scanned_count += 1
        page_warnings = []
        headings = {
            markdown_heading_key(match.group(1))
            for match in MARKDOWN_HEADING_PATTERN.finditer(source)
        }
        missing_sections = [
            canonical
            for canonical, aliases in PRODUCT_DOC_SECTIONS
            if not headings.intersection(markdown_heading_key(alias) for alias in aliases)
        ]
        if missing_sections:
            missing_section_count += len(missing_sections)
            page_warnings.append(
                f"缺少产品文档章节：{'、'.join(missing_sections)}"
            )

        acceptance_aliases = next(
            aliases for canonical, aliases in PRODUCT_DOC_SECTIONS if canonical == "产品验收"
        )
        acceptance = markdown_section(source, acceptance_aliases)
        missing_labels = [
            label
            for label in CHINESE_ACCEPTANCE_LABELS
            if not re.search(rf"(?:^|\n)\s*[-*]\s*{label}\s*[：:]", acceptance)
        ]
        if acceptance and not missing_labels:
            acceptance_count += 1
        elif acceptance:
            page_warnings.append(
                f"产品验收缺少中文场景字段：{'、'.join(missing_labels)}；请使用“前提 / 操作 / 预期”"
            )

        placeholder_count = source.count("<!-- 请填写")
        if placeholder_count:
            page_warnings.append(f"仍有 {placeholder_count} 处“请填写”占位内容")

        technical_headings = sorted(
            heading for heading in headings if heading in TECHNICAL_DOC_HEADINGS
        )
        if technical_headings:
            page_warnings.append(
                f"PRD 主体包含技术章节：{'、'.join(technical_headings)}；源码路径应放在 ProtoDock 页面信息中"
            )

        if page_warnings:
            warnings.extend(f"{page_id} · {doc}：{warning}" for warning in page_warnings)
        else:
            compliant_count += 1

    return {
        "issues": [],
        "warnings": list(dict.fromkeys(warnings)),
        "stats": {
            "scannedDocumentCount": scanned_count,
            "compliantDocumentCount": compliant_count,
            "acceptanceFormatCount": acceptance_count,
            "missingProductDocSectionCount": missing_section_count,
            "productDocWarningCount": len(list(dict.fromkeys(warnings))),
        },
    }


def clean_relative_path(value: str) -> str:
    parts = []
    for part in str(value or "").replace("\\", "/").split("/"):
        if not part or part == ".":
            continue
        if part == "..":
            if parts:
                parts.pop()
            continue
        parts.append(part)
    return "/".join(parts)


def resolve_project_path(current_entry: str, target: str) -> str:
    target_text = str(target or "").strip()
    if not target_text or target_text.startswith("#"):
        return ""
    parsed = urlsplit(target_text)
    if parsed.scheme or parsed.netloc:
        return ""
    target_path = unquote(parsed.path)
    if not target_path:
        return ""
    if target_path.startswith("/"):
        return clean_relative_path(target_path)
    current_parent = PurePosixPath(clean_relative_path(current_entry)).parent
    return clean_relative_path((current_parent / target_path).as_posix())


def page_for_entry(manifest: dict, current_page_id: str, target: str) -> str | None:
    resolved = resolve_project_path(manifest.get("pages", {}).get(current_page_id, {}).get("entry", ""), target)
    if not resolved:
        return None
    resolved_without_html = re.sub(r"\.html?$", "", resolved, flags=re.IGNORECASE)
    matches = []
    for page_id, page in manifest.get("pages", {}).items():
        entry = clean_relative_path(page.get("entry", "")) if isinstance(page, dict) else ""
        entry_without_html = re.sub(r"\.html?$", "", entry, flags=re.IGNORECASE)
        if entry and (resolved == entry or resolved_without_html == entry_without_html):
            matches.append(page_id)
    return matches[0] if len(matches) == 1 else None


class PrototypeHTMLParser(HTMLParser):
    def __init__(self, page_id: str):
        super().__init__(convert_charrefs=True)
        self.page_id = page_id
        self.controls = []
        self.inline_scripts = []
        self.script_sources = []
        self._control_stack = []
        self._script = None

    def handle_starttag(self, tag, attrs):
        attributes = {str(name).lower(): value or "" for name, value in attrs}
        input_type = attributes.get("type", "").lower()
        has_navigation_attribute = any(
            name in attributes
            for name in (*EXPLICIT_TARGET_ATTRIBUTES, *LEGACY_TARGET_ATTRIBUTES, BACK_TARGET_ATTRIBUTE)
        ) or "href" in attributes
        is_control = (
            tag in CONTROL_TAGS
            or attributes.get("role", "").lower() == "button"
            or (tag == "input" and input_type in {"button", "submit"})
            or has_navigation_attribute
        )
        control = None
        if is_control:
            control = {
                "tag": tag,
                "attrs": attributes,
                "line": self.getpos()[0],
                "text": [],
            }
            self.controls.append(control)
        if tag not in VOID_TAGS:
            self._control_stack.append((tag, control))
        if tag == "script":
            source = attributes.get("src", "").strip()
            if source:
                self.script_sources.append((source, self.getpos()[0]))
            else:
                self._script = {"line": self.getpos()[0], "text": []}

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == "script" and self._script is not None:
            self.inline_scripts.append(self._script)
            self._script = None
        for index in range(len(self._control_stack) - 1, -1, -1):
            if self._control_stack[index][0] == tag:
                del self._control_stack[index:]
                break

    def handle_data(self, data):
        if self._script is not None:
            self._script["text"].append(data)
        for _, control in self._control_stack:
            if control is not None:
                control["text"].append(data)


def node_counts(manifest: dict) -> dict[str, int]:
    counts = {}
    canvas = manifest.get("canvas") if isinstance(manifest, dict) else {}
    for node in canvas.get("nodes", []) if isinstance(canvas, dict) else []:
        if not isinstance(node, dict):
            continue
        page_id = str(node.get("pageId") or "").strip()
        if page_id:
            counts[page_id] = counts.get(page_id, 0) + 1
    return counts


def outgoing_edge_labels(manifest: dict, page_id: str) -> set[str]:
    canvas = manifest.get("canvas") if isinstance(manifest, dict) else {}
    nodes = canvas.get("nodes", []) if isinstance(canvas, dict) else []
    edges = canvas.get("edges", []) if isinstance(canvas, dict) else []
    source_ids = {node.get("id") for node in nodes if isinstance(node, dict) and node.get("pageId") == page_id}
    labels = set()
    for edge in edges:
        if not isinstance(edge, dict) or edge.get("from") not in source_ids:
            continue
        label = str(edge.get("label") or "").strip()
        if label:
            labels.add(normalize_text(label))
            labels.add(action_text(label))
    return labels


def control_label(control: dict) -> str:
    attributes = control["attrs"]
    value = (
        attributes.get("aria-label")
        or attributes.get("title")
        or attributes.get("value")
        or "".join(control["text"])
    )
    return re.sub(r"\s+", " ", value).strip() or f"<{control['tag']}>"


def is_back_control(control: dict) -> bool:
    attributes = control["attrs"]
    if BACK_TARGET_ATTRIBUTE in attributes:
        return True
    if attributes.get("data-action", "").strip().lower() in BACK_ACTIONS:
        return True
    inline_navigation = f"{attributes.get('onclick', '')} {attributes.get('href', '')}"
    if HISTORY_BACK_PATTERN.search(inline_navigation):
        return True
    identifier = f"{attributes.get('id', '')} {attributes.get('class', '')}"
    if re.search(r"(?:^|[\s_-])(?:back|return)(?:$|[\s_-])", identifier, re.IGNORECASE):
        return True
    return normalize_text(control_label(control)) in BACK_LABELS


def back_target_from_control(control: dict) -> tuple[str, str] | None:
    attributes = control["attrs"]
    if BACK_TARGET_ATTRIBUTE in attributes:
        return BACK_TARGET_ATTRIBUTE, attributes[BACK_TARGET_ATTRIBUTE].strip()
    inline_handler = attributes.get("onclick", "")
    api_match = PROTODOCK_BACK_PATTERN.search(inline_handler)
    if api_match:
        return "ProtoDockPreview.back", str(api_match.group(2) or "").strip()
    for message_match in POST_MESSAGE_PATTERN.finditer(inline_handler):
        body = message_match.group("body")
        if not MESSAGE_BACK_TYPE_PATTERN.search(body):
            continue
        fallback_match = MESSAGE_FALLBACK_PATTERN.search(body)
        return "protodock:back message", fallback_match.group(2).strip() if fallback_match else ""
    return None


def has_back_message(script: str) -> bool:
    return any(
        MESSAGE_BACK_TYPE_PATTERN.search(match.group("body"))
        for match in POST_MESSAGE_PATTERN.finditer(script)
    )


def has_complete_inline_back_bridge(control: dict) -> bool:
    handler = control["attrs"].get("onclick", "")
    return bool(PROTODOCK_BACK_PATTERN.search(handler) and has_back_message(handler))


def back_bridge_missing_capabilities(script: str) -> list[str]:
    checks = (
        ("data-protodock-back 控件选择", BACK_BRIDGE_ATTRIBUTE_PATTERN.search(script)),
        ("click 事件绑定", CLICK_BINDING_PATTERN.search(script)),
        ("ProtoDockPreview.back() 调用", PROTODOCK_BACK_PATTERN.search(script)),
        ("protodock:back postMessage 兜底", has_back_message(script)),
    )
    return [label for label, matched in checks if not matched]


def collect_page_scripts(
    parser: PrototypeHTMLParser,
    *,
    page_id: str,
    entry: str,
    entry_path: Path,
    project_root: Path,
    scanned_script_contexts: set,
) -> dict:
    records = [
        {
            "source": "".join(inline_script["text"]),
            "file": entry,
            "line": inline_script["line"],
        }
        for inline_script in parser.inline_scripts
    ]
    issues = []
    warnings = []
    files = set()

    for script_source, source_line in parser.script_sources:
        parsed_source = urlsplit(script_source)
        if parsed_source.scheme or parsed_source.netloc:
            if LOCAL_URL_PATTERN.search(script_source):
                issues.append(f"{page_id} · {entry}:{source_line} 的脚本引用了本地 URL：{script_source}")
            continue
        resolved = (entry_path.parent / unquote(parsed_source.path)).resolve()
        script_context = (page_id, resolved)
        if project_root not in resolved.parents or not resolved.is_file() or script_context in scanned_script_contexts:
            continue
        scanned_script_contexts.add(script_context)
        files.add(resolved)
        try:
            script = resolved.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            warnings.append(f"{page_id} · {resolved.relative_to(project_root)} 不是 UTF-8，未执行导航扫描")
            continue
        records.append({
            "source": script,
            "file": resolved.relative_to(project_root).as_posix(),
            "line": 1,
        })
    return {"records": records, "issues": issues, "warnings": warnings, "files": files}


def target_from_control(control: dict) -> tuple[str, str] | None:
    attributes = control["attrs"]
    for name in EXPLICIT_TARGET_ATTRIBUTES:
        if name in attributes:
            return name, attributes[name].strip()
    href = attributes.get("href", "").strip()
    match = re.match(r"^(?:#)?protodock:(?://)?(.+)$", href, re.IGNORECASE)
    if match:
        return "href", unquote(match.group(1)).lstrip("/")
    return None


def validate_route_target(
    manifest: dict,
    counts: dict[str, int],
    source_page_id: str,
    target_page_id: str,
    location: str,
) -> tuple[list[str], dict | None]:
    pages = manifest.get("pages", {})
    if not target_page_id or "${" in target_page_id or "{{" in target_page_id:
        return [f"{location} 的 ProtoDock 目标无法静态解析：{target_page_id or '(空)'}"], None
    if target_page_id not in pages:
        return [f"{location} 指向未注册页面：{target_page_id}"], None
    if counts.get(target_page_id, 0) != 1:
        return [f"{location} 的目标 {target_page_id} 必须且只能对应一个 Canvas 节点"], None
    page = pages[target_page_id]
    return [], {
        "sourcePageId": source_page_id,
        "targetPageId": target_page_id,
        "targetEntry": page.get("entry", "") if isinstance(page, dict) else "",
    }


def scan_script(
    script: str,
    *,
    manifest: dict,
    counts: dict[str, int],
    page_id: str,
    file_label: str,
    first_line: int = 1,
) -> dict:
    issues = []
    routes = []
    lines = script.splitlines() or [script]
    for index, line in enumerate(lines):
        line_number = first_line + index
        location = f"{page_id} · {file_label}:{line_number}"
        location_write = LOCATION_WRITE_PATTERN.search(line)
        if location_write:
            issues.append(f"{location} 使用脚本 location 跳转；请改为显式 ProtoDock pageId")
        if HISTORY_BACK_PATTERN.search(line):
            issues.append(f"{location} 使用 history.back()/history.go(-1)；请改为 ProtoDockPreview.back()")
        if LOCAL_URL_PATTERN.search(line):
            issues.append(f"{location} 包含 localhost、file:// 或本地绝对路径")
        root_match = ROOT_PAGE_PATTERN.search(line)
        path_assignment = re.search(r"\b(?:href|url|route|path)\b\s*['\"]?\s*[:=]", line, re.IGNORECASE)
        if root_match and (location_write or path_assignment):
            issues.append(f"{location} 使用脱离项目作用域的根路径：{root_match.group(1)}")
        for match in NAVIGATE_CALL_PATTERN.finditer(line):
            target = match.group(2).strip()
            target_issues, route = validate_route_target(manifest, counts, page_id, target, location)
            issues.extend(target_issues)
            if route:
                route.update({"control": "ProtoDockPreview.navigate", "file": file_label, "line": line_number})
                routes.append(route)
        for match in PROTODOCK_BACK_PATTERN.finditer(line):
            fallback_page_id = str(match.group(2) or "").strip()
            if fallback_page_id:
                target_issues, route = validate_route_target(
                    manifest, counts, page_id, fallback_page_id, location
                )
                issues.extend(target_issues)
                if route:
                    route.update({"control": "ProtoDockPreview.back", "file": file_label, "line": line_number})
                    routes.append(route)
            else:
                routes.append({
                    "sourcePageId": page_id,
                    "targetPageId": "(history)",
                    "targetEntry": "",
                    "control": "ProtoDockPreview.back",
                    "file": file_label,
                    "line": line_number,
                })

    for match in POST_MESSAGE_PATTERN.finditer(script):
        body = match.group("body")
        is_navigate_message = MESSAGE_TYPE_PATTERN.search(body)
        is_back_message = MESSAGE_BACK_TYPE_PATTERN.search(body)
        if not is_navigate_message and not is_back_message:
            continue
        line_number = first_line + script.count("\n", 0, match.start())
        location = f"{page_id} · {file_label}:{line_number}"
        if is_back_message:
            fallback_match = MESSAGE_FALLBACK_PATTERN.search(body)
            fallback_page_id = fallback_match.group(2).strip() if fallback_match else ""
            if fallback_page_id:
                target_issues, route = validate_route_target(
                    manifest, counts, page_id, fallback_page_id, location
                )
                issues.extend(target_issues)
                if route:
                    route.update({"control": "protodock:back message", "file": file_label, "line": line_number})
                    routes.append(route)
            else:
                routes.append({
                    "sourcePageId": page_id,
                    "targetPageId": "(history)",
                    "targetEntry": "",
                    "control": "protodock:back message",
                    "file": file_label,
                    "line": line_number,
                })
            continue
        page_match = MESSAGE_PAGE_PATTERN.search(body)
        if not page_match:
            issues.append(f"{location} 的 protodock:navigate 消息缺少可静态解析的 pageId")
            continue
        target = page_match.group(2).strip()
        target_issues, route = validate_route_target(manifest, counts, page_id, target, location)
        issues.extend(target_issues)
        if route:
            route.update({"control": "protodock:navigate message", "file": file_label, "line": line_number})
            routes.append(route)
    return {"issues": issues, "routes": routes}


def validate_cross_page_navigation(project_dir: Path, manifest: dict) -> dict:
    project_root = project_dir.resolve()
    pages = manifest.get("pages", {}) if isinstance(manifest, dict) else {}
    counts = node_counts(manifest)
    issues = []
    warnings = []
    routes = []
    scanned_files = set()
    scanned_page_ids = set()
    scanned_script_contexts = set()
    back_bridge_page_count = 0

    for page_id, page in pages.items():
        if not isinstance(page, dict):
            continue
        entry = str(page.get("entry") or "")
        entry_path = (project_root / entry).resolve()
        if not entry_path.is_file() or project_root not in entry_path.parents:
            continue
        try:
            source = entry_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            warnings.append(f"{page_id} · {entry} 不是 UTF-8，未执行跨页导航扫描")
            continue
        scanned_files.add(entry_path)
        scanned_page_ids.add(page_id)
        parser = PrototypeHTMLParser(page_id)
        try:
            parser.feed(source)
        except Exception as error:
            issues.append(f"{page_id} · {entry} 无法解析 HTML：{error}")
            continue

        page_scripts = collect_page_scripts(
            parser,
            page_id=page_id,
            entry=entry,
            entry_path=entry_path,
            project_root=project_root,
            scanned_script_contexts=scanned_script_contexts,
        )
        issues.extend(page_scripts["issues"])
        warnings.extend(page_scripts["warnings"])
        scanned_files.update(page_scripts["files"])

        back_controls = [
            control
            for control in parser.controls
            if BACK_TARGET_ATTRIBUTE in control["attrs"]
        ]
        if back_controls:
            inline_bridge_complete = all(
                has_complete_inline_back_bridge(control)
                for control in back_controls
            )
            missing_capabilities = []
            if not inline_bridge_complete:
                combined_script = "\n".join(record["source"] for record in page_scripts["records"])
                missing_capabilities = back_bridge_missing_capabilities(combined_script)
            if missing_capabilities:
                issues.append(
                    f"{page_id} · {entry} 声明了 data-protodock-back，"
                    f"但页面自带返回桥接不完整，缺少：{'、'.join(missing_capabilities)}；"
                    "不能只依赖 ProtoDock 宿主自动拦截"
                )
            else:
                back_bridge_page_count += 1

        edge_labels = outgoing_edge_labels(manifest, page_id)
        for control in parser.controls:
            label = control_label(control)
            location = f"{page_id} · {entry}:{control['line']} · {label}"
            attributes = control["attrs"]
            explicit_back = back_target_from_control(control)
            if explicit_back:
                back_mechanism, fallback_page_id = explicit_back
                if fallback_page_id:
                    target_issues, route = validate_route_target(
                        manifest, counts, page_id, fallback_page_id, location
                    )
                    issues.extend(target_issues)
                    if route:
                        route.update({
                            "control": label if back_mechanism == BACK_TARGET_ATTRIBUTE else back_mechanism,
                            "file": entry,
                            "line": control["line"],
                        })
                        routes.append(route)
                else:
                    routes.append({
                        "sourcePageId": page_id,
                        "targetPageId": "(history)",
                        "targetEntry": "",
                        "control": label if back_mechanism == BACK_TARGET_ATTRIBUTE else back_mechanism,
                        "file": entry,
                        "line": control["line"],
                    })
                continue
            if is_back_control(control):
                issues.append(
                    f"{location} 是返回控件但未声明 data-protodock-back；"
                    "history.back() 和空点击处理不能通过交付校验"
                )
                continue
            explicit = target_from_control(control)
            if explicit:
                _, target = explicit
                target_issues, route = validate_route_target(manifest, counts, page_id, target, location)
                issues.extend(target_issues)
                if route:
                    route.update({"control": label, "file": entry, "line": control["line"]})
                    routes.append(route)
                continue

            legacy = next((name for name in LEGACY_TARGET_ATTRIBUTES if name in attributes), None)
            if legacy:
                target = attributes[legacy].strip()
                if target == page_id and control["tag"] not in CONTROL_TAGS and attributes.get("role") != "button":
                    continue
                issues.append(f"{location} 使用旧导航属性 {legacy}={target or '(空)'}；请改为 data-protodock-page")
                continue

            href = attributes.get("href", "").strip()
            if href:
                if LOCAL_URL_PATTERN.search(href):
                    issues.append(f"{location} 包含 localhost、file:// 或本地绝对路径：{href}")
                    continue
                if href.startswith("/pages/"):
                    issues.append(f"{location} 使用脱离项目作用域的根路径：{href}")
                    continue
                linked_page = page_for_entry(manifest, page_id, href)
                if linked_page and linked_page != page_id:
                    issues.append(f"{location} 通过普通路径跳到 {linked_page}；请显式声明 ProtoDock pageId")
                    continue

            normalized_label = normalize_text(label)
            normalized_action = action_text(label)
            if normalized_label in edge_labels or (normalized_action and normalized_action in edge_labels):
                issues.append(f"{location} 仅依赖 Canvas 连线文案推断目标；请显式声明 ProtoDock pageId")

        for script_record in page_scripts["records"]:
            result = scan_script(
                script_record["source"],
                manifest=manifest,
                counts=counts,
                page_id=page_id,
                file_label=script_record["file"],
                first_line=script_record["line"],
            )
            issues.extend(result["issues"])
            routes.extend(result["routes"])

    deduplicated_issues = list(dict.fromkeys(issues))
    route_keys = set()
    deduplicated_routes = []
    for route in routes:
        key = (route["sourcePageId"], route["targetPageId"], route["file"], route["line"], route["control"])
        if key in route_keys:
            continue
        route_keys.add(key)
        deduplicated_routes.append(route)
    return {
        "issues": deduplicated_issues,
        "warnings": list(dict.fromkeys(warnings)),
        "routes": deduplicated_routes,
        "stats": {
            "scannedPageCount": len(scanned_page_ids),
            "scannedFileCount": len(scanned_files),
            "routeCount": len(deduplicated_routes),
            "navigationIssueCount": len(deduplicated_issues),
            "backBridgePageCount": back_bridge_page_count,
        },
    }
