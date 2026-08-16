#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import math
import mimetypes
import os
import posixpath
import re
import secrets
import shutil
import stat
import subprocess
import tempfile
import time
import zipfile
from email import policy
from email.parser import BytesParser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path, PurePosixPath
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import quote, unquote, urlparse


ROOT = Path(__file__).resolve().parent
SHARES_DIR = ROOT / "shares"
DOCS_EXPORT_DIR = ROOT / "docs-dist"
SECRETS_DIR = ROOT / ".secrets"
GITHUB_WORK_DIR = ROOT / ".github-work"
MANIFEST_FILE = "protodock.project.json"

MAX_UPLOAD_BYTES = int(os.environ.get("PROTODOCK_MAX_UPLOAD_BYTES", 100 * 1024 * 1024))
MAX_EXTRACTED_BYTES = int(os.environ.get("PROTODOCK_MAX_EXTRACTED_BYTES", 250 * 1024 * 1024))
MAX_FILE_BYTES = int(os.environ.get("PROTODOCK_MAX_FILE_BYTES", 80 * 1024 * 1024))
GITHUB_REPO_URL = os.environ.get("PROTODOCK_GITHUB_REPO", "").strip()
GITHUB_AUTH_MODE = os.environ.get("PROTODOCK_GITHUB_AUTH", "").strip().lower()
GITHUB_KEY_PATH = Path(os.environ.get("PROTODOCK_GITHUB_KEY_PATH", SECRETS_DIR / "github-deploy-key")).expanduser()
GITHUB_APP_ID = os.environ.get("PROTODOCK_GITHUB_APP_ID", "").strip()
GITHUB_INSTALLATION_ID = os.environ.get("PROTODOCK_GITHUB_INSTALLATION_ID", "").strip()
GITHUB_APP_KEY_PATH = Path(os.environ.get("PROTODOCK_GITHUB_APP_KEY_PATH", SECRETS_DIR / "github-app.private-key.pem")).expanduser()
GITHUB_AUTHOR_NAME = os.environ.get("PROTODOCK_GITHUB_AUTHOR_NAME", "ProtoDock")
GITHUB_AUTHOR_EMAIL = os.environ.get("PROTODOCK_GITHUB_AUTHOR_EMAIL", "protodock@localhost")
GITHUB_PUSH_TIMEOUT_SECONDS = int(os.environ.get("PROTODOCK_GITHUB_PUSH_TIMEOUT_SECONDS", "120"))
GITHUB_OPEN_TIMEOUT_SECONDS = int(os.environ.get("PROTODOCK_GITHUB_OPEN_TIMEOUT_SECONDS", "120"))
GITHUB_PROXY = os.environ.get("PROTODOCK_GITHUB_PROXY", "").strip()
UPLOAD_ORIGIN = os.environ.get("PROTODOCK_UPLOAD_ORIGIN", "").strip()

ALLOWED_ROOT_FILES = {MANIFEST_FILE}
ALLOWED_ROOT_DIRS = {"pages", "docs", "assets"}
PRIVATE_ROOT_NAMES = {
    ".git",
    ".github-work",
    ".secrets",
    "shares",
    "protodock",
    "node_modules",
    "exports",
    "docs-site",
    "docs-dist",
}
PRIVATE_STATIC_FILES = {"server.py", "protodock.log", "protodock.pid"}
DOCS_ASSET_ROOTS = {"_next", "favicons", "images", "logo"}
DOCS_PAGE_ROOTS = {
    "quickstart",
    "project-structure",
    "ai-agent-workflow",
    "ai-agent-tools",
    "ai-agent-skills",
    "ai-agent-prompts",
    "canvas-workflow",
    "conflict-handling",
    "sharing",
    "deployment",
    "agent-boundaries",
}


class ProtoDockError(Exception):
    def __init__(self, status: HTTPStatus, message: str, *, code: str = "", details: list[str] | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code
        self.details = details or []


def is_valid_share_id(value: str) -> bool:
    return 6 <= len(value) <= 80 and all(char.isalnum() or char in "_-" for char in value)


def clean_zip_name(name: str) -> PurePosixPath | None:
    normalized = name.replace("\\", "/")
    if normalized.startswith("/") or ":" in normalized.split("/", 1)[0]:
        return None
    path = PurePosixPath(posixpath.normpath(normalized))
    if str(path) in {"", "."} or any(part in {"", ".", ".."} for part in path.parts):
        return None
    return path


def validate_archive_root(zip_file: zipfile.ZipFile) -> None:
    paths = [clean_zip_name(info.filename) for info in zip_file.infolist()]
    paths = [path for path in paths if path is not None]
    if any(str(path) == MANIFEST_FILE for path in paths):
        return
    nested_manifests = sorted(str(path) for path in paths if path.name == MANIFEST_FILE)
    if len(nested_manifests) == 1:
        manifest_path = nested_manifests[0]
        raise ProtoDockError(
            HTTPStatus.BAD_REQUEST,
            f"检测到多余外层目录：{manifest_path}。请让 {MANIFEST_FILE} 直接位于 ZIP 根目录后重新打包。",
            code="INVALID_ARCHIVE_ROOT",
            details=[manifest_path],
        )
    if nested_manifests:
        raise ProtoDockError(
            HTTPStatus.BAD_REQUEST,
            "ZIP 中存在多个 protodock.project.json，无法确定项目根目录。",
            code="MULTIPLE_MANIFESTS",
            details=nested_manifests,
        )
    raise ProtoDockError(
        HTTPStatus.BAD_REQUEST,
        "ZIP 根目录缺少 protodock.project.json。请上传 ProtoDock 专用上传包，不要上传完整交付包。",
        code="MANIFEST_MISSING",
    )
def allowed_project_path(path: PurePosixPath) -> bool:
    if len(path.parts) == 1:
        return path.name in ALLOWED_ROOT_FILES
    return path.parts[0] in ALLOWED_ROOT_DIRS


def safe_target_path(root: Path, relative: PurePosixPath) -> Path:
    target = (root / Path(*relative.parts)).resolve()
    root_resolved = root.resolve()
    if os.path.commonpath([root_resolved, target]) != str(root_resolved):
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "zip 包含非法路径")
    return target


def is_zip_symlink(info: zipfile.ZipInfo) -> bool:
    mode = info.external_attr >> 16
    return stat.S_ISLNK(mode)


def manifest_relative_path(value, label: str, expected_root: str) -> PurePosixPath:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{label} 未填写")
    if "\\" in text or text.startswith(("/", "//")) or re.match(r"^[A-Za-z]:", text):
        raise ValueError(f"{label} 必须是相对于项目根目录（ZIP 根目录）的路径：{text}")
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", text) or "localhost" in text.lower():
        raise ValueError(f"{label} 不能使用 URL、localhost 或外部依赖：{text}")
    if "?" in text or "#" in text:
        raise ValueError(f"{label} 不能包含查询参数或锚点：{text}")
    path = clean_zip_name(text)
    if path is None or not path.parts or path.parts[0] != expected_root:
        raise ValueError(f"{label} 必须位于 {expected_root}/ 并相对于项目根目录（ZIP 根目录）：{text}")
    return path


CANVAS_NODE_SIZES = {
    "web-landscape": (480, 348),
    "web-portrait": (360, 624),
    "iphone-portrait": (188, 429),
    "iphone-landscape": (236, 157),
    "ipad-portrait": (174, 290),
    "ipad-landscape": (236, 212),
}


