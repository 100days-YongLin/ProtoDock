const assert = require('node:assert/strict');

require('../share-reference.js');
require('../publish-targets.js');

const targets = globalThis.ProtoDockPublishTargets;

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
