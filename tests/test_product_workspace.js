const assert = require('node:assert/strict');

require('../product-workspace.js');

const Workspace = globalThis.ProtoDockProductWorkspace;

function notFound() {
  const error = new Error('missing');
  error.name = 'NotFoundError';
  return error;
}

function file(name, text) {
  return {
    kind: 'file',
    name,
    async getFile() {
      return { async text() { return text; } };
    }
  };
}

function directory(name, tree) {
  return {
    kind: 'directory',
    name,
    async getDirectoryHandle(childName) {
      const child = tree[childName];
      if (!child || child.kind !== 'directory') throw notFound();
      return child;
    },
    async getFileHandle(childName) {
      const child = tree[childName];
      if (!child || child.kind !== 'file') throw notFound();
      return child;
    },
    async *entries() {
      for (const entry of Object.entries(tree)) yield entry;
    }
  };
}

const projectManifest = JSON.stringify({
  schemaVersion: 1,
  project: { id: 'teacher-prototype', name: '教师端', devicePreset: 'iphone-portrait' },
  pages: { home: { title: '首页', entry: 'pages/home/index.html', doc: 'docs/home.md' } },
  canvas: { nodes: [], edges: [] }
});
const workspaceManifest = JSON.stringify({
  schemaVersion: 1,
  product: { id: 'youerjia', name: '优儿嘉', version: 'v1.2.0' },
  sharedDocs: 'shared-docs',
  projects: [
    { id: 'parent', name: '家长端', path: 'prototypes/parent' },
    { id: 'teacher', name: '教师端', path: 'prototypes/teacher' }
  ]
});
const root = directory('youerjia', {
  'protodock.workspace.json': file('protodock.workspace.json', workspaceManifest),
  'shared-docs': directory('shared-docs', {
    '01-overview.md': file('01-overview.md', '# 产品概述\n\n共享说明。'),
    '02-rules.md': file('02-rules.md', '没有一级标题')
  }),
  prototypes: directory('prototypes', {
    parent: directory('parent', { 'protodock.project.json': file('protodock.project.json', projectManifest) }),
    teacher: directory('teacher', { 'protodock.project.json': file('protodock.project.json', projectManifest) })
  })
});

(async () => {
  const loaded = await Workspace.load(root);
  assert.equal(loaded.config.product.name, '优儿嘉');
  assert.deepEqual(loaded.projects.map((project) => project.id), ['parent', 'teacher']);
  assert.deepEqual(loaded.sharedDocuments.map((document) => document.title), ['产品概述', '02-rules']);
  assert.equal(loaded.sharedDocuments[0].releasePath, 'docs/_shared/01-overview.md');
  assert.equal(Workspace.publishProductId(loaded.config, loaded.projects[1]), 'youerjia-teacher');

  const snapshot = Workspace.snapshot(loaded.config, loaded.projects[1], 'v1.3.0', loaded.sharedDocuments);
  assert.equal(snapshot.product.version, 'v1.3.0');
  assert.equal(snapshot.project.name, '教师端');
  assert.deepEqual(snapshot.sharedDocs.map((document) => document.path), [
    'docs/_shared/01-overview.md',
    'docs/_shared/02-rules.md'
  ]);

  assert.throws(() => Workspace.normalize({
    schemaVersion: 1,
    product: { id: 'demo', name: 'Demo' },
    projects: [{ id: 'web', name: 'Web', path: '../outside' }]
  }), /相对路径/);
  assert.throws(() => Workspace.normalize({
    schemaVersion: 1,
    product: { id: 'demo', name: 'Demo' },
    projects: [
      { id: 'web', name: 'Web', path: 'projects/web' },
      { id: 'web', name: 'Web 2', path: 'projects/web-2' }
    ]
  }), /端标识重复/);

  await assert.rejects(Workspace.load(directory('broken', {
    'protodock.workspace.json': file('protodock.workspace.json', JSON.stringify({
      schemaVersion: 1,
      product: { id: 'demo', name: 'Demo' },
      projects: [{ id: 'web', name: 'Web', path: 'projects/web' }]
    }))
  })), /缺少 projects\/web\/protodock.project.json/);

  console.log('product workspace tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