def finite_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def canvas_node_rect(node: dict, size: tuple[int, int]) -> tuple[float, float, float, float]:
    x = float(node["x"])
    y = float(node["y"])
    return x, y, x + size[0], y + size[1]


def rects_overlap(first, second) -> bool:
    return first[0] < second[2] and first[2] > second[0] and first[1] < second[3] and first[3] > second[1]


def rect_gap(first, second) -> tuple[float, float]:
    horizontal = max(0.0, max(first[0], second[0]) - min(first[2], second[2]))
    vertical = max(0.0, max(first[1], second[1]) - min(first[3], second[3]))
    return horizontal, vertical


def segment_orientation(first, second, third) -> float:
    return (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0])


def segments_cross(first_start, first_end, second_start, second_end) -> bool:
    first_a = segment_orientation(first_start, first_end, second_start)
    first_b = segment_orientation(first_start, first_end, second_end)
    second_a = segment_orientation(second_start, second_end, first_start)
    second_b = segment_orientation(second_start, second_end, first_end)
    epsilon = 1e-9
    return first_a * first_b < -epsilon and second_a * second_b < -epsilon


def segment_intersects_rect(start, end, rect) -> bool:
    left, top, right, bottom = rect
    if left <= start[0] <= right and top <= start[1] <= bottom:
        return True
    if left <= end[0] <= right and top <= end[1] <= bottom:
        return True
    corners = ((left, top), (right, top), (right, bottom), (left, bottom))
    return any(
        segments_cross(start, end, corners[index], corners[(index + 1) % 4])
        for index in range(4)
    )


def validate_canvas_layout(manifest: dict) -> dict:
    pages = manifest.get("pages") if isinstance(manifest, dict) else {}
    canvas = manifest.get("canvas") if isinstance(manifest, dict) else None
    issues = []
    warnings = []
    if not isinstance(canvas, dict):
        return {
            "issues": ["canvas 必须是对象"],
            "warnings": [],
            "stats": {
                "pageCount": len(pages) if isinstance(pages, dict) else 0,
                "nodeCount": 0,
                "uniqueNodeCount": 0,
                "duplicateNodeCount": 0,
                "duplicatePageNodeCount": 0,
                "danglingEdgeCount": 0,
                "duplicateEdgeCount": 0,
                "nodeOverlapCount": 0,
                "unrelatedEdgeCrossingCount": 0,
                "edgeThroughNodeCount": 0,
                "insufficientSpacingCount": 0,
            },
        }

    nodes = canvas.get("nodes")
    edges = canvas.get("edges")
    if not isinstance(nodes, list):
        issues.append("canvas.nodes 必须是数组")
        nodes = []
    if not isinstance(edges, list):
        issues.append("canvas.edges 必须是数组")
        edges = []

    page_ids = set(pages) if isinstance(pages, dict) else set()
    node_by_id = {}
    node_id_counts = {}
    page_node_counts = {}
    for index, node in enumerate(nodes):
        label = f"canvas.nodes[{index}]"
        if not isinstance(node, dict):
            issues.append(f"{label} 必须是对象")
            continue
        node_id = str(node.get("id") or "").strip()
        page_id = str(node.get("pageId") or "").strip()
        if not node_id:
            issues.append(f"{label}.id 未填写")
        else:
            node_id_counts[node_id] = node_id_counts.get(node_id, 0) + 1
        if not page_id:
            issues.append(f"{label}.pageId 未填写")
        else:
            page_node_counts[page_id] = page_node_counts.get(page_id, 0) + 1
        if not finite_number(node.get("x")) or not finite_number(node.get("y")):
            issues.append(f"{label} 的 x/y 必须是有限数字")
            continue
        if node_id and node_id not in node_by_id:
            node_by_id[node_id] = node

    duplicate_node_ids = sorted(node_id for node_id, count in node_id_counts.items() if count > 1)
    duplicate_page_ids = sorted(page_id for page_id, count in page_node_counts.items() if count > 1)
    missing_page_ids = sorted(page_ids - set(page_node_counts))
    unknown_page_ids = sorted(set(page_node_counts) - page_ids)
    if duplicate_node_ids:
        issues.append(f"存在重复节点 id：{', '.join(duplicate_node_ids)}")
    if duplicate_page_ids:
        issues.append(f"同一 pageId 对应多个节点：{', '.join(duplicate_page_ids)}")
    if missing_page_ids:
        issues.append(f"页面缺少 canvas node：{', '.join(missing_page_ids)}")
    if unknown_page_ids:
        issues.append(f"canvas node 引用了不存在的页面：{', '.join(unknown_page_ids)}")

    valid_edges = []
    edge_id_counts = {}
    edge_key_counts = {}
    dangling_edges = []
    for index, edge in enumerate(edges):
        label = f"canvas.edges[{index}]"
        if not isinstance(edge, dict):
            issues.append(f"{label} 必须是对象")
            continue
        edge_id = str(edge.get("id") or "").strip()
        from_id = str(edge.get("from") or "").strip()
        to_id = str(edge.get("to") or "").strip()
        if not edge_id:
            issues.append(f"{label}.id 未填写")
        else:
            edge_id_counts[edge_id] = edge_id_counts.get(edge_id, 0) + 1
        edge_key = (from_id, to_id)
        if from_id and to_id:
            edge_key_counts[edge_key] = edge_key_counts.get(edge_key, 0) + 1
        if from_id not in node_by_id or to_id not in node_by_id:
            dangling_edges.append(edge_id or label)
            continue
        valid_edges.append((edge_id or label, from_id, to_id))

    duplicate_edge_ids = sorted(edge_id for edge_id, count in edge_id_counts.items() if count > 1)
    duplicate_edge_keys = sorted(key for key, count in edge_key_counts.items() if count > 1)
    if duplicate_edge_ids:
        issues.append(f"存在重复连线 id：{', '.join(duplicate_edge_ids)}")
    if duplicate_edge_keys:
        labels = ", ".join(f"{from_id} -> {to_id}" for from_id, to_id in duplicate_edge_keys)
        issues.append(f"存在重复业务连线：{labels}")
    if dangling_edges:
        issues.append(f"存在悬空连线：{', '.join(dangling_edges)}")

    preset = str(manifest.get("project", {}).get("devicePreset") or "iphone-portrait")
    node_size = CANVAS_NODE_SIZES.get(preset, CANVAS_NODE_SIZES["iphone-portrait"])
    rects = {node_id: canvas_node_rect(node, node_size) for node_id, node in node_by_id.items()}
    node_ids = list(rects)
    overlap_count = 0
    insufficient_spacing_count = 0
    for index, first_id in enumerate(node_ids):
        for second_id in node_ids[index + 1:]:
            first_rect = rects[first_id]
            second_rect = rects[second_id]
            if rects_overlap(first_rect, second_rect):
                overlap_count += 1
                continue
            horizontal_gap, vertical_gap = rect_gap(first_rect, second_rect)
            if (horizontal_gap == 0 and 0 < vertical_gap < 80) or (vertical_gap == 0 and 0 < horizontal_gap < 80):
                insufficient_spacing_count += 1
    if overlap_count:
        issues.append(f"检测到 {overlap_count} 组节点重叠")

    centers = {
        node_id: ((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2)
        for node_id, rect in rects.items()
    }
    crossing_count = 0
    for index, (_, first_from, first_to) in enumerate(valid_edges):
        for _, second_from, second_to in valid_edges[index + 1:]:
            if {first_from, first_to} & {second_from, second_to}:
                continue
            if segments_cross(centers[first_from], centers[first_to], centers[second_from], centers[second_to]):
                crossing_count += 1

    edge_through_node_count = 0
    for _, from_id, to_id in valid_edges:
        start = centers[from_id]
        end = centers[to_id]
        for node_id, rect in rects.items():
            if node_id in (from_id, to_id):
                continue
            if segment_intersects_rect(start, end, rect):
                edge_through_node_count += 1

    if crossing_count:
        warnings.append(f"检测到 {crossing_count} 处非共享端点连线交叉，请调整关键流程布局")
    if edge_through_node_count:
        warnings.append(f"检测到 {edge_through_node_count} 条连线穿过无关节点，请调整锚点或节点位置")
    if insufficient_spacing_count:
        warnings.append(f"检测到 {insufficient_spacing_count} 组节点间距不足 80px")

    duplicate_node_count = sum(max(0, count - 1) for count in node_id_counts.values())
    duplicate_page_node_count = sum(max(0, count - 1) for count in page_node_counts.values())
    duplicate_edge_count = (
        sum(max(0, count - 1) for count in edge_id_counts.values())
        + sum(max(0, count - 1) for count in edge_key_counts.values())
    )
    return {
        "issues": issues,
        "warnings": warnings,
        "stats": {
            "pageCount": len(page_ids),
            "nodeCount": len(nodes),
            "uniqueNodeCount": len(page_node_counts),
            "duplicateNodeCount": duplicate_node_count,
            "duplicatePageNodeCount": duplicate_page_node_count,
            "danglingEdgeCount": len(dangling_edges),
            "duplicateEdgeCount": duplicate_edge_count,
            "nodeOverlapCount": overlap_count,
            "unrelatedEdgeCrossingCount": crossing_count,
            "edgeThroughNodeCount": edge_through_node_count,
            "insufficientSpacingCount": insufficient_spacing_count,
        },
    }


def validate_project_manifest_files(
    project_dir: Path,
    *,
    source_label: str = "项目根目录",
    remediation: str = "请修复项目文件后重试。",
) -> dict:
    manifest_path = project_dir / MANIFEST_FILE
    try:
        with manifest_path.open("r", encoding="utf-8") as file:
            manifest = json.load(file)
    except FileNotFoundError as error:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, f"项目根目录缺少 {MANIFEST_FILE}") from error
    except json.JSONDecodeError as error:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, f"{MANIFEST_FILE} 不是合法 JSON") from error

    pages = manifest.get("pages") if isinstance(manifest, dict) else None
    if not isinstance(pages, dict) or not pages:
        raise ProtoDockError(
            HTTPStatus.BAD_REQUEST,
            "项目包校验失败：protodock.project.json 中 pages 必须是非空对象。",
            code="INVALID_MANIFEST_PAGES",
        )

    issues = []
    entry_count = 0
    doc_count = 0
    for page_id, page in pages.items():
        page_label = f"pages.{page_id}"
        if not isinstance(page, dict):
            issues.append(f"{page_label} 必须是对象")
            continue
        for field, root_name in (("entry", "pages"), ("doc", "docs")):
            label = f"{page_label}.{field}"
            try:
                path = manifest_relative_path(page.get(field), label, root_name)
            except ValueError as error:
                issues.append(str(error))
                continue
            target = safe_target_path(project_dir, path)
            if not target.is_file():
                issues.append(f"缺少 {label} 文件：{path.as_posix()}")
                continue
            if field == "entry":
                entry_count += 1
            else:
                doc_count += 1

    canvas_validation = validate_canvas_layout(manifest)
    canvas_issues = canvas_validation["issues"]
    if issues or canvas_issues:
        if issues and canvas_issues:
            code = "PROJECT_VALIDATION_FAILED"
        elif canvas_issues:
            code = "CANVAS_LAYOUT_INVALID"
        else:
            code = "PROJECT_FILES_INVALID"
        raise ProtoDockError(
            HTTPStatus.BAD_REQUEST,
            f"项目包校验失败。请确保文件路径相对于{source_label}，且 Canvas 编排符合契约。{remediation}",
            code=code,
            details=issues + canvas_issues,
        )
    return {
        "manifest": manifest,
        "pageCount": len(pages),
        "entryCount": entry_count,
        "docCount": doc_count,
        "canvas": canvas_validation["stats"],
        "warnings": canvas_validation["warnings"],
    }


