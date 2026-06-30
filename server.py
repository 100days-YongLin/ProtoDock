#!/usr/bin/env python3
from __future__ import annotations

import json
import mimetypes
import os
import posixpath
import secrets
import shutil
import stat
import tempfile
import zipfile
from email import policy
from email.parser import BytesParser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote, urlparse


ROOT = Path(__file__).resolve().parent
SHARES_DIR = ROOT / "shares"
DOCS_EXPORT_DIR = ROOT / "docs-dist"
MANIFEST_FILE = "protodock.project.json"

MAX_UPLOAD_BYTES = int(os.environ.get("PROTODOCK_MAX_UPLOAD_BYTES", 100 * 1024 * 1024))
MAX_EXTRACTED_BYTES = int(os.environ.get("PROTODOCK_MAX_EXTRACTED_BYTES", 250 * 1024 * 1024))
MAX_FILE_BYTES = int(os.environ.get("PROTODOCK_MAX_FILE_BYTES", 80 * 1024 * 1024))

ALLOWED_ROOT_FILES = {MANIFEST_FILE}
ALLOWED_ROOT_DIRS = {"pages", "docs", "assets"}
PRIVATE_ROOT_NAMES = {".git", "shares", "protodock", "node_modules", "exports", "docs-site", "docs-dist"}
PRIVATE_STATIC_FILES = {"server.py", "protodock.log", "protodock.pid"}
DOCS_ASSET_ROOTS = {"_next", "favicons", "images", "logo"}
DOCS_PAGE_ROOTS = {
    "quickstart",
    "project-structure",
    "ai-agent-workflow",
    "canvas-workflow",
    "sharing",
    "deployment",
    "agent-boundaries",
}


class ProtoDockError(Exception):
    def __init__(self, status: HTTPStatus, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


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


def choose_project_prefix(zip_file: zipfile.ZipFile) -> PurePosixPath:
    paths = [clean_zip_name(info.filename) for info in zip_file.infolist()]
    paths = [path for path in paths if path is not None]
    if any(str(path) == MANIFEST_FILE for path in paths):
        return PurePosixPath(".")
    candidates = {
        path.parts[0]
        for path in paths
        if len(path.parts) >= 2 and path.parts[1] == MANIFEST_FILE
    }
    if len(candidates) == 1:
        return PurePosixPath(next(iter(candidates)))
    raise ProtoDockError(HTTPStatus.BAD_REQUEST, "zip 中未找到 protodock.project.json")


def relative_project_path(path: PurePosixPath, prefix: PurePosixPath) -> PurePosixPath | None:
    if str(prefix) == ".":
        return path
    if not path.parts or path.parts[0] != str(prefix):
        return None
    rest = path.parts[1:]
    if not rest:
        return None
    return PurePosixPath(*rest)


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


def safe_extract_project_zip(archive_bytes: bytes, destination: Path) -> None:
    total_size = 0
    try:
        with zipfile.ZipFile(BytesIO(archive_bytes)) as zip_file:
            prefix = choose_project_prefix(zip_file)
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
                relative_path = relative_project_path(clean_path, prefix)
                if relative_path is None or not allowed_project_path(relative_path):
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

    manifest_path = destination / MANIFEST_FILE
    try:
        with manifest_path.open("r", encoding="utf-8") as file:
            json.load(file)
    except json.JSONDecodeError as error:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "protodock.project.json 不是合法 JSON") from error


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


class ProtoDockHandler(BaseHTTPRequestHandler):
    server_version = "ProtoDockShare/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print("%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def send_json(self, status: HTTPStatus, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_error_json(self, error: ProtoDockError) -> None:
        self.send_json(error.status, {"error": error.message})

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

    def do_POST(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path != "/api/shares":
                raise ProtoDockError(HTTPStatus.NOT_FOUND, "接口不存在")
            self.handle_share_upload()
        except ProtoDockError as error:
            self.send_error_json(error)
        except Exception as error:
            print(f"Unhandled POST error: {error}")
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "服务器内部错误"})

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
            safe_extract_project_zip(archive, temp_dir)
            replace_share_directory(final_dir, temp_dir, share_id)
        except Exception:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise

        path = f"/s/{share_id}"
        self.send_json(status, {
            "id": share_id,
            "path": path,
            "url": self.absolute_url(path),
            "action": "updated" if is_update else "created"
        })

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
        if not (SHARES_DIR / parts[1] / MANIFEST_FILE).is_file():
            raise ProtoDockError(HTTPStatus.NOT_FOUND, "分享项目不存在")
        index_path = ROOT / "index.html"
        html = index_path.read_text(encoding="utf-8")
        if "<base " not in html:
            html = html.replace("<head>", '<head>\n  <base href="/">', 1)
        data = html.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
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
