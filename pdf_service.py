from __future__ import annotations

import hashlib
import os
import re
import secrets
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote, unquote, urlparse


class PdfService:
    def __init__(
        self,
        *,
        root: Path,
        cache_dir: Path,
        renderer_script: Path,
        renderer_python: Path,
        internal_origin: str,
        render_timeout_seconds: int,
        render_workers: int,
        playwright_platform: str,
        renderer_version: str,
        latest_component: str,
        normalize_reference,
        latest_reference,
        share_directory,
        iter_share_files,
        share_reference_path,
        project_download_filename,
        not_found,
    ):
        self.root = root
        self.cache_dir = cache_dir
        self.renderer_script = renderer_script
        self.renderer_python = renderer_python
        self.internal_origin = internal_origin
        self.render_timeout_seconds = render_timeout_seconds
        self.playwright_platform = playwright_platform
        self.renderer_version = renderer_version
        self.latest_component = latest_component
        self.normalize_reference = normalize_reference
        self.latest_reference = latest_reference
        self.share_directory = share_directory
        self.iter_share_files = iter_share_files
        self.share_reference_path = share_reference_path
        self.project_download_filename = project_download_filename
        self.not_found = not_found
        self.job_lock = threading.Lock()
        self.jobs: dict[str, dict] = {}
        self.executor = ThreadPoolExecutor(
            max_workers=max(1, min(4, render_workers)),
            thread_name_prefix="protodock-pdf",
        )

    def content_revision(self, directory: Path) -> str:
        digest = hashlib.sha256()
        digest.update(f"pdf-renderer:{self.renderer_version}\0".encode("utf-8"))
        for file_path, archive_name in self.iter_share_files(directory):
            digest.update(archive_name.encode("utf-8"))
            digest.update(b"\0")
            with file_path.open("rb") as source:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
            digest.update(b"\0")
        return digest.hexdigest()

    def resolve_reference(self, reference: str) -> str:
        parts = [part for part in str(reference or "").strip("/").split("/") if part]
        if len(parts) == 2 and parts[1].lower() == self.latest_component:
            return self.latest_reference(parts[0])
        normalized = self.normalize_reference(reference)
        if not normalized:
            raise self.not_found("分享项目不存在")
        return normalized

    def resource_path(self, reference: str, suffix: str = "") -> str:
        normalized = self.resolve_reference(reference)
        encoded = "/".join(quote(part, safe="") for part in normalized.split("/"))
        return f"/api/shares/{encoded}/pdf{suffix}"

    def artifact_path(self, reference: str, revision: str) -> Path:
        normalized = self.normalize_reference(reference)
        if not normalized or not re.fullmatch(r"[a-f0-9]{64}", revision):
            raise self.not_found("PDF 文件不存在")
        return self.cache_dir / Path(*normalized.split("/")) / f"{revision}.pdf"

    def download_filename(self, directory: Path, reference: str) -> str:
        archive_name = self.project_download_filename(directory, reference)
        base_name = archive_name[:-4] if archive_name.endswith(".zip") else archive_name
        return f"{base_name}.pdf"

    def renderer_available(self) -> bool:
        return self.renderer_script.is_file() and self.renderer_python.is_file()

    def update_job(self, reference: str, revision: str, status: str, error: str = "") -> None:
        with self.job_lock:
            current = self.jobs.get(reference)
            if status != "queued" and current and current.get("revision") != revision:
                return
            self.jobs[reference] = {
                "revision": revision,
                "status": status,
                "error": error,
                "updatedAt": time.time(),
            }

    def invalidate(self, reference: str) -> None:
        normalized = self.normalize_reference(reference)
        if not normalized:
            return
        with self.job_lock:
            self.jobs.pop(normalized, None)

    def renderer_environment(self) -> dict[str, str]:
        environment = os.environ.copy()
        if self.playwright_platform:
            environment["PLAYWRIGHT_HOST_PLATFORM_OVERRIDE"] = self.playwright_platform
        return environment

    def render_job(self, reference: str, revision: str, output_path: Path) -> None:
        self.update_job(reference, revision, "generating")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = output_path.parent / f".{revision}-{secrets.token_urlsafe(6)}.pdf"
        preview_url = f"{self.internal_origin}{self.share_reference_path(reference)}?pdf-render=1"
        command = [
            str(self.renderer_python),
            str(self.renderer_script),
            "--url",
            preview_url,
            "--output",
            str(temp_path),
            "--timeout-seconds",
            str(self.render_timeout_seconds),
        ]
        try:
            result = subprocess.run(
                command,
                cwd=self.root,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=self.render_timeout_seconds + 30,
                env=self.renderer_environment(),
                check=False,
            )
            if result.returncode != 0:
                detail = (result.stderr or result.stdout or "PDF 渲染器执行失败").strip()
                raise RuntimeError(detail[-1200:])
            if not temp_path.is_file() or temp_path.stat().st_size < 5:
                raise RuntimeError("PDF 渲染器没有生成有效文件")
            with temp_path.open("rb") as generated_pdf:
                if generated_pdf.read(5) != b"%PDF-":
                    raise RuntimeError("PDF 渲染器没有生成有效文件")
            os.replace(temp_path, output_path)
            for stale_path in output_path.parent.glob("*.pdf"):
                if stale_path != output_path:
                    stale_path.unlink(missing_ok=True)
            self.update_job(reference, revision, "ready")
        except Exception as error:
            temp_path.unlink(missing_ok=True)
            self.update_job(reference, revision, "failed", str(error)[-1200:])
            print(f"ProtoDock PDF render failed for {reference}: {error}")

    def status(self, reference: str, *, enqueue: bool = False) -> dict:
        resolved = self.resolve_reference(reference)
        directory = self.share_directory(resolved)
        with self.job_lock:
            job = dict(self.jobs.get(resolved) or {})
        if job.get("revision") and job.get("status") in {"queued", "generating", "failed", "ready"}:
            revision = job["revision"]
            artifact_path = self.artifact_path(resolved, revision)
            if job["status"] != "ready" or artifact_path.is_file():
                return self.status_payload(resolved, revision, job["status"])

        revision = self.content_revision(directory)
        artifact_path = self.artifact_path(resolved, revision)
        status = "ready" if artifact_path.is_file() else "missing"
        if status == "ready":
            self.update_job(resolved, revision, status)
            return self.status_payload(resolved, revision, status)
        if not self.renderer_available():
            return self.status_payload(resolved, revision, "unavailable")
        if enqueue:
            self.update_job(resolved, revision, "queued")
            self.executor.submit(self.render_job, resolved, revision, artifact_path)
            status = "queued"
        return self.status_payload(resolved, revision, status)

    def status_payload(self, reference: str, revision: str, status: str) -> dict:
        errors = {
            "failed": "PDF 生成失败，请使用浏览器打印",
            "unavailable": "服务器尚未安装 PDF 渲染运行时",
        }
        return {
            "reference": reference,
            "revision": revision,
            "status": status,
            "pdfPath": self.resource_path(reference),
            "statusPath": self.resource_path(reference, "/status"),
            "error": errors.get(status, ""),
        }

    def parse_resource_path(self, path: str) -> tuple[str, str]:
        parts = [unquote(part) for part in urlparse(path).path.split("/") if part]
        if parts[:2] != ["api", "shares"]:
            raise self.not_found("接口不存在")
        tail = parts[2:]
        if tail[-1:] == ["download"]:
            resource = "download"
            reference_parts = tail[:-1]
        elif tail[-2:] == ["pdf", "status"]:
            resource = "pdf-status"
            reference_parts = tail[:-2]
        elif tail[-1:] == ["pdf"]:
            resource = "pdf"
            reference_parts = tail[:-1]
        else:
            raise self.not_found("接口不存在")
        if len(reference_parts) not in {1, 2}:
            raise self.not_found("接口不存在")
        reference = "/".join(reference_parts)
        reference = self.resolve_reference(reference) if resource.startswith("pdf") else self.normalize_reference(reference)
        if not reference:
            raise self.not_found("接口不存在")
        return resource, reference