def safe_extract_project_zip(archive_bytes: bytes, destination: Path) -> dict:
    total_size = 0
    try:
        with zipfile.ZipFile(BytesIO(archive_bytes)) as zip_file:
            validate_archive_root(zip_file)
            extracted_manifest = False
            for info in zip_file.infolist():
                if info.is_dir():
                    continue
                if is_zip_symlink(info):
                    raise ProtoDockError(HTTPStatus.BAD_REQUEST, "zip 不能包含软链接")
                if info.file_size > MAX_FILE_BYTES:
                    raise ProtoDockError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "zip 中存在过大的文件")
                total_size += info.file_size
                if total_size > MAX_EXTRACTED_BYTES:
                    raise ProtoDockError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "zip 解压后体积过大")

                clean_path = clean_zip_name(info.filename)
                if clean_path is None:
                    raise ProtoDockError(HTTPStatus.BAD_REQUEST, "zip 包含非法路径")
                relative_path = clean_path
                if not allowed_project_path(relative_path):
                    continue

                target = safe_target_path(destination, relative_path)
                target.parent.mkdir(parents=True, exist_ok=True)
                with zip_file.open(info) as source, target.open("wb") as output:
                    shutil.copyfileobj(source, output)
                if str(relative_path) == MANIFEST_FILE:
                    extracted_manifest = True

            if not extracted_manifest:
                raise ProtoDockError(HTTPStatus.BAD_REQUEST, "zip 中缺少 protodock.project.json")
    except zipfile.BadZipFile as error:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "无法读取 zip 压缩包") from error

    return validate_project_manifest_files(
        destination,
        source_label="上传 ZIP 根目录",
        remediation="请重新生成 ProtoDock 专用上传包。",
    )


def parse_multipart_upload(headers, body: bytes) -> tuple[str, bytes, dict[str, str]]:
    content_type = headers.get("Content-Type", "")
    if "multipart/form-data" not in content_type:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "请使用 multipart/form-data 上传 zip")
    raw = (
        f"Content-Type: {content_type}\r\n"
        "MIME-Version: 1.0\r\n\r\n"
    ).encode("utf-8") + body
    message = BytesParser(policy=policy.default).parsebytes(raw)
    if not message.is_multipart():
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "上传表单格式不正确")
    fields = {}
    archive_file = None
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        if name != "archive":
            if part.get_filename():
                continue
            payload = part.get_payload(decode=True)
            if payload is None:
                fields[name] = str(part.get_content()).strip()
                continue
            charset = part.get_content_charset() or "utf-8"
            fields[name] = payload.decode(charset, "replace").strip()
            continue
        filename = part.get_filename() or "project.zip"
        payload = part.get_payload(decode=True)
        if not payload:
            raise ProtoDockError(HTTPStatus.BAD_REQUEST, "上传的 zip 为空")
        archive_file = (filename, payload)
    if archive_file is None:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "缺少 archive 文件字段")
    return archive_file[0], archive_file[1], fields


