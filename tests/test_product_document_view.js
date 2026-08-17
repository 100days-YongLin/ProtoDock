const assert = require('node:assert/strict');

global.window = global;
require('../product-document.js');

const manifest = {
  project: { id: 'demo', name: '演示项目' },
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
  const result = await ProtoDockProductDocument.generate({
    viewerUrl: 'http://localhost/product-document.html',
    manifest,
    openViewer: () => fakeController,
    loadMarkdown: async (page) => `# ${page.title}`,
    buildPage: async (page) => {
      if (page.id === 'milk') {
        throw new Error('capture failed');
      }
      return { markdown: `# ${page.title}`, screenshot: { type: 'png' }, captureError: '' };
    }
  });

  assert.deepEqual(result, { total: 4, failed: 1 });
  assert.equal(sentMessages[0].action, 'start');
  assert.equal(sentMessages.filter((message) => message.action === 'page').length, 4);
  assert.equal(sentMessages.at(-1).action, 'complete');
  assert.equal(disposed, true);
  console.log('product document view tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
