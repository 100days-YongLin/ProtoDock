const assert = require('node:assert/strict');

global.window = global;
require('../prototype-navigation.js');

const manifest = {
  pages: {
    home: { entry: 'pages/home/index.html' },
    reader: { entry: 'pages/reader/index.html' },
    character: { entry: 'pages/reader-character/index.html' }
  },
  canvas: {
    nodes: [
      { id: 'node-home', pageId: 'home' },
      { id: 'node-reader', pageId: 'reader' },
      { id: 'node-character', pageId: 'character' }
    ],
    edges: [
      { id: 'edge-home-reader', from: 'node-home', to: 'node-reader', label: '点击绘本' },
      { id: 'edge-reader-character', from: 'node-reader', to: 'node-character', label: '查看角色' }
    ]
  }
};

assert.equal(ProtoDockNavigation.actionText('点击绘本'), '绘本');
assert.equal(ProtoDockNavigation.routeForLabel(
  ProtoDockNavigation.routesForPage(manifest, 'reader'),
  '查看角色'
), 'character');
assert.equal(ProtoDockNavigation.pageIdForHref(manifest, 'reader', '../reader-character/index.html'), 'character');
assert.equal(ProtoDockNavigation.pageIdForHref(manifest, 'reader', 'protodock:home'), 'home');
assert.equal(ProtoDockNavigation.pageIdForHref(manifest, 'reader', 'protodock:missing'), null);
assert.equal(ProtoDockNavigation.pageIdFromMessage(
  { source: 'frame-window', data: { type: 'protodock:navigate', pageId: 'reader' } },
  { contentWindow: 'frame-window' },
  manifest
), 'reader');
assert.equal(ProtoDockNavigation.pageIdFromMessage(
  { source: 'other-window', data: { type: 'protodock:navigate', pageId: 'reader' } },
  { contentWindow: 'frame-window' },
  manifest
), null);

const explicitControl = {
  tagName: 'BUTTON',
  textContent: '随便写的按钮',
  value: '',
  getAttribute(name) {
    return name === 'data-protodock-page' ? 'home' : null;
  }
};
assert.equal(ProtoDockNavigation.routeForControl(manifest, 'reader', explicitControl), 'home');

const legacyControl = {
  tagName: 'BUTTON',
  textContent: '查看角色',
  value: '',
  getAttribute() {
    return null;
  }
};
assert.equal(ProtoDockNavigation.routeForControl(manifest, 'reader', legacyControl), 'character');

console.log('prototype navigation tests passed');