def replace_share_directory(final_dir: Path, temp_dir: Path, share_id: str) -> None:
    if not final_dir.exists():
        temp_dir.rename(final_dir)
        return

    backup_dir = SHARES_DIR / f".replace-{share_id}-{secrets.token_urlsafe(6)}"
    final_dir.rename(backup_dir)
    try:
        temp_dir.rename(final_dir)
    except Exception:
        if backup_dir.exists() and not final_dir.exists():
            backup_dir.rename(final_dir)
        raise
    finally:
        if backup_dir.exists() and final_dir.exists():
            shutil.rmtree(backup_dir, ignore_errors=True)


def share_item_from_directory(directory: Path, url_for=None) -> dict | None:
    share_id = directory.name
    if not is_valid_share_id(share_id):
        return None
    manifest_path = directory / MANIFEST_FILE
    if not manifest_path.is_file():
        return None
    try:
        with manifest_path.open("r", encoding="utf-8") as file:
            manifest = json.load(file)
    except (OSError, json.JSONDecodeError):
        return None
    project = manifest.get("project") if isinstance(manifest, dict) else {}
    if not isinstance(project, dict):
        project = {}
    name = str(project.get("name") or share_id)
    updated_at = manifest_path.stat().st_mtime
    path = f"/s/{share_id}"
    return {
        "id": share_id,
        "name": name,
        "path": path,
        "url": (url_for or absolute_public_url)(path),
        "updatedAt": updated_at
    }


def share_directory_for(share_id: str) -> Path:
    if not is_valid_share_id(share_id):
        raise ProtoDockError(HTTPStatus.NOT_FOUND, "分享项目不存在")
    directory = SHARES_DIR / share_id
    if not (directory / MANIFEST_FILE).is_file():
        raise ProtoDockError(HTTPStatus.NOT_FOUND, "分享项目不存在")
    return directory


def project_name_for_directory(directory: Path, fallback: str) -> str:
    try:
        with (directory / MANIFEST_FILE).open("r", encoding="utf-8") as file:
            manifest = json.load(file)
    except (OSError, json.JSONDecodeError):
        return fallback
    project = manifest.get("project") if isinstance(manifest, dict) else {}
    if not isinstance(project, dict):
        return fallback
    return str(project.get("name") or fallback)


def download_filename_for_share(directory: Path, share_id: str) -> str:
    raw_name = project_name_for_directory(directory, f"protodock-{share_id}")
    safe_name = "".join(
        char if char.isalnum() or char in {" ", "-", "_", "."} else "-"
        for char in raw_name
    ).strip(" .-_")
    return f"{safe_name or 'protodock-project'}-{share_id}.zip"


def iter_share_files(directory: Path):
    manifest_path = directory / MANIFEST_FILE
    if manifest_path.is_file() and not manifest_path.is_symlink():
        yield manifest_path, MANIFEST_FILE
    for root_name in sorted(ALLOWED_ROOT_DIRS):
        root = directory / root_name
        if not root.is_dir() or root.is_symlink():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.is_symlink():
                continue
            relative = PurePosixPath(path.relative_to(directory).as_posix())
            if allowed_project_path(relative):
                yield path, relative.as_posix()


def build_share_archive(share_id: str) -> tuple[Path, str]:
    directory = share_directory_for(share_id)
    download_name = download_filename_for_share(directory, share_id)
    handle = tempfile.NamedTemporaryFile(prefix=f"protodock-{share_id}-", suffix=".zip", delete=False)
    archive_path = Path(handle.name)
    handle.close()
    total_size = 0
    try:
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file_path, archive_name in iter_share_files(directory):
                file_size = file_path.stat().st_size
                total_size += file_size
                if total_size > MAX_EXTRACTED_BYTES:
                    raise ProtoDockError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "项目包体积过大")
                archive.write(file_path, archive_name)
    except Exception:
        archive_path.unlink(missing_ok=True)
        raise
    return archive_path, download_name


def safe_branch_component(value: str, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, f"请填写{label}")
    if len(text) > 64:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, f"{label}过长")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", text):
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, f"{label}只能包含英文、数字、点、中横线和下划线")
    if text.endswith(".") or text.endswith(".lock") or ".." in text:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, f"{label}不能作为 Git 分支名")
    return text


def github_branch_name(product_name: str, version: str) -> str:
    product = safe_branch_component(product_name, "产品名")
    version_name = safe_branch_component(version, "版本号")
    branch = f"{product}/{version_name}"
    validate_git_ref(branch)
    return branch


def validate_github_open_branch(branch: str) -> str:
    ref_name = str(branch or "").strip()
    if not ref_name:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "请填写分支")
    if len(ref_name) > 200:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "分支名过长")
    if ref_name.startswith("-"):
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "分支名不能以中横线开头")
    try:
        run_command(["git", "check-ref-format", "--branch", ref_name], cwd=ROOT)
    except ProtoDockError as error:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "分支名不是合法 Git 分支") from error
    return ref_name


def validate_git_ref(ref_name: str) -> None:
    try:
        run_command(["git", "check-ref-format", "--branch", ref_name], cwd=ROOT)
    except ProtoDockError as error:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "产品名和版本号组合后不是合法 Git 分支名") from error


def safe_commit_message(value: str) -> str:
    message = str(value or "").strip()
    if not message:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "请填写提交说明")
    if len(message) > 200:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "提交说明过长")
    return message


def run_command(
    args: list[str],
    cwd: Path,
    *,
    env: dict[str, str] | None = None,
    timeout: int | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    result = subprocess.run(
        args,
        cwd=str(cwd),
        env=merged_env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout or GITHUB_PUSH_TIMEOUT_SECONDS,
        check=False,
    )
    if check and result.returncode != 0:
        output = (result.stderr or result.stdout or "").strip()
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, output or f"命令执行失败：{' '.join(args)}")
    return result


def ensure_github_deploy_key() -> str:
    GITHUB_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not GITHUB_KEY_PATH.exists():
        run_command([
            "ssh-keygen",
            "-t",
            "ed25519",
            "-N",
            "",
            "-C",
            "protodock-deploy-key",
            "-f",
            str(GITHUB_KEY_PATH),
        ], cwd=ROOT)
        GITHUB_KEY_PATH.chmod(0o600)
    public_key_path = Path(f"{GITHUB_KEY_PATH}.pub")
    if not public_key_path.exists():
        result = run_command(["ssh-keygen", "-y", "-f", str(GITHUB_KEY_PATH)], cwd=ROOT)
        public_key_path.write_text(result.stdout.strip() + "\n", encoding="utf-8")
    return public_key_path.read_text(encoding="utf-8").strip()


def github_auth_mode() -> str:
    mode = GITHUB_AUTH_MODE.replace("_", "-")
    if mode in {"app", "github-app"}:
        return "app"
    if mode in {"deploy-key", "deploykey", "ssh"}:
        return "deploy-key"
    if GITHUB_APP_ID or GITHUB_INSTALLATION_ID or os.environ.get("PROTODOCK_GITHUB_APP_KEY_PATH"):
        return "app"
    return "deploy-key"


