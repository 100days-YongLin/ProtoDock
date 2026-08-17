const assert = require('node:assert/strict');

require('../share-reference.js');

const reference = globalThis.ProtoDockShareReference;

assert.equal(reference.branch('pictale', 'v1'), 'pictale/v1');
assert.equal(reference.sharePath('pictale/v1'), '/s/pictale/v1');
assert.equal(reference.sharePath('pictale/v1', '/canvas'), '/s/pictale/v1/canvas');
assert.equal(reference.assetBasePath('pictale/v1'), '/shares/pictale/v1/');
assert.equal(reference.downloadPath('pictale/v1'), '/api/shares/pictale/v1/download');
assert.equal(reference.pdfPath('pictale/v1'), '/api/shares/pictale/v1/pdf');
assert.equal(reference.pdfPath('pictale/v1', '/status'), '/api/shares/pictale/v1/pdf/status');
assert.equal(reference.normalize('legacy_123'), 'legacy_123');
assert.equal(reference.normalize('pictale/canvas'), '');
assert.equal(reference.normalize('pictale/latest'), '');
assert.equal(reference.fromLocation({ pathname: '/s/pictale/v1', search: '' }), 'pictale/v1');
assert.equal(reference.fromLocation({ pathname: '/s/pictale/v1/canvas', search: '' }), 'pictale/v1');
assert.equal(reference.fromLocation({ pathname: '/index.html', search: '?share=pictale%2Fv1' }), 'pictale/v1');
assert.equal(reference.fromLocation({ pathname: '/s/legacy_123/canvas', search: '' }), 'legacy_123');
assert.equal(reference.fromLocation({ pathname: '/s/pictale/%ZZ', search: '' }), '');

console.log('share reference tests passed');
