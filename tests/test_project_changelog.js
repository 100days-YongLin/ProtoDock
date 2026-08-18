const assert = require('node:assert/strict');

require('../project-changelog.js');

const manifest = {
  project: { name: '优儿嘉小程序家长端原型 v1.1' },
  changelog: [],
  pendingChanges: []
};

assert.equal(ProtoDockChangeLog.suggestedVersion(manifest), 'v1.1');
assert.equal(ProtoDockChangeLog.inferredVersion(manifest), 'v1.1');
assert.equal(ProtoDockChangeLog.inferredVersion({ project: { name: '优儿嘉幼师版小程序v1.2' } }), 'v1.2');
assert.deepEqual(ProtoDockChangeLog.normalize(null), []);
assert.deepEqual(ProtoDockChangeLog.normalizePending(null), []);

ProtoDockChangeLog.appendPending(manifest, {
  changedAt: '2026-08-17T08:00:00.000Z',
  description: '补充登录页空状态。'
});
ProtoDockChangeLog.appendPending(manifest, {
  changedAt: '2026-08-17T08:15:00.000Z',
  description: '修复返回流程。'
});

assert.equal(manifest.changelog.length, 0);
assert.equal(manifest.pendingChanges.length, 2);
assert.equal(ProtoDockChangeLog.pendingDescription(manifest), '补充登录页空状态。\n修复返回流程。');

const release = {
  version: 'v1.1',
  changedAt: '2026-08-17T08:30:00.000Z',
  description: ProtoDockChangeLog.pendingDescription(manifest)
};
const snapshot = ProtoDockChangeLog.releaseSnapshot(manifest, release);

assert.equal(manifest.changelog.length, 0);
assert.equal(manifest.pendingChanges.length, 2);
assert.equal(snapshot.manifest.changelog.length, 1);
assert.equal(snapshot.manifest.changelog[0].version, 'v1.1');
assert.equal(snapshot.manifest.pendingChanges.length, 0);

ProtoDockChangeLog.applyRelease(manifest, release);
assert.equal(manifest.pendingChanges.length, 0);
assert.equal(ProtoDockChangeLog.latest(manifest.changelog).version, 'v1.1');
assert.equal(ProtoDockChangeLog.suggestedVersion(manifest), 'v1.1');

ProtoDockChangeLog.appendPending(manifest, {
  changedAt: '2026-08-17T09:00:00.000Z',
  description: '新增待发布修改。'
});
assert.throws(() => ProtoDockChangeLog.releaseSnapshot(manifest, {
  version: 'v1.1',
  changedAt: '2026-08-17T09:30:00.000Z',
  description: '新增待发布修改。'
}), /已发布/);

assert.match(ProtoDockChangeLog.formatDate('2026-08-17T08:30:00.000Z'), /2026/);
assert.throws(() => ProtoDockChangeLog.append(manifest, {
  version: '',
  changedAt: new Date().toISOString(),
  description: '缺少版本号'
}), /不能为空/);
assert.throws(() => ProtoDockChangeLog.appendPending(manifest, {
  changedAt: new Date().toISOString(),
  description: ''
}), /不能为空/);

console.log('project changelog tests passed');
