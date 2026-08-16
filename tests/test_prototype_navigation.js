const assert = require('node:assert/strict');

global.window = global;
require('../prototype-navigation.js');

const manifest = {
  pages: {
    home: { entry: 'pages/home/index.html' },
    reader: { entry: 'pages/reader/index.html' },
    character: { entry: 'pages/reader-character/index.html' },
    record: { entry: 'pages/record/index.html' }
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

const pageHistory = ProtoDockNavigation.createPageHistory(2);
pageHistory.push(0, '?tab=first');
pageHistory.push(1, '');
pageHistory.push(2, '#detail');
assert.equal(pageHistory.size, 2);
assert.deepEqual(pageHistory.pop(), { index: 2, suffix: '#detail' });
assert.deepEqual(pageHistory.pop(), { index: 1, suffix: '' });
assert.equal(pageHistory.pop(), null);
pageHistory.push(0, '');
pageHistory.reset();
assert.equal(pageHistory.size, 0);

assert.equal(ProtoDockNavigation.actionText('点击绘本'), '绘本');
assert.equal(ProtoDockNavigation.routeForLabel(
  ProtoDockNavigation.routesForPage(manifest, 'reader'),
  '查看角色'
), 'character');
assert.equal(ProtoDockNavigation.pageIdForHref(manifest, 'reader', '../reader-character/index.html'), 'character');
assert.equal(ProtoDockNavigation.pageIdForHref(manifest, 'reader', '/pages/reader-character/index'), 'character');
assert.equal(ProtoDockNavigation.pageIdForHref(manifest, 'reader', 'protodock:home'), 'home');
assert.equal(ProtoDockNavigation.pageIdForHref(manifest, 'reader', 'protodock:missing'), null);
assert.deepEqual(
  ProtoDockNavigation.navigationForFrameLocation(
    manifest,
    'reader',
    'http://localhost/pages/record/index.html?type=milk'
  ),
  {
    pageId: 'record',
    url: 'http://localhost/pages/record/index.html?type=milk',
    suffix: '?type=milk'
  }
);
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
assert.deepEqual(ProtoDockNavigation.backActionFromMessage(
  { source: 'frame-window', data: { type: 'protodock:back', fallbackPageId: 'home' } },
  { contentWindow: 'frame-window' },
  manifest
), { fallbackPageId: 'home' });
assert.equal(ProtoDockNavigation.backActionFromMessage(
  { source: 'other-window', data: { type: 'protodock:back' } },
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

const explicitBackControl = {
  textContent: '返回',
  matches() {
    return true;
  },
  hasAttribute(name) {
    return name === 'data-protodock-back';
  },
  getAttribute(name) {
    return name === 'data-protodock-back' ? 'home' : null;
  }
};
assert.equal(ProtoDockNavigation.isBackControl(explicitBackControl), true);
assert.equal(ProtoDockNavigation.backFallbackForControl(manifest, explicitBackControl), 'home');

const legacyBackControl = {
  textContent: '',
  hasAttribute() {
    return false;
  },
  getAttribute(name) {
    return name === 'class' ? 'header-back-button' : (name === 'aria-label' ? '返回' : null);
  }
};
assert.equal(ProtoDockNavigation.isBackControl(legacyBackControl), true);

const legacyControl = {
  tagName: 'BUTTON',
  textContent: '查看角色',
  value: '',
  getAttribute() {
    return null;
  }
};
assert.equal(ProtoDockNavigation.routeForControl(manifest, 'reader', legacyControl), 'character');

const legacyDataPageControl = {
  tagName: 'BUTTON',
  textContent: '精彩瞬间',
  matches() {
    return true;
  },
  getAttribute(name) {
    return name === 'data-page' ? 'home' : null;
  }
};
assert.equal(ProtoDockNavigation.routeForControl(manifest, 'reader', legacyDataPageControl), 'home');

const legacyDataUrlControl = {
  tagName: 'DIV',
  textContent: '查看角色',
  getAttribute(name) {
    return name === 'data-url' ? '/pages/reader-character/index' : null;
  }
};
assert.equal(ProtoDockNavigation.routeForControl(manifest, 'reader', legacyDataUrlControl), 'character');

let frameLoadHandler = null;
let documentClickHandler = null;
let documentClickCapture = false;
let stopped = false;
let prevented = false;
let navigatedPageId = null;
let backedToPageId = undefined;
const originalSetTimeout = global.setTimeout;
global.setTimeout = (callback) => {
  callback();
  return 1;
};

class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

const frameDocument = {
  documentElement: {},
  querySelectorAll() {
    return [];
  },
  addEventListener(type, handler, capture) {
    if (type === 'click') {
      documentClickHandler = handler;
      documentClickCapture = capture;
    }
  }
};
const frame = {
  dataset: {},
  contentDocument: frameDocument,
  contentWindow: { MutationObserver: FakeMutationObserver },
  addEventListener(type, handler) {
    if (type === 'load') {
      frameLoadHandler = handler;
    }
  }
};
ProtoDockNavigation.bindFrame(frame, {
  manifest,
  pageId: 'reader',
  onNavigate(pageId) {
    navigatedPageId = pageId;
  },
  onBack(fallbackPageId) {
    backedToPageId = fallbackPageId;
  }
});
frameLoadHandler();
documentClickHandler({
  button: 0,
  target: legacyDataPageControl,
  composedPath() {
    return [legacyDataPageControl];
  },
  preventDefault() {
    prevented = true;
  },
  stopImmediatePropagation() {
    stopped = true;
  }
});
global.setTimeout = originalSetTimeout;

assert.equal(documentClickCapture, true);
assert.equal(prevented, true);
assert.equal(stopped, true);
assert.equal(navigatedPageId, 'home');
frame.contentWindow.ProtoDockPreview.back('home');
assert.equal(backedToPageId, 'home');
backedToPageId = undefined;
global.setTimeout = (callback) => {
  callback();
  return 1;
};
documentClickHandler({
  button: 0,
  target: explicitBackControl,
  composedPath() {
    return [explicitBackControl];
  },
  preventDefault() {},
  stopImmediatePropagation() {}
});
global.setTimeout = originalSetTimeout;
assert.equal(backedToPageId, 'home');

let recoveredNavigation = null;
const redirectedFrame = {
  dataset: {},
  contentDocument: {
    location: { href: 'http://localhost/pages/record/index.html?type=milk' }
  },
  contentWindow: {},
  addEventListener() {}
};
global.setTimeout = (callback) => {
  callback();
  return 1;
};
ProtoDockNavigation.bindFrame(redirectedFrame, {
  manifest,
  pageId: 'reader',
  onNavigate(pageId, source, navigation) {
    recoveredNavigation = { pageId, source, navigation };
  }
});
global.setTimeout = originalSetTimeout;
assert.deepEqual(recoveredNavigation, {
  pageId: 'record',
  source: 'location',
  navigation: {
    pageId: 'record',
    url: 'http://localhost/pages/record/index.html?type=milk',
    suffix: '?type=milk'
  }
});

console.log('prototype navigation tests passed');
