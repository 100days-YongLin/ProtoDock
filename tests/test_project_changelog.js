const assert = require('node:assert/strict');

require('../project-changelog.js');

const manifest = {
  project: { name: '优儿嘉小程序家长端原型 v1.1' },
  changelog: []
};

assert.equal(ProtoDockChangeLog.suggestedVersion(manifest), 'v1.1');
assert.equal(ProtoDockChangeLog.inferredVersion(manifest), 'v1.1');
assert.equal(ProtoDockChangeLog.inferredVersion({ project: { name: '优儿嘉幼师版小程序v1.2' } }), 'v1.2');
assert.deepEqual(ProtoDockChangeLog.normalize(null), []);

ProtoDockChangeLog.append(manifest, {
  version: 'v1.1',
  changedAt: '2026-08-17T08:30:00.000Z',
  description: '补充产品文档变更历史。'
});

assert.equal(ProtoDockChangeLog.latest(manifest.changelog).version, 'v1.1');
assert.equal(ProtoDockChangeLog.suggestedVersion(manifest), 'v1.1');
assert.match(ProtoDockChangeLog.formatDate('2026-08-17T08:30:00.000Z'), /2026/);
assert.throws(() => ProtoDockChangeLog.append(manifest, {
  version: '',
  changedAt: new Date().toISOString(),
  description: '缺少版本号'
}), /不能为空/);

console.log('project changelog tests passed');
