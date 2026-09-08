import json
import tempfile
import unittest
import zipfile
from io import BytesIO
from pathlib import Path
from unittest.mock import patch, Mock

import server
import workspace_publish as releases


def zipped(entries):
    stream = BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path, data in entries.items():
            archive.writestr(path, data)
    return stream.getvalue()


def package(version='v1', broken=False, text='文档', differing_shared=False):
    product = {'id': 'demo', 'name': 'Demo', 'description': '', 'version': version}
    projects = [{'id': name, 'name': name, 'path': f'original/{name}'} for name in ['teacher', 'parent', 'web']]
    config = {'schemaVersion': 1, 'product': product, 'projects': projects, 'sharedDocs': 'shared-docs'}
    entries = {'protodock.workspace.json': json.dumps(config)}
    for project in projects:
        manifest = {
            'schemaVersion': 1, 'project': {'id': project['id'], 'name': project['name']},
            'pages': {'home': {'title': '首页', 'entry': 'pages/home/index.html', 'doc': 'docs/home.md'}},
            'canvas': {'nodes': [{'id': 'home-node', 'pageId': 'home', 'x': 0, 'y': 0}], 'edges': [], 'notes': []},
            'changelog': [{'version': version, 'changedAt': '2026-09-08T10:00:00Z', 'description': '更新产品文档'}],
            'workspaceSnapshot': {'product': product, 'project': {'id': project['id'], 'name': project['name']},
                                  'sharedDocs': [{'id': 'overview', 'title': '总览', 'path': 'docs/_shared/overview.md'}]},
        }
        if broken and project['id'] == 'web':
            manifest['pendingChanges'] = [{'changedAt': '2026-09-08T11:00:00Z', 'description': '未发布'}]
        entries[f"projects/{project['id']}.zip"] = zipped({
            'protodock.project.json': json.dumps(manifest),
            'docs/_shared/overview.md': text + ('不同' if differing_shared and project['id'] == 'web' else ''),
            'pages/home/index.html': '<!doctype html><html><body><h1>首页</h1></body></html>',
            'docs/home.md': '# 首页\n展示首页。',
        })
    return zipped(entries)


class WorkspacePublishingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.patch = patch.object(server, 'SHARES_DIR', self.root)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def publish(self, **options):
        version = options.get('version', 'v1')
        return releases.publish(server, package(**options), {'productName': 'demo', 'version': version})

    def test_three_endpoints_and_shared_snapshot(self):
        result = self.publish()
        self.assertEqual(result['path'], '/w/demo/v1')
        root = self.root / '.workspaces/demo/v1'
        config = json.loads((root / 'protodock.workspace.json').read_text())
        self.assertEqual(len(config['projects']), 3)
        for project in config['projects']:
            self.assertTrue((root / project['path'] / 'protodock.project.json').is_file())
        self.assertEqual((root / 'shared-docs/overview.md').read_text(), '文档')

    def test_bad_endpoint_and_shared_mismatch_leave_latest_unchanged(self):
        self.publish()
        for options in [{'broken': True}, {'differing_shared': True}]:
            with self.assertRaises(server.ProtoDockError):
                self.publish(version='v2', **options)
            self.assertFalse((self.root / '.workspaces/demo/v2').exists())
            self.assertEqual(json.loads((self.root / '.workspaces/demo/.latest.json').read_text())['version'], 'v1')
        self.assertFalse(list((self.root / '.workspaces').glob('.upload-*')))

    def test_version_is_immutable_and_same_content_retry_succeeds(self):
        self.publish()
        self.assertEqual(self.publish()['action'], 'updated')
        with self.assertRaises(server.ProtoDockError) as error:
            self.publish(text='修改')
        self.assertEqual(error.exception.status, 409)

    def test_git_failure_does_not_publish(self):
        with patch.object(server, 'push_project_to_github', side_effect=server.ProtoDockError(502, 'Git 失败')):
            with self.assertRaises(server.ProtoDockError):
                releases.publish(server, package(), {'productName': 'demo', 'version': 'v1', 'syncGithub': 'true'})
        self.assertFalse((self.root / '.workspaces/demo/v1').exists())

    def test_retry_old_version_does_not_roll_latest_back(self):
        self.publish()
        self.publish(version='v2')
        self.publish()
        self.assertEqual(json.loads((self.root / '.workspaces/demo/.latest.json').read_text())['version'], 'v2')

    def test_git_receives_one_complete_workspace(self):
        with patch.object(server, 'push_project_to_github', return_value={'action': 'created'}) as push:
            releases.publish(server, package(), {'productName': 'demo', 'version': 'v1', 'syncGithub': 'true'})
        self.assertEqual(push.call_count, 1)
        self.assertEqual(push.call_args.args[1:3], ('workspace-demo', 'v1'))
        self.assertTrue(push.call_args.kwargs['workspace'])

    def test_routes_and_private_paths(self):
        self.publish()
        handler = Mock()
        for path in ['/w/demo/latest', '/w/demo/v1', '/workspace-assets/demo/v1/projects/teacher/protodock.project.json']:
            self.assertTrue(releases.route(handler, server, path))
        for path in ['/workspace-assets/demo/v1/projects/teacher/../../server.py', '/workspace-assets/demo/v1/.latest.json', '/w/demo/absent']:
            with self.assertRaises(server.ProtoDockError):
                releases.route(handler, server, path)

    def test_zip_allowlist_and_expansion_limit(self):
        with self.assertRaises(server.ProtoDockError):
            releases.publish(server, zipped({'../oops': 'x'}), {'productName': 'demo', 'version': 'v1'})
        with patch.object(server, 'MAX_EXTRACTED_BYTES', 100):
            with self.assertRaises(server.ProtoDockError) as error:
                self.publish()
        self.assertEqual(error.exception.status, 413)


if __name__ == '__main__':
    unittest.main()
