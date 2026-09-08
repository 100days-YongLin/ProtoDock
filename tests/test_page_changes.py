import unittest
from protodock_validation import validate_changelog


class PageChangesTest(unittest.TestCase):
    def manifest(self, **overrides):
        change = dict(pageId="home", title="首页", type="modify", summary="合并字段", before="两个字段", after="一个字段")
        change.update(overrides)
        return dict(pages={"home": {}}, pendingChanges=[dict(changedAt="2026-09-08T10:00:00Z", description="调整字段", pageChanges=[change])])

    def test_valid(self):
        self.assertFalse(validate_changelog(self.manifest())["issues"])

    def test_missing_field(self):
        self.assertTrue(validate_changelog(self.manifest(before=""))["issues"])

    def test_no_development_status(self):
        self.assertTrue(validate_changelog(self.manifest(status="done"))["issues"])

    def test_removed_page(self):
        manifest = self.manifest(pageId="removed", type="remove")
        manifest["pendingChanges"][0]["pageIds"] = ["removed"]
        self.assertFalse(validate_changelog(manifest)["issues"])

    def test_typo_page(self):
        self.assertTrue(validate_changelog(self.manifest(pageId="typo"))["issues"])
