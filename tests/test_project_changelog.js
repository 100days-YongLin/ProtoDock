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

const chronologicalEntries = [
  { version: 'v1.0', changedAt: '2026-08-16T08:00:00.000Z', description: '首次发布。' },
  { version: 'v1.1', changedAt: '2026-08-17T08:00:00.000Z', description: '更新流程。' }
];
assert.deepEqual(
  ProtoDockChangeLog.newestFirst(chronologicalEntries).map((entry) => entry.version),
  ['v1.1', 'v1.0']
);
assert.equal(chronologicalEntries[0].version, 'v1.0');

ProtoDockChangeLog.appendPending(manifest, {
  changedAt: '2026-08-17T08:00:00.000Z',
  description: '- 用户：登录失败时可以看到明确提示\n- 产品：补充登录页空状态规则'
});
ProtoDockChangeLog.appendPending(manifest, {
  changedAt: '2026-08-17T08:15:00.000Z',
  description: '- 用户：二级页面可以返回真实来源页\n- 产品：统一返回历史栈与 fallback 规则'
});

assert.equal(manifest.changelog.length, 0);
assert.equal(manifest.pendingChanges.length, 2);
assert.equal(ProtoDockChangeLog.pendingDescription(manifest), [
  '- 用户：登录失败时可以看到明确提示',
  '- 用户：二级页面可以返回真实来源页',
  '- 产品：补充登录页空状态规则',
  '- 产品：统一返回历史栈与 fallback 规则'
].join('\n'));

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
  description: '- 用户：可以查看新增页面\n- 产品：补充新增页面入口'
});
assert.throws(() => ProtoDockChangeLog.releaseSnapshot(manifest, {
  version: 'v1.1',
  changedAt: '2026-08-17T09:30:00.000Z',
  description: '- 用户：可以查看新增页面\n- 产品：补充新增页面入口'
}), /已发布/);

assert.equal(
  ProtoDockChangeLog.formatDescription('可以查看新增页面\n- 返回入口更清晰', '补充页面入口'),
  '- 用户：可以查看新增页面\n- 用户：返回入口更清晰\n- 产品：补充页面入口'
);
assert.equal(ProtoDockChangeLog.validateDescription('- 用户：体验更清晰\n- 产品：统一规则').ok, true);
assert.match(ProtoDockChangeLog.validateDescription('完成本次更新。').message, /项目符号/);
assert.match(ProtoDockChangeLog.validateDescription('- 产品：统一规则\n- 用户：体验更清晰').message, /先写用户视角/);
assert.throws(() => ProtoDockChangeLog.appendPending(manifest, {
  changedAt: new Date().toISOString(),
  description: '一段很长的更新说明。'
}), /项目符号/);

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
