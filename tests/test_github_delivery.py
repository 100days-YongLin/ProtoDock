import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from github_delivery import GitDeliveryError, publish_git_delivery


def git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return result.stdout.strip()


def write_project(root: Path, title: str) -> None:
    (root / "pages" / "home").mkdir(parents=True, exist_ok=True)
    (root / "docs").mkdir(parents=True, exist_ok=True)
    (root / "protodock.project.json").write_text(
        json.dumps({"project": {"id": "demo", "name": title}}, ensure_ascii=False),
        encoding="utf-8",
    )
    (root / "pages" / "home" / "index.html").write_text(f"<h1>{title}</h1>", encoding="utf-8")
    (root / "docs" / "home.md").write_text(f"# {title}\n", encoding="utf-8")


def copy_project(source: Path, destination: Path) -> None:
    for child in destination.iterdir():
        if child.name == ".git":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    for child in source.iterdir():
        target = destination / child.name
        if child.is_dir():
            shutil.copytree(child, target)
        else:
            target.write_bytes(child.read_bytes())


class GitHubDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.origin = self.root / "origin.git"
        self.workspace = self.root / "delivery"
        self.project = self.root / "project"
        self.project.mkdir()
        git(self.root, "init", "--bare", str(self.origin))

    def tearDown(self):
        self.temp.cleanup()

    def publish(self, version: str, message: str = "update") -> dict:
        return publish_git_delivery(
            self.project,
            self.workspace,
            product_branch="project/demo",
            release_tag=f"release/demo/{version}",
            commit_message=message,
            author_name="ProtoDock Test",
            author_email="protodock@example.com",
            remote_context=lambda _: (str(self.origin), {}),
            copy_project=copy_project,
        )

    def test_reuses_product_branch_and_creates_immutable_release_tags(self):
        write_project(self.project, "Version 1")
        first = self.publish("v1", "publish v1")
        write_project(self.project, "Version 2")
        second = self.publish("v2", "publish v2")

        self.assertEqual(first["branch"], "project/demo")
        self.assertEqual(first["tag"], "release/demo/v1")
        self.assertEqual(second["previousCommit"], first["commit"])
        self.assertTrue(second["changes"])
        self.assertEqual(git(self.origin, "rev-list", "--count", "project/demo"), "2")
        self.assertEqual(git(self.origin, "rev-parse", "release/demo/v1"), first["commit"])
        self.assertEqual(git(self.origin, "rev-parse", "release/demo/v2"), second["commit"])

    def test_allows_idempotent_publish_but_rejects_rewriting_a_version(self):
        write_project(self.project, "Version 1")
        first = self.publish("v1", "publish v1")
        repeated = self.publish("v1", "publish v1 again")
        self.assertEqual(repeated["action"], "unchanged")
        self.assertEqual(repeated["commit"], first["commit"])

        write_project(self.project, "Changed Version 1")
        with self.assertRaisesRegex(GitDeliveryError, "Tag 不允许覆盖"):
            self.publish("v1", "rewrite v1")
        self.assertEqual(git(self.origin, "rev-parse", "project/demo"), first["commit"])


if __name__ == "__main__":
    unittest.main()
