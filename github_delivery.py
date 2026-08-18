from __future__ import annotations

import os
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Callable


class GitDeliveryError(RuntimeError):
    pass


_DELIVERY_LOCK = threading.Lock()


def copy_project_to_workspace(project_dir: Path, workspace: Path) -> None:
    for child in workspace.iterdir():
        if child.name == ".git":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()

    manifest = project_dir / "protodock.project.json"
    if not manifest.is_file():
        raise GitDeliveryError("项目包缺少 protodock.project.json")
    shutil.copy2(manifest, workspace / manifest.name)
    for root_name in ("assets", "docs", "pages"):
        source = project_dir / root_name
        if source.is_dir():
            shutil.copytree(source, workspace / root_name)


def run_git(
    args: list[str],
    cwd: Path,
    *,
    env: dict[str, str] | None = None,
    timeout: int = 120,
    check: bool = True,
) -> subprocess.CompletedProcess:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    result = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        env=merged_env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise GitDeliveryError(detail or f"Git 命令执行失败：{' '.join(args)}")
    return result


def remote_ref_hash(
    workspace: Path,
    remote: str,
    ref_name: str,
    *,
    env: dict[str, str],
    timeout: int,
) -> str:
    result = run_git(
        ["ls-remote", remote, ref_name, f"{ref_name}^{{}}"],
        workspace,
        env=env,
        timeout=timeout,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise GitDeliveryError(detail or "读取远程 Git 引用失败")
    direct = ""
    peeled = ""
    for line in result.stdout.splitlines():
        parts = line.split(maxsplit=1)
        if len(parts) != 2:
            continue
        commit_hash, name = parts
        if name.endswith("^{}"):
            peeled = commit_hash
        elif name == ref_name:
            direct = commit_hash
    return peeled or direct


def prepare_product_branch(
    workspace: Path,
    branch: str,
    *,
    env: dict[str, str],
    timeout: int,
) -> tuple[bool, str]:
    remote_ref = f"refs/heads/{branch}"
    remote_hash = remote_ref_hash(workspace, "origin", remote_ref, env=env, timeout=timeout)
    if remote_hash:
        run_git(["fetch", "--no-tags", "origin", remote_ref], workspace, env=env, timeout=timeout)
        run_git(["checkout", "-B", branch, "FETCH_HEAD"], workspace, env=env, timeout=timeout)
        return True, remote_hash

    has_head = run_git(["rev-parse", "--verify", "HEAD"], workspace, env=env, timeout=timeout, check=False)
    if has_head.returncode == 0:
        run_git(["checkout", "--detach", "HEAD"], workspace, env=env, timeout=timeout)
    run_git(["branch", "-D", branch], workspace, env=env, timeout=timeout, check=False)
    run_git(["checkout", "--orphan", branch], workspace, env=env, timeout=timeout)
    run_git(["rm", "-rf", "--cached", "."], workspace, env=env, timeout=timeout, check=False)
    return False, ""


def publish_git_delivery(
    project_dir: Path,
    workspace: Path,
    *,
    product_branch: str,
    release_tag: str,
    commit_message: str,
    author_name: str,
    author_email: str,
    remote_context: Callable[[Path], tuple[str, dict[str, str]]],
    copy_project: Callable[[Path, Path], None],
    timeout: int = 120,
) -> dict:
    with _DELIVERY_LOCK:
        workspace.mkdir(parents=True, exist_ok=True)
        if not (workspace / ".git").is_dir():
            run_git(["init"], workspace, timeout=timeout)

        remote_url, git_env = remote_context(workspace)
        current_remote = run_git(
            ["remote", "get-url", "origin"],
            workspace,
            env=git_env,
            timeout=timeout,
            check=False,
        )
        if current_remote.returncode == 0:
            run_git(["remote", "set-url", "origin", remote_url], workspace, env=git_env, timeout=timeout)
        else:
            run_git(["remote", "add", "origin", remote_url], workspace, env=git_env, timeout=timeout)

        run_git(["config", "user.name", author_name], workspace, env=git_env, timeout=timeout)
        run_git(["config", "user.email", author_email], workspace, env=git_env, timeout=timeout)
        branch_existed, previous_commit = prepare_product_branch(
            workspace,
            product_branch,
            env=git_env,
            timeout=timeout,
        )

        copy_project(project_dir, workspace)
        run_git(["add", "-A"], workspace, env=git_env, timeout=timeout)
        name_status = run_git(
            ["diff", "--cached", "--name-status", "--find-renames"],
            workspace,
            env=git_env,
            timeout=timeout,
        ).stdout.strip()
        diff_stat = run_git(
            ["diff", "--cached", "--stat"],
            workspace,
            env=git_env,
            timeout=timeout,
        ).stdout.strip()
        changes = [line for line in name_status.splitlines() if line.strip()]

        if changes:
            run_git(["commit", "-m", commit_message], workspace, env=git_env, timeout=timeout)
            commit_hash = run_git(["rev-parse", "HEAD"], workspace, env=git_env, timeout=timeout).stdout.strip()
        else:
            head = run_git(["rev-parse", "HEAD"], workspace, env=git_env, timeout=timeout, check=False)
            if head.returncode != 0:
                raise GitDeliveryError("Git 交付工作区没有可发布内容")
            commit_hash = head.stdout.strip()

        tag_ref = f"refs/tags/{release_tag}"
        remote_tag_hash = remote_ref_hash(workspace, "origin", tag_ref, env=git_env, timeout=timeout)
        if remote_tag_hash and remote_tag_hash != commit_hash:
            raise GitDeliveryError(
                f"版本 {release_tag} 已经发布且内容不同，请填写新的版本号；发布 Tag 不允许覆盖"
            )

        push_refs = [f"refs/heads/{product_branch}:refs/heads/{product_branch}"]
        tag_created = not remote_tag_hash
        if tag_created:
            run_git(["tag", "-d", release_tag], workspace, env=git_env, timeout=timeout, check=False)
            run_git(["tag", release_tag, commit_hash], workspace, env=git_env, timeout=timeout)
            push_refs.append(f"{tag_ref}:{tag_ref}")
        run_git(["push", "--atomic", "origin", *push_refs], workspace, env=git_env, timeout=timeout)

        if changes:
            action = "pushed"
        elif tag_created:
            action = "tagged"
        else:
            action = "unchanged"
        return {
            "branch": product_branch,
            "tag": release_tag,
            "commit": commit_hash,
            "previousCommit": previous_commit if branch_existed else "",
            "action": action,
            "changes": changes,
            "diffStat": diff_stat,
            "workspaceReused": True,
        }