def github_config_payload() -> dict:
    mode = github_auth_mode()
    github_proxy_configured = bool(GITHUB_PROXY)
    if mode == "app":
        key_ready = GITHUB_APP_KEY_PATH.is_file()
        return {
            "authMode": "app",
            "configured": bool(GITHUB_REPO_URL and GITHUB_APP_ID and GITHUB_INSTALLATION_ID and key_ready),
            "repo": GITHUB_REPO_URL,
            "repoConfigured": bool(GITHUB_REPO_URL),
            "appId": GITHUB_APP_ID,
            "installationId": GITHUB_INSTALLATION_ID,
            "privateKeyReady": key_ready,
            "keyReady": key_ready,
            "publicKey": "",
            "keyError": "" if key_ready else "服务器未找到 GitHub App PEM 私钥",
            "githubProxyConfigured": github_proxy_configured,
            "branchPattern": "产品名/版本号",
        }

    public_key = ""
    key_error = ""
    try:
        public_key = ensure_github_deploy_key()
    except ProtoDockError as error:
        key_error = error.message
    except Exception as error:
        key_error = str(error)
    return {
        "authMode": "deploy-key",
        "configured": bool(GITHUB_REPO_URL),
        "repo": GITHUB_REPO_URL,
        "publicKey": public_key,
        "keyReady": bool(public_key),
        "keyError": key_error,
        "githubProxyConfigured": github_proxy_configured,
        "branchPattern": "产品名/版本号",
    }


def merge_env(*envs: dict[str, str]) -> dict[str, str]:
    merged = {}
    for env in envs:
        merged.update(env)
    return merged


def github_proxy_env() -> dict[str, str]:
    if not GITHUB_PROXY:
        return {}
    return {
        "HTTP_PROXY": GITHUB_PROXY,
        "HTTPS_PROXY": GITHUB_PROXY,
        "http_proxy": GITHUB_PROXY,
        "https_proxy": GITHUB_PROXY,
    }


def github_urlopen(request: urllib_request.Request, timeout: int = 20):
    if not GITHUB_PROXY:
        return urllib_request.urlopen(request, timeout=timeout)
    opener = urllib_request.build_opener(urllib_request.ProxyHandler({
        "http": GITHUB_PROXY,
        "https": GITHUB_PROXY,
    }))
    return opener.open(request, timeout=timeout)


def github_deploy_key_git_env() -> dict[str, str]:
    ensure_github_deploy_key()
    return merge_env(github_proxy_env(), {
        "GIT_SSH_COMMAND": (
            f"ssh -i {GITHUB_KEY_PATH} "
            "-o IdentitiesOnly=yes "
            "-o StrictHostKeyChecking=accept-new"
        )
    })


def base64url_bytes(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def base64url_json(data: dict) -> str:
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return base64url_bytes(payload)


def sign_github_app_jwt(signing_input: bytes) -> bytes:
    if not GITHUB_APP_KEY_PATH.is_file():
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "服务器未找到 GitHub App PEM 私钥")
    result = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", str(GITHUB_APP_KEY_PATH)],
        input=signing_input,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=15,
        check=False,
    )
    if result.returncode != 0:
        output = result.stderr.decode("utf-8", "replace").strip()
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, output or "GitHub App 私钥签名失败")
    return result.stdout


def github_app_jwt() -> str:
    if not GITHUB_APP_ID:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "服务器未配置 PROTODOCK_GITHUB_APP_ID")
    now = int(time.time())
    header = base64url_json({"alg": "RS256", "typ": "JWT"})
    payload = base64url_json({
        "iat": now - 60,
        "exp": now + 540,
        "iss": GITHUB_APP_ID,
    })
    signing_input = f"{header}.{payload}".encode("ascii")
    signature = base64url_bytes(sign_github_app_jwt(signing_input))
    return f"{header}.{payload}.{signature}"


def github_app_installation_token() -> str:
    if not GITHUB_INSTALLATION_ID:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "服务器未配置 PROTODOCK_GITHUB_INSTALLATION_ID")
    request = urllib_request.Request(
        f"https://api.github.com/app/installations/{GITHUB_INSTALLATION_ID}/access_tokens",
        data=b"{}",
        method="POST",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {github_app_jwt()}",
            "Content-Type": "application/json",
            "User-Agent": "ProtoDock",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with github_urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        try:
            payload = json.loads(body)
            message = payload.get("message") or body
        except json.JSONDecodeError:
            message = body or str(error)
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, f"GitHub App 取 token 失败：{message}") from error
    except urllib_error.URLError as error:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, f"GitHub App 连接失败：{error.reason}") from error

    token = str(payload.get("token") or "")
    if not token:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "GitHub App 未返回 installation token")
    return token


def github_https_repo_url(repo_url: str) -> str:
    repo = repo_url.strip()
    if repo.startswith("git@github.com:"):
        path = repo[len("git@github.com:"):]
        return f"https://github.com/{path}"
    if repo.startswith("ssh://git@github.com/"):
        path = repo[len("ssh://git@github.com/"):]
        return f"https://github.com/{path}"
    if repo.startswith("https://github.com/"):
        return repo if repo.endswith(".git") else f"{repo}.git"
    return repo


def github_open_repo_url(repo_url: str) -> str:
    repo = github_https_repo_url(str(repo_url or "").strip())
    parsed = urlparse(repo)
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com":
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "仓库地址必须是 github.com 的 HTTPS 或 SSH 地址")
    path = parsed.path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    parts = [part for part in path.split("/") if part]
    if len(parts) != 2:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "仓库地址格式应为 https://github.com/owner/repo")
    owner, repo_name = parts
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", repo_name):
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "仓库 owner 或名称包含非法字符")
    return f"https://github.com/{owner}/{repo_name}.git"


def safe_project_subpath(value: str) -> PurePosixPath:
    raw = str(value or "").strip().replace("\\", "/")
    if not raw:
        return PurePosixPath(".")
    if raw.startswith("/") or ":" in raw.split("/", 1)[0]:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "项目路径必须是仓库内相对路径")
    path = PurePosixPath(posixpath.normpath(raw))
    if str(path) in {"", "."}:
        return PurePosixPath(".")
    if any(part in {"", ".", ".."} for part in path.parts):
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "项目路径不能包含 . 或 ..")
    if len(str(path)) > 240:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "项目路径过长")
    return path


