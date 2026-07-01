#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
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
        "branchPattern": "产品名/版本号",
    }


def github_deploy_key_git_env() -> dict[str, str]:
    ensure_github_deploy_key()
    return {
        "GIT_SSH_COMMAND": (
            f"ssh -i {GITHUB_KEY_PATH} "
            "-o IdentitiesOnly=yes "
            "-o StrictHostKeyChecking=accept-new"
        )
    }


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
        with urllib_request.urlopen(request, timeout=20) as response:
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


def github_app_git_context(work_dir: Path) -> tuple[str, dict[str, str]]:
    token = github_app_installation_token()
    askpass_path = work_dir / ".git-askpass.sh"
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
    return github_https_repo_url(GITHUB_REPO_URL), {
        "GIT_ASKPASS": str(askpass_path),
        "GIT_TERMINAL_PROMPT": "0",
        "PROTODOCK_GITHUB_TOKEN": token,
    }


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


def push_project_to_github(project_dir: Path, product_name: str, version: str, commit_message: str) -> dict:
    if not GITHUB_REPO_URL:
        raise ProtoDockError(HTTPStatus.BAD_REQUEST, "服务器未配置 PROTODOCK_GITHUB_REPO")

    branch = github_branch_name(product_name, version)
    message = safe_commit_message(commit_message)
    GITHUB_WORK_DIR.mkdir(parents=True, exist_ok=True)
    work_dir = Path(tempfile.mkdtemp(prefix=".push-", dir=GITHUB_WORK_DIR))

    try:
        remote_url, git_env = github_git_context(work_dir)
        run_command(["git", "init"], cwd=work_dir, env=git_env)
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

    def do_POST(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/api/shares":
                self.handle_share_upload()
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

    def handle_github_config(self) -> None:
        self.send_json(HTTPStatus.OK, github_config_payload())

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
