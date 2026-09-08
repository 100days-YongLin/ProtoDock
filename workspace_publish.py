"""Whole-workspace releases: validated staging, immutable versions, one latest pointer."""
import hashlib
import json
import os
import re
import shutil
import tempfile
import threading
import zipfile
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote

_LOCK = threading.Lock()
_PART = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def component(value):
    return isinstance(value, str) and bool(_PART.fullmatch(value)) and ".." not in value and value not in {"latest", "download"}


def digest(root):
    result = hashlib.sha256()
    for file in sorted(root.rglob("*")):
        if file.is_file():
            result.update(str(file.relative_to(root)).encode())
            result.update(b"\0")
            result.update(hashlib.sha256(file.read_bytes()).digest())
    return result.hexdigest()


def publish(api, archive, fields):
    error = api.ProtoDockError
    product, version = fields.get("productName", ""), fields.get("version", "")
    if not component(product) or not component(version):
        raise error(400, "产品标识或版本号无效")
    root = api.SHARES_DIR / ".workspaces"
    root.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".upload-", dir=root))
    warnings = []
    try:
        with zipfile.ZipFile(BytesIO(archive)) as outer:
            infos = outer.infolist()
            names = [item.filename for item in infos]
            if len(names) != len(set(names)) or any(api.is_zip_symlink(item) for item in infos):
                raise error(400, "工作区 ZIP 不允许重复路径或软链接")
            if sum(item.file_size for item in infos) > api.MAX_EXTRACTED_BYTES:
                raise error(413, "工作区 ZIP 体积过大")
            if "protodock.workspace.json" not in names or outer.getinfo("protodock.workspace.json").file_size > 1024 * 1024:
                raise error(400, "缺少有效工作区清单")
            config = json.loads(outer.read("protodock.workspace.json"))
            if not isinstance(config, dict) or config.get("schemaVersion") != 1 or not isinstance(config.get("product"), dict):
                raise error(400, "工作区清单无效")
            if not component(config["product"].get("id")) or not isinstance(config["product"].get("name"), str):
                raise error(400, "工作区产品无效")
            projects = config.get("projects", [])
            if not isinstance(projects, list) or not 1 <= len(projects) <= 20 or config.get("product", {}).get("version") != version:
                raise error(400, "工作区端列表或统一版本无效")
            ids = [item.get("id") for item in projects if isinstance(item, dict)]
            if len(ids) != len(projects) or not all(component(item) for item in ids) or len(set(ids)) != len(ids):
                raise error(400, "工作区端标识无效或重复")
            expected = {"protodock.workspace.json", *(f"projects/{item}.zip" for item in ids)}
            if set(names) != expected:
                raise error(400, "工作区 ZIP 只能包含清单与声明的端 ZIP")
            shared_signature = None
            endpoint_releases = []
            total = 0
            for project in projects:
                if not isinstance(project.get("name"), str) or not project["name"]:
                    raise error(400, "端名称不能为空")
                endpoint = stage / "projects" / project["id"]
                endpoint.mkdir(parents=True)
                payload = outer.read(f"projects/{project['id']}.zip")
                with zipfile.ZipFile(BytesIO(payload)) as inner:
                    inner_names = inner.namelist()
                    if len(inner_names) != len(set(inner_names)):
                        raise error(400, "端 ZIP 不允许重复路径")
                    total += sum(item.file_size for item in inner.infolist())
                    if total > api.MAX_EXTRACTED_BYTES:
                        raise error(413, "工作区解压后体积过大")
                validation = api.safe_extract_project_zip(payload, endpoint)
                endpoint_release = api.validate_publish_release(endpoint, version)
                endpoint_releases.append({"id": project["id"], "name": project["name"], "changedAt": endpoint_release["changedAt"], "description": endpoint_release["description"]})
                manifest = json.loads((endpoint / api.MANIFEST_FILE).read_text())
                snapshot = manifest.get("workspaceSnapshot", {})
                if snapshot.get("product") != config.get("product") or snapshot.get("project", {}).get("id") != project["id"]:
                    raise error(400, "各端工作区快照不一致")
                shared = []
                for doc in snapshot.get("sharedDocs", []):
                    if not isinstance(doc, dict) or not isinstance(doc.get("id"), str) or not re.fullmatch(r"[\w][\w.-]{0,127}", doc["id"]) or ".." in doc["id"] or doc.get("path") != f"docs/_shared/{doc['id']}.md":
                        raise error(400, "共享文档路径无效")
                    shared.append((doc["id"], doc["title"], api.safe_target_path(endpoint, api.PurePosixPath(doc["path"])).read_text()))
                if len({doc[0] for doc in shared}) != len(shared):
                    raise error(400, "共享文档标识重复")
                if shared_signature is not None and shared != shared_signature:
                    raise error(400, "各端共享文档不一致")
                shared_signature = shared
                project["path"] = f"projects/{project['id']}"
                warnings.extend(f"{project['name']}：{item}" for item in validation.get("warnings", []))
            config["sharedDocs"] = "shared-docs"
            shared_root = stage / "shared-docs"
            shared_root.mkdir()
            for doc_id, title, content in shared_signature or []:
                (shared_root / f"{doc_id}.md").write_text(content)
            (stage / "protodock.workspace.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n")
            (stage / "release.json").write_text(json.dumps({"version": version, "description": str(fields.get("commitMessage", "")).strip(), "projects": endpoint_releases}, ensure_ascii=False, indent=2) + "\n")
        final = root / product / version
        final.parent.mkdir(parents=True, exist_ok=True)
        # Serialize visibility and Git publication for this process. Existing single-end releases are independent.
        with _LOCK:
            existed = final.exists()
            if existed and digest(final) != digest(stage):
                raise error(409, "此工作区版本已存在且内容不同，请使用新版本号")
            github = None
            if api.boolean_form_value(fields.get("syncGithub", "")):
                github = api.push_project_to_github(stage, "workspace-" + product, version, fields.get("commitMessage", ""), workspace=True)
            if not existed:
                stage.rename(final)
            pointer = final.parent / ".latest.json"
            # Retrying an old immutable version must not roll the latest entry back.
            update_pointer = not existed or not pointer.exists()
            fd, temporary = tempfile.mkstemp(prefix=".latest-", dir=final.parent)
            try:
                with os.fdopen(fd, "w") as output:
                    json.dump({"version": version}, output)
                if update_pointer:
                    os.replace(temporary, pointer)
                else:
                    Path(temporary).unlink()
            except Exception:
                Path(temporary).unlink(missing_ok=True)
                if not existed:
                    shutil.rmtree(final)
                raise
        return {"id":f"{product}/{version}", "path":f"/w/{product}/{version}", "latestPath":f"/w/{product}/latest", "action":"updated" if existed else "created", "github":github, "warnings":warnings, "workspace":True}
    except (zipfile.BadZipFile, KeyError, ValueError, TypeError, AttributeError, FileNotFoundError) as exc:
        raise error(400, "工作区发布包格式无效") from exc
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def route(handler, api, path):
    parts = unquote(path).strip("/").split("/")
    if parts[0] not in {"w", "workspace-assets"}:
        return False
    if len(parts) < 3 or not component(parts[1]) or not (component(parts[2]) or parts[2] == "latest"):
        raise api.ProtoDockError(404, "工作区版本不存在")
    root = api.SHARES_DIR / ".workspaces" / parts[1]
    version = parts[2]
    if version == "latest":
        try:
            version = json.loads((root / ".latest.json").read_text())["version"]
        except (OSError, KeyError, ValueError):
            raise api.ProtoDockError(404, "尚无工作区发布版本")
        if not component(version):
            raise api.ProtoDockError(404, "工作区版本无效")
    directory = root / version
    if not (directory / "protodock.workspace.json").is_file():
        raise api.ProtoDockError(404, "工作区版本不存在")
    if parts[0] == "w":
        if len(parts) != 3:
            raise api.ProtoDockError(404, "工作区路径无效")
        handler.serve_file(api.ROOT / "workspace-preview.html")
    else:
        relative = "/".join(parts[3:])
        if relative not in {"protodock.workspace.json", "release.json"}:
            if len(parts) < 6 or parts[3] != "projects" or not component(parts[4]) or not api.allowed_project_path(api.PurePosixPath(*parts[5:])):
                raise api.ProtoDockError(404, "文件不存在")
        file = api.request_path_to_file(directory, relative)
        handler.serve_file(file, cache_control="no-cache" if parts[2] == "latest" else "public, max-age=31536000, immutable")
    return True