def github_app_clone_context(work_dir: Path) -> dict[str, str]:
    token = github_app_installation_token()
    work_dir.mkdir(parents=True, exist_ok=True)
    askpass_path = work_dir / "protodock-askpass.sh"
    askpass_path.write_text(
        "#!/bin/sh\n"
        "case \"$1\" in\n"
        "*Username*) printf '%s\\n' x-access-token ;;\n"
        "*Password*) printf '%s\\n' \"$PROTODOCK_GITHUB_TOKEN\" ;;\n"
        "*) printf '\\n' ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    askpass_path.chmod(0o700)
    return merge_env(github_proxy_env(), {
        "GIT_ASKPASS": str(askpass_path),
        "GIT_TERMINAL_PROMPT": "0",
        "PROTODOCK_GITHUB_TOKEN": token,
    })


def github_open_git_env(work_dir: Path) -> dict[str, str]:
    if github_auth_mode() == "app" and GITHUB_APP_ID and GITHUB_INSTALLATION_ID and GITHUB_APP_KEY_PATH.is_file():
        return github_app_clone_context(work_dir)
    return merge_env(github_proxy_env(), {"GIT_TERMINAL_PROMPT": "0"})


def github_app_git_context(work_dir: Path) -> tuple[str, dict[str, str]]:
    token = github_app_installation_token()
    askpass_dir = work_dir / ".git"
    if not askpass_dir.is_dir():
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "Git 工作目录未初始化")
    askpass_path = askpass_dir / "protodock-askpass.sh"
    askpass_path.write_text(
        "#!/bin/sh\n"
        "case \"$1\" in\n"
        "*Username*) printf '%s\\n' x-access-token ;;\n"
        "*Password*) printf '%s\\n' \"$PROTODOCK_GITHUB_TOKEN\" ;;\n"
        "*) printf '\\n' ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    askpass_path.chmod(0o700)
    return github_https_repo_url(GITHUB_REPO_URL), merge_env(github_proxy_env(), {
        "GIT_ASKPASS": str(askpass_path),
        "GIT_TERMINAL_PROMPT": "0",
        "PROTODOCK_GITHUB_TOKEN": token,
    })


def github_git_context(work_dir: Path) -> tuple[str, dict[str, str]]:
    if github_auth_mode() == "app":
        return github_app_git_context(work_dir)
    return GITHUB_REPO_URL, github_deploy_key_git_env()


def github_web_url(repo_url: str) -> str:
    repo = repo_url.strip()
    if repo.startswith("git@github.com:"):
        path = repo[len("git@github.com:"):]
    elif repo.startswith("ssh://git@github.com/"):
        path = repo[len("ssh://git@github.com/"):]
    elif repo.startswith("https://github.com/"):
        path = repo[len("https://github.com/"):]
    else:
        return ""
    path = path[:-4] if path.endswith(".git") else path
    return f"https://github.com/{path.strip('/')}"


def copy_project_to_repo(project_dir: Path, repo_dir: Path) -> None:
    for child in repo_dir.iterdir():
        if child.name == ".git":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()

    manifest = project_dir / MANIFEST_FILE
    if not manifest.is_file():
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "项目包缺少 protodock.project.json")
    shutil.copy2(manifest, repo_dir / MANIFEST_FILE)

    for root_name in sorted(ALLOWED_ROOT_DIRS):
        source = project_dir / root_name
        if source.is_dir():
            shutil.copytree(source, repo_dir / root_name)


def copy_project_snapshot(source_dir: Path, destination: Path) -> None:
    manifest = source_dir / MANIFEST_FILE
    if not manifest.is_file() or manifest.is_symlink():
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "仓库路径中缺少 protodock.project.json")
    try:
        with manifest.open("r", encoding="utf-8") as file:
            json.load(file)
    except json.JSONDecodeError as error:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "protodock.project.json 不是合法 JSON") from error

    total_size = manifest.stat().st_size
    if total_size > MAX_EXTRACTED_BYTES:
        raise ProtoDockError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "项目体积过大")
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copy2(manifest, destination / MANIFEST_FILE)

    for root_name in sorted(ALLOWED_ROOT_DIRS):
        source = source_dir / root_name
        if not source.exists():
            continue
        if not source.is_dir() or source.is_symlink():
            raise ProtoDockError(HTTPStatus.BAD_REQUEST, f"{root_name} 必须是目录")
        target_root = destination / root_name
        for path in sorted(source.rglob("*")):
            if path.is_symlink():
                raise ProtoDockError(HTTPStatus.BAD_REQUEST, "项目不能包含软链接")
            if path.is_dir():
                continue
            if not path.is_file():
                continue
            relative = PurePosixPath(path.relative_to(source_dir).as_posix())
            if not allowed_project_path(relative):
                continue
            file_size = path.stat().st_size
            if file_size > MAX_FILE_BYTES:
                raise ProtoDockError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "项目中存在过大的文件")
            total_size += file_size
            if total_size > MAX_EXTRACTED_BYTES:
                raise ProtoDockError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "项目体积过大")
            target = target_root / path.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)

    validate_project_manifest_files(
        destination,
        source_label="GitHub 项目路径",
        remediation="请修复仓库中的 manifest 或缺失文件后重试。",
    )


def github_share_id(repo_url: str, branch: str) -> str:
    seed = f"{repo_url}@{branch}-{secrets.token_urlsafe(6)}"
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "-", seed).strip("-")
    return (cleaned[-52:] or secrets.token_urlsafe(8))[:80]


def open_project_from_github(repo_url: str, branch: str, project_path: str) -> dict:
    clone_url = github_open_repo_url(repo_url)
    ref_name = validate_github_open_branch(branch)
    subpath = safe_project_subpath(project_path)

    GITHUB_WORK_DIR.mkdir(parents=True, exist_ok=True)
    SHARES_DIR.mkdir(parents=True, exist_ok=True)
    work_dir = Path(tempfile.mkdtemp(prefix=".open-", dir=GITHUB_WORK_DIR))
    share_id = github_share_id(clone_url, ref_name)
    final_dir = SHARES_DIR / share_id
    while final_dir.exists():
        share_id = github_share_id(clone_url, ref_name)
        final_dir = SHARES_DIR / share_id
    temp_share_dir = Path(tempfile.mkdtemp(prefix=".github-open-", dir=SHARES_DIR))

    try:
        git_env = github_open_git_env(work_dir)
        repo_dir = work_dir / "repo"
        run_command([
            "git",
            "clone",
            "--depth",
            "1",
            "--single-branch",
            "--branch",
            ref_name,
            clone_url,
            str(repo_dir),
        ], cwd=work_dir, env=git_env, timeout=GITHUB_OPEN_TIMEOUT_SECONDS)
        source_dir = repo_dir if str(subpath) == "." else (repo_dir / Path(*subpath.parts))
        source_dir = source_dir.resolve()
        if os.path.commonpath([repo_dir.resolve(), source_dir]) != str(repo_dir.resolve()):
            raise ProtoDockError(HTTPStatus.BAD_REQUEST, "项目路径非法")
        copy_project_snapshot(source_dir, temp_share_dir)
        replace_share_directory(final_dir, temp_share_dir, share_id)
        temp_share_dir = None
        path = f"/s/{share_id}"
        return {
            "id": share_id,
            "path": path,
            "repo": clone_url,
            "branch": ref_name,
            "projectPath": "" if str(subpath) == "." else str(subpath),
            "action": "created",
        }
    finally:
        if temp_share_dir is not None:
            shutil.rmtree(temp_share_dir, ignore_errors=True)
        shutil.rmtree(work_dir, ignore_errors=True)


