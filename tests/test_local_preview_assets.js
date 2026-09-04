const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(require.resolve('../local-preview-assets.js'), 'utf8');
const context = { URL, window: { setTimeout() {} } };
vm.runInNewContext(source, context);

const {
  documentBaseDirectory,
  isLocalReference,
  previewRuntimeStatus,
  srcsetCandidates
} = context.window.ProtoDockLocalPreviewAssets;

assert.equal(isLocalReference('../../assets/photo.png'), true);
assert.equal(isLocalReference('/assets/photo.png'), true);
assert.equal(isLocalReference('https://example.com/photo.png'), false);
assert.equal(isLocalReference('data:image/png;base64,abc'), false);
assert.equal(isLocalReference('blob:https://example.com/id'), false);
assert.deepEqual(
  JSON.parse(JSON.stringify(srcsetCandidates('./small.png 1x, ./large.png 2x'))),
  [
    { url: './small.png', descriptor: ' 1x' },
    { url: './large.png', descriptor: ' 2x' }
  ]
);
assert.deepEqual(JSON.parse(JSON.stringify(srcsetCandidates('data:image/png;base64,abc 1x'))), []);
assert.equal(
  documentBaseDirectory('pages/home/index.html', '../_wechat-runtime/'),
  'pages/_wechat-runtime'
);
assert.equal(
  documentBaseDirectory('pages/home/index.html', './runtime/shell.html'),
  'pages/home/runtime'
);
assert.equal(
  documentBaseDirectory('pages/home/index.html', 'https://example.com/runtime/'),
  'pages/home'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(previewRuntimeStatus({ body: {} }, {}))),
  { required: false, ready: true, reason: '' }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(previewRuntimeStatus({ body: {}, querySelector() { return null; } }, {
    __PROTODOCK_WECHAT__: { route: 'pages/home/index' }
  }))),
  { required: true, ready: false, reason: 'wechat-runtime-not-mounted' }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(previewRuntimeStatus({
    body: {},
    querySelector(selector) {
      assert.equal(selector, 'glass-easel-root, wx-glass-easel-root');
      return {};
    }
  }, {
    __PROTODOCK_WECHAT__: { route: 'pages/home/index' },
    __PROTODOCK_WECHAT_ROOT__: {}
  }))),
  { required: true, ready: true, reason: '' }
);

console.log('local preview asset tests passed');
