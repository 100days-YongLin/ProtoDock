const assert = require('node:assert/strict');

global.window = global;
require('../project-changelog.js');
require('../product-document.js');

const manifest = {
  project: { id: 'demo', name: '演示项目' },
  changelog: [{
    version: 'v1.1',
    changedAt: '2026-08-17T09:30:00+08:00',
    description: '补充完整产品文档。'
  }],
  pages: {
    home: { title: '首页', kind: '入口', entry: 'pages/home/index.html', doc: 'docs/home.md' },
    meal: { title: '进餐详情', kind: '详情', entry: 'pages/meal/index.html', doc: 'docs/meal.md' },
    milk: { title: '饮奶详情', kind: '详情', entry: 'pages/milk/index.html', doc: 'docs/milk.md' },
    orphan: { title: '旧版孤立页面', entry: 'pages/orphan/index.html', doc: 'docs/orphan.md' }
  },
  canvas: {
    nodes: [
      { id: 'node-home', pageId: 'home' },
      { id: 'node-meal', pageId: 'meal' },
      { id: 'node-milk', pageId: 'milk' },
      { id: 'node-meal-copy', pageId: 'meal' }
    ],
    groups: [{
      id: 'records',
      title: '生活记录详情',
      rootNodeId: 'node-home',
      nodeIds: ['node-meal', 'node-home']
    }]
  }
};

const sections = ProtoDockProductDocument.buildDocumentOutline(manifest);

assert.equal(sections.length, 2);
assert.equal(sections[0].title, '生活记录详情');
assert.equal(sections[0].ungrouped, false);
assert.deepEqual(sections[0].pages.map((page) => page.id), ['home', 'meal']);
assert.equal(sections[1].title, '其他页面');
assert.equal(sections[1].ungrouped, true);
assert.deepEqual(sections[1].pages.map((page) => page.id), ['milk', 'orphan']);
assert.deepEqual(
  sections.flatMap((section) => section.pages).map((page) => page.id),
  ['home', 'meal', 'milk', 'orphan']
);

assert.deepEqual(ProtoDockProductDocument.buildDocumentOutline(null), []);

assert.equal(ProtoDockProductDocument.documentLayoutMode('web-landscape'), 'web');
assert.equal(ProtoDockProductDocument.documentLayoutMode({ devicePreset: 'web-portrait' }), 'web');
assert.equal(ProtoDockProductDocument.documentLayoutMode('iphone-portrait'), 'device');
const layoutRoot = {
  classList: {
    values: new Set(),
    toggle(name, enabled) {
      if (enabled) this.values.add(name);
      else this.values.delete(name);
    }
  },
  dataset: {}
};
assert.equal(ProtoDockProductDocument.applyDocumentLayout(layoutRoot, 'web-landscape'), 'web');
assert.equal(layoutRoot.classList.values.has('is-web-document'), true);
assert.equal(layoutRoot.dataset.prototypePreset, 'web-landscape');
assert.equal(ProtoDockProductDocument.applyDocumentLayout(layoutRoot, 'iphone-portrait'), 'device');
assert.equal(layoutRoot.classList.values.has('is-web-document'), false);

const hierarchy = ProtoDockProductDocument.buildOutlineHierarchy({
  pages: [
    { id: 'home', title: '每日推送/首页' },
    { id: 'default', title: '每日推送 / 默认' },
    { id: 'report', title: '成长报告（日/周报）' },
    { id: 'daily', title: '成长报告 / 日报详情' },
    { id: 'other', title: '独立页面' }
  ]
});
assert.equal(hierarchy.length, 3);
assert.equal(hierarchy[0].type, 'subgroup');
assert.equal(hierarchy[0].title, '每日推送');
assert.deepEqual(hierarchy[0].pages.map((item) => item.label), ['首页', '默认']);
assert.equal(hierarchy[1].title, '成长报告');
assert.deepEqual(hierarchy[1].pages.map((item) => item.label), ['概览（日/周报）', '日报详情']);
assert.equal(hierarchy[2].type, 'page');
assert.equal(hierarchy[2].label, '独立页面');

const viewerUrl = ProtoDockProductDocument.buildViewerUrl(
  '/product-document.html',
  'prd-test',
  'http://localhost:6080/index.html?share=demo#canvas'
);
assert.equal(viewerUrl.origin, 'http://localhost:6080');
assert.equal(viewerUrl.pathname, '/product-document.html');
assert.equal(viewerUrl.searchParams.get('session'), 'prd-test');
assert.equal(viewerUrl.searchParams.get('return'), 'http://localhost:6080/index.html?share=demo#canvas');

const sentMessages = [];
let disposed = false;
const fakeController = {
  ready: Promise.resolve(),
  isClosed: () => false,
  send(action, payload) {
    sentMessages.push({ action, payload });
    return true;
  },
  dispose() {
    disposed = true;
  }
};

(async () => {
  let activeBuilds = 0;
  let maxActiveBuilds = 0;
  const result = await ProtoDockProductDocument.generate({
    viewerUrl: 'http://localhost/product-document.html',
    manifest,
    concurrency: 2,
    openViewer: () => fakeController,
    loadMarkdown: async (page) => `# ${page.title}`,
    loadPrototype: async (page) => ({ prototypeSrc: `http://localhost/${page.entry}` }),
    buildPage: async (page, context) => {
      assert.equal(context.markdown, `# ${page.title}`);
      activeBuilds += 1;
      maxActiveBuilds = Math.max(maxActiveBuilds, activeBuilds);
      await new Promise((resolve) => setTimeout(resolve, 5));
      try {
        if (page.id === 'milk') {
          throw new Error('capture failed');
        }
        return {
          markdown: `# ${page.title}`,
          screenshot: { type: 'png' },
          captureError: '',
          cacheHit: page.id === 'home'
        };
      } finally {
        activeBuilds -= 1;
      }
    }
  });

  assert.deepEqual(result, { total: 4, failed: 1, cached: 1 });
  assert.equal(maxActiveBuilds, 2);
  assert.equal(sentMessages[0].action, 'start');
  assert.deepEqual(sentMessages[0].payload.project.changelog, manifest.changelog);
  assert.equal(sentMessages[0].payload.project.devicePreset, 'iphone-portrait');
  assert.deepEqual(Object.keys(sentMessages[0].payload.navigationManifest.pages), Object.keys(manifest.pages));
  assert.deepEqual(sentMessages[0].payload.navigationManifest.canvas.nodes, manifest.canvas.nodes);
  const pageMessages = sentMessages.filter((message) => message.action === 'page');
  assert.equal(pageMessages.length, 8);
  assert.equal(pageMessages.filter((message) => message.payload.capturePending).length, 4);
  assert.equal(pageMessages.filter((message) => !message.payload.capturePending).length, 4);
  assert.equal(pageMessages.every((message) => message.payload.prototypeSrc?.startsWith('http://localhost/')), true);
  assert.equal(pageMessages.find((message) => message.payload.capturePending).payload.markdown.startsWith('# '), true);
  assert.equal(sentMessages.at(-1).action, 'complete');
  assert.equal(disposed, true);
  console.log('product document view tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
