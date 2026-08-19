const assert = require('node:assert/strict');

require('../share-reference.js');
require('../publish-targets.js');

const targets = globalThis.ProtoDockPublishTargets;

assert.equal(targets.previousVersion({
  lastPublishedVersion: 'v1.1-version7',
  savedVersion: 'v1.1-version6',
  inferredVersion: 'v1.1'
}), 'v1.1-version7');
assert.equal(targets.previousVersion({
  savedVersion: 'v1.1-version6',
  inferredVersion: 'v1.1'
}), 'v1.1-version6');
assert.equal(targets.previousVersion({ inferredVersion: 'v1.1' }), 'v1.1');
assert.equal(targets.previousVersion({}), '');

assert.deepEqual(targets.build({
  product: 'highlight-moment-campus',
  version: 'v1.1-version7'
}), {
  reference: 'highlight-moment-campus/v1.1-version7',
  currentPath: '/s/highlight-moment-campus/v1.1-version7',
  latestPath: '/s/highlight-moment-campus/latest',
  branch: 'project/highlight-moment-campus',
  tag: 'release/highlight-moment-campus/v1.1-version7'
});

assert.deepEqual(targets.build({ product: 'bad/product', version: 'v1' }), {
  reference: '',
  currentPath: '',
  latestPath: '',
  branch: '',
  tag: ''
});

console.log('publish target tests passed');
