const assert = require('node:assert/strict');

require('../publish-summary.js');

const summary = globalThis.ProtoDockPublishSummary;

assert.equal(summary.build({
  projectName: 'PicTale 家长端',
  version: 'v1.1',
  updateContent: '补充成长报告与返回流程。',
  shareUrl: 'https://example.com/s/pictale/v1.1',
  branchUrl: 'https://github.com/example/prototypes/tree/pictale/v1.1'
}), [
  'PicTale 家长端 v1.1 已更新',
  '',
  '更新内容：',
  '补充成长报告与返回流程。',
  '',
  '公开预览：https://example.com/s/pictale/v1.1',
  'GitHub 分支：https://github.com/example/prototypes/tree/pictale/v1.1'
].join('\n'));

assert.equal(summary.build({
  projectName: 'PicTale',
  version: 'v2',
  updateContent: '仅更新公开预览。',
  shareUrl: 'https://example.com/s/pictale/v2'
}).includes('GitHub 分支：'), false);

console.log('publish summary tests passed');
