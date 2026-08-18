const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(require.resolve('../local-preview-assets.js'), 'utf8');
const context = { window: { setTimeout() {} } };
vm.runInNewContext(source, context);

const { isLocalReference, srcsetCandidates } = context.window.ProtoDockLocalPreviewAssets;

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

console.log('local preview asset tests passed');
