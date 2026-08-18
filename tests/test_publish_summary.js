const assert = require('node:assert/strict');

require('../publish-summary.js');

const summary = globalThis.ProtoDockPublishSummary;

assert.equal(summary.build({
  projectName: 'PicTale 家长端',
  version: 'v1.1',
  updateContent: '补充成长报告与返回流程。',
  shareUrl: 'https://example.com/s/pictale/v1.1',
  latestShareUrl: 'https://example.com/s/pictale/latest',
  branchUrl: 'https://github.com/example/prototypes/tree/pictale/v1.1'
}), [
  'PicTale 家长端 v1.1 已更新',
  '',
  '更新内容：',
  '补充成长报告与返回流程。',
  '',
  '当前版本PRD入口：https://example.com/s/pictale/v1.1',
  '持续最新版PRD入口：https://example.com/s/pictale/latest',
  '原型 GitHub 分支：https://github.com/example/prototypes/tree/pictale/v1.1'
].join('\n'));

assert.equal(summary.build({
  projectName: 'PicTale',
  version: 'v2',
  updateContent: '仅更新公开预览。',
  shareUrl: 'https://example.com/s/pictale/v2'
}).includes('原型 GitHub 分支：'), false);

assert.equal(summary.build({
  projectName: '优儿嘉幼师版小程序v1.1',
  version: 'v1.1-version7',
  updateContent: '全量校正每日推送、周报日程、宝宝资料与请假状态逻辑，并补强必填校验、空候选推送、编辑保存和 ProtoDock 静态产物校验。',
  shareUrl: 'https://uurpvbrkemht.sealoshzh.site/s/highlight-moment-campus/v1.1-version7',
  latestShareUrl: 'https://uurpvbrkemht.sealoshzh.site/s/highlight-moment-campus/latest',
  branchUrl: 'https://github.com/hzcxai/prototypes/tree/highlight-moment-campus/v1.1-version7'
}), [
  '优儿嘉幼师版小程序v1.1 v1.1-version7 已更新',
  '',
  '更新内容：',
  '全量校正每日推送、周报日程、宝宝资料与请假状态逻辑，并补强必填校验、空候选推送、编辑保存和 ProtoDock 静态产物校验。',
  '',
  '当前版本PRD入口：https://uurpvbrkemht.sealoshzh.site/s/highlight-moment-campus/v1.1-version7',
  '持续最新版PRD入口：https://uurpvbrkemht.sealoshzh.site/s/highlight-moment-campus/latest',
  '原型 GitHub 分支：https://github.com/hzcxai/prototypes/tree/highlight-moment-campus/v1.1-version7'
].join('\n'));

console.log('publish summary tests passed');
