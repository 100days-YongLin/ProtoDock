from __future__ import annotations

import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit


EXPLICIT_TARGET_ATTRIBUTES = ("data-protodock-page", "data-protodock-target")
LEGACY_TARGET_ATTRIBUTES = ("data-page", "data-page-id", "data-target-page", "data-url", "data-href")
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
MESSAGE_PAGE_PATTERN = re.compile(r"(?:['\"]?pageId['\"]?)\s*:\s*(['\"])([^'\"]+)\1", re.IGNORECASE)


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
            for name in (*EXPLICIT_TARGET_ATTRIBUTES, *LEGACY_TARGET_ATTRIBUTES)
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

    for match in POST_MESSAGE_PATTERN.finditer(script):
        body = match.group("body")
        if not MESSAGE_TYPE_PATTERN.search(body):
            continue
        page_match = MESSAGE_PAGE_PATTERN.search(body)
        line_number = first_line + script.count("\n", 0, match.start())
        location = f"{page_id} · {file_label}:{line_number}"
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

        edge_labels = outgoing_edge_labels(manifest, page_id)
        for control in parser.controls:
            label = control_label(control)
            location = f"{page_id} · {entry}:{control['line']} · {label}"
            explicit = target_from_control(control)
            if explicit:
                _, target = explicit
                target_issues, route = validate_route_target(manifest, counts, page_id, target, location)
                issues.extend(target_issues)
                if route:
                    route.update({"control": label, "file": entry, "line": control["line"]})
                    routes.append(route)
                continue

            attributes = control["attrs"]
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

        for inline_script in parser.inline_scripts:
            result = scan_script(
                "".join(inline_script["text"]),
                manifest=manifest,
                counts=counts,
                page_id=page_id,
                file_label=entry,
                first_line=inline_script["line"],
            )
            issues.extend(result["issues"])
            routes.extend(result["routes"])

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
            scanned_files.add(resolved)
            try:
                script = resolved.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                warnings.append(f"{page_id} · {resolved.relative_to(project_root)} 不是 UTF-8，未执行导航扫描")
                continue
            result = scan_script(
                script,
                manifest=manifest,
                counts=counts,
                page_id=page_id,
                file_label=resolved.relative_to(project_root).as_posix(),
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
        },
    }