def push_project_to_github(project_dir: Path, product_name: str, version: str, commit_message: str) -> dict:
    if not GITHUB_REPO_URL:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "服务器未配置 PROTODOCK_GITHUB_REPO")

    branch = github_branch_name(product_name, version)
    message = safe_commit_message(commit_message)
    GITHUB_WORK_DIR.mkdir(parents=True, exist_ok=True)
    work_dir = Path(tempfile.mkdtemp(prefix=".push-", dir=GITHUB_WORK_DIR))

    try:
        run_command(["git", "init"], cwd=work_dir)
        remote_url, git_env = github_git_context(work_dir)
        run_command(["git", "remote", "add", "origin", remote_url], cwd=work_dir, env=git_env)
        exists = run_command(
            ["git", "ls-remote", "--exit-code", "--heads", "origin", branch],
            cwd=work_dir,
            env=git_env,
            check=False,
        ).returncode == 0

        if exists:
            run_command(["git", "fetch", "--depth", "1", "origin", branch], cwd=work_dir, env=git_env)
            run_command(["git", "checkout", "-B", branch, "FETCH_HEAD"], cwd=work_dir, env=git_env)
        else:
            run_command(["git", "checkout", "--orphan", branch], cwd=work_dir, env=git_env)

        copy_project_to_repo(project_dir, work_dir)
        run_command(["git", "config", "user.name", GITHUB_AUTHOR_NAME], cwd=work_dir, env=git_env)
        run_command(["git", "config", "user.email", GITHUB_AUTHOR_EMAIL], cwd=work_dir, env=git_env)
        run_command(["git", "add", "-A"], cwd=work_dir, env=git_env)

        diff_result = run_command(["git", "diff", "--cached", "--quiet"], cwd=work_dir, env=git_env, check=False)
        if diff_result.returncode == 0:
            commit = run_command(["git", "rev-parse", "HEAD"], cwd=work_dir, env=git_env, check=False)
            commit_hash = commit.stdout.strip() if commit.returncode == 0 else ""
            action = "unchanged"
        else:
            run_command(["git", "commit", "-m", message], cwd=work_dir, env=git_env)
            commit_hash = run_command(["git", "rev-parse", "HEAD"], cwd=work_dir, env=git_env).stdout.strip()
            action = "pushed"

        run_command(["git", "push", "--force-with-lease", "origin", branch], cwd=work_dir, env=git_env)
        web_url = github_web_url(GITHUB_REPO_URL)
        return {
            "repo": GITHUB_REPO_URL,
            "branch": branch,
            "commit": commit_hash,
            "action": action,
            "branchUrl": f"{web_url}/tree/{quote(branch, safe='/')}" if web_url else "",
            "commitUrl": f"{web_url}/commit/{commit_hash}" if web_url and commit_hash else "",
        }
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def request_path_to_file(root: Path, request_path: str) -> Path:
    decoded = unquote(request_path).replace("\\", "/")
    normalized = posixpath.normpath(decoded.lstrip("/"))
    if normalized in {"", "."}:
        normalized = "index.html"
    parts = [part for part in normalized.split("/") if part]
    if any(part in {"", ".", ".."} for part in parts):
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "非法路径")
    target = (root / Path(*parts)).resolve()
    root_resolved = root.resolve()
    if os.path.commonpath([root_resolved, target]) != str(root_resolved):
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "非法路径")
    return target


def docs_request_path_to_file(request_path: str) -> Path | None:
    if not DOCS_EXPORT_DIR.is_dir():
        return None
    decoded = unquote(request_path).replace("\\", "/")
    normalized = posixpath.normpath(decoded.lstrip("/"))
    parts = [part for part in normalized.split("/") if part]
    if parts == ["docs"]:
        pass
    elif parts and parts[0] == "docs":
        parts = parts[1:]
    elif parts and parts[0] in DOCS_ASSET_ROOTS | DOCS_PAGE_ROOTS:
        pass
    else:
        return None
    if any(part in {"", ".", ".."} for part in parts):
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "非法路径")
    target = (DOCS_EXPORT_DIR / Path(*parts)).resolve() if parts else (DOCS_EXPORT_DIR / "index.html").resolve()
    root_resolved = DOCS_EXPORT_DIR.resolve()
    if os.path.commonpath([root_resolved, target]) != str(root_resolved):
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "非法路径")
    candidates = [target]
    if target.suffix != ".html":
        candidates.extend([target / "index.html", target.with_suffix(".html")])
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def absolute_public_url(path: str, headers=None, server_address=None) -> str:
    if headers is None:
        return path
    proto = header_first(headers, "X-Forwarded-Proto") or "http"
    host = header_first(headers, "X-Forwarded-Host") or headers.get("Host")
    forwarded_port = header_first(headers, "X-Forwarded-Port")
    if host and forwarded_port and ":" not in host:
        host = f"{host}:{forwarded_port}"
    if not host and server_address:
        host = f"{server_address[0]}:{server_address[1]}"
    return f"{proto}://{host}{path}" if host else path


def header_first(headers, name: str) -> str:
    value = headers.get(name, "")
    return value.split(",", 1)[0].strip()


def configured_upload_url(origin: str = UPLOAD_ORIGIN) -> str:
    value = str(origin or "").strip().rstrip("/")
    if not value:
        return ""
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        return ""
    if parsed.path not in {"", "/"}:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}/api/shares"


class ProtoDockHandler(BaseHTTPRequestHandler):
    server_version = "ProtoDockShare/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print("%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def send_json(self, status: HTTPStatus, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_upload_cors_headers()
        self.end_headers()
        self.wfile.write(data)

    def send_upload_cors_headers(self) -> None:
        if urlparse(self.path).path != "/api/shares":
            return
        origin = self.headers.get("Origin", "").strip()
        self.send_header("Access-Control-Allow-Origin", origin or "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        if origin:
            self.send_header("Vary", "Origin")

    def send_error_json(self, error: ProtoDockError) -> None:
        payload = {"error": error.message}
        if error.code:
            payload["code"] = error.code
        if error.details:
            payload["details"] = error.details
        self.send_json(error.status, payload)

    def do_GET(self) -> None:
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            if path == "/api/health":
                self.send_json(HTTPStatus.OK, {"ok": True, "service": "protodock"})
                return
            if path == "/_mintlify/api/user":
                self.send_json(HTTPStatus.OK, {"user": None})
                return
            if path == "/api/shares":
                self.handle_share_list()
                return
            if path == "/api/upload/config":
                self.send_json(HTTPStatus.OK, {"uploadUrl": configured_upload_url()})
                return
            if path == "/api/github/config":
                self.handle_github_config()
                return
            if path.startswith("/api/shares/"):
                self.handle_share_download(path)
                return
            if path.startswith("/s/"):
                self.serve_share_index(path)
                return
            if path.startswith("/shares/"):
                self.serve_share_asset(path)
                return
            docs_file = docs_request_path_to_file(path)
            if docs_file:
                self.serve_file(docs_file)
                return
            if path == "/docs" or path.startswith("/docs/"):
                raise ProtoDockError(HTTPStatus.NOT_FOUND, "文档还未构建")
            self.serve_static_asset(path)
        except ProtoDockError as error:
            self.send_error_json(error)
        except Exception as error:
            print(f"Unhandled GET error: {error}")
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "服务器内部错误"})

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_OPTIONS(self) -> None:
        if urlparse(self.path).path != "/api/shares":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_upload_cors_headers()
        self.end_headers()

    def do_POST(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/api/shares":
                self.handle_share_upload()
                return
            if parsed.path == "/api/github/open":
                self.handle_github_open()
                return
            if parsed.path == "/api/github/push":
                self.handle_github_push()
                return
            raise ProtoDockError(HTTPStatus.NOT_FOUND, "接口不存在")
        except ProtoDockError as error:
            self.send_error_json(error)
        except Exception as error:
            print(f"Unhandled POST error: {error}")
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "服务器内部错误"})

    def read_json_body(self, max_bytes: int = 32 * 1024) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            raise ProtoDockError(HTTPStatus.BAD_REQUEST, "请求内容为空")
        if length > max_bytes:
            raise ProtoDockError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "请求内容过大")
        content_type = self.headers.get("Content-Type", "")
        if "application/json" not in content_type:
            raise ProtoDockError(HTTPStatus.BAD_REQUEST, "请使用 application/json")
        body = self.rfile.read(length)
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as error:
            raise ProtoDockError(HTTPStatus.BAD_REQUEST, "请求 JSON 格式不正确") from error
        if not isinstance(payload, dict):
            raise ProtoDockError(HTTPStatus.BAD_REQUEST, "请求 JSON 必须是对象")
        return payload

    def handle_share_upload(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            raise ProtoDockError(HTTPStatus.BAD_REQUEST, "上传内容为空")
        if length > MAX_UPLOAD_BYTES:
            raise ProtoDockError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "zip 上传体积过大")
        body = self.rfile.read(length)
        filename, archive, fields = parse_multipart_upload(self.headers, body)
        if not filename.lower().endswith(".zip"):
            raise ProtoDockError(HTTPStatus.BAD_REQUEST, "请上传 .zip 文件")

        SHARES_DIR.mkdir(parents=True, exist_ok=True)
        requested_share_id = fields.get("shareId", "").strip()
        is_update = bool(requested_share_id)
        if is_update:
            share_id = requested_share_id
            final_dir = share_directory_for(share_id)
            status = HTTPStatus.OK
        else:
            share_id = self.create_share_id()
            final_dir = SHARES_DIR / share_id
            status = HTTPStatus.CREATED
        temp_dir = Path(tempfile.mkdtemp(prefix=".upload-", dir=SHARES_DIR))
        try:
            validation = safe_extract_project_zip(archive, temp_dir)
            replace_share_directory(final_dir, temp_dir, share_id)
        except Exception:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise

        path = f"/s/{share_id}"
        self.send_json(status, {
            "id": share_id,
            "path": path,
            "url": self.absolute_url(path),
            "action": "updated" if is_update else "created",
            "canvasValidation": validation["canvas"],
            "warnings": validation["warnings"],
        })

    def handle_github_config(self) -> None:
        self.send_json(HTTPStatus.OK, github_config_payload())

    def handle_github_open(self) -> None:
        payload = self.read_json_body()
        result = open_project_from_github(
            payload.get("repoUrl", ""),
            payload.get("branch", ""),
            payload.get("projectPath", ""),
        )
        result["url"] = self.absolute_url(result["path"])
        self.send_json(HTTPStatus.CREATED, result)

    def handle_github_push(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            raise ProtoDockError(HTTPStatus.BAD_REQUEST, "上传内容为空")
        if length > MAX_UPLOAD_BYTES:
            raise ProtoDockError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "zip 上传体积过大")
        body = self.rfile.read(length)
        filename, archive, fields = parse_multipart_upload(self.headers, body)
        if not filename.lower().endswith(".zip"):
            raise ProtoDockError(HTTPStatus.BAD_REQUEST, "请上传 .zip 文件")

        GITHUB_WORK_DIR.mkdir(parents=True, exist_ok=True)
        temp_dir = Path(tempfile.mkdtemp(prefix=".upload-", dir=GITHUB_WORK_DIR))
        try:
            safe_extract_project_zip(archive, temp_dir)
            result = push_project_to_github(
                temp_dir,
                fields.get("productName", ""),
                fields.get("version", ""),
                fields.get("commitMessage", ""),
            )
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

        self.send_json(HTTPStatus.OK, result)

    def handle_share_list(self) -> None:
        SHARES_DIR.mkdir(parents=True, exist_ok=True)
        items = []
        for directory in SHARES_DIR.iterdir():
            if not directory.is_dir():
                continue
            item = share_item_from_directory(directory, self.absolute_url)
            if item:
                items.append(item)
        items.sort(key=lambda item: item.get("updatedAt") or 0, reverse=True)
        self.send_json(HTTPStatus.OK, {"items": items})

    def handle_share_download(self, path: str) -> None:
        parts = [part for part in path.split("/") if part]
        if len(parts) != 4 or parts[0] != "api" or parts[1] != "shares" or parts[3] != "download":
            raise ProtoDockError(HTTPStatus.NOT_FOUND, "接口不存在")
        archive_path, download_name = build_share_archive(parts[2])
        try:
            self.serve_file(archive_path, content_type="application/zip", download_name=download_name)
        finally:
            archive_path.unlink(missing_ok=True)

    def create_share_id(self) -> str:
        while True:
            share_id = secrets.token_urlsafe(8)
            if is_valid_share_id(share_id) and not (SHARES_DIR / share_id).exists():
                return share_id

    def absolute_url(self, path: str) -> str:
        return absolute_public_url(path, self.headers, self.server.server_address)

    def serve_share_index(self, path: str) -> None:
        parts = [part for part in path.split("/") if part]
        if len(parts) < 2 or parts[0] != "s" or not is_valid_share_id(parts[1]):
            raise ProtoDockError(HTTPStatus.NOT_FOUND, "分享链接不存在")
        is_canvas_route = len(parts) == 3 and parts[2] == "canvas"
        if len(parts) > 2 and not is_canvas_route:
            raise ProtoDockError(HTTPStatus.NOT_FOUND, "分享链接不存在")
        if not (SHARES_DIR / parts[1] / MANIFEST_FILE).is_file():
            raise ProtoDockError(HTTPStatus.NOT_FOUND, "分享项目不存在")
        index_path = ROOT / ("index.html" if is_canvas_route else "preview.html")
        html = index_path.read_text(encoding="utf-8")
        if is_canvas_route and "<base " not in html:
            html = html.replace("<head>", '<head>\n  <base href="/">', 1)
        data = html.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def serve_share_asset(self, path: str) -> None:
        parts = [part for part in unquote(path).split("/") if part]
        if len(parts) < 3 or parts[0] != "shares" or not is_valid_share_id(parts[1]):
            raise ProtoDockError(HTTPStatus.NOT_FOUND, "文件不存在")
        relative = PurePosixPath(*parts[2:])
        if not allowed_project_path(relative):
            raise ProtoDockError(HTTPStatus.NOT_FOUND, "文件不存在")
        file_path = safe_target_path(SHARES_DIR / parts[1], relative)
        self.serve_file(file_path)

    def serve_static_asset(self, path: str) -> None:
        file_path = request_path_to_file(ROOT, path)
        relative_parts = file_path.relative_to(ROOT).parts
        if not relative_parts:
            raise ProtoDockError(HTTPStatus.NOT_FOUND, "文件不存在")
        if relative_parts[0] in PRIVATE_ROOT_NAMES or file_path.name in PRIVATE_STATIC_FILES:
            raise ProtoDockError(HTTPStatus.NOT_FOUND, "文件不存在")
        self.serve_file(file_path)

    def serve_file(self, file_path: Path, content_type: str | None = None, download_name: str | None = None) -> None:
        if not file_path.is_file():
            raise ProtoDockError(HTTPStatus.NOT_FOUND, "文件不存在")
        content_type = content_type or mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(file_path.stat().st_size))
        if download_name:
            self.send_header(
                "Content-Disposition",
                f"attachment; filename=\"protodock-project.zip\"; filename*=UTF-8''{quote(download_name)}"
            )
        self.end_headers()
        if self.command != "HEAD":
            with file_path.open("rb") as file:
                shutil.copyfileobj(file, self.wfile)


def main() -> None:
    host = os.environ.get("PROTODOCK_HOST", "0.0.0.0")
    port = int(os.environ.get("PROTODOCK_PORT", "6080"))
    SHARES_DIR.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer((host, port), ProtoDockHandler)
    print(f"ProtoDock server listening on http://{host}:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
