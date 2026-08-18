const assert = require('node:assert/strict');

require('../project-notifications.js');

const notifications = globalThis.ProtoDockProjectNotifications;
const webhook = 'https://open.feishu.cn/open-apis/bot/v2/hook/11111111-2222-3333-4444-555555555555';

assert.equal(notifications.normalizeWebhook(` ${webhook} `), webhook);
assert.throws(
  () => notifications.normalizeWebhook('https://open.feishu.cn.evil.example/open-apis/bot/v2/hook/11111111-2222-3333-4444-555555555555'),
  /完整 Webhook/
);
assert.throws(() => notifications.normalizeWebhook(`${webhook}?redirect=1`), /完整 Webhook/);

const source = JSON.stringify({ theme: 'dark', notifications: { anotherChannel: { enabled: true } } });
const updated = notifications.withWebhook(source, webhook);
assert.equal(notifications.webhookFromText(updated), webhook);
assert.equal(JSON.parse(updated).theme, 'dark');
assert.equal(JSON.parse(updated).notifications.anotherChannel.enabled, true);

const removed = notifications.withWebhook(updated, '');
assert.equal(notifications.webhookFromText(removed), '');
assert.equal(JSON.parse(removed).notifications.anotherChannel.enabled, true);

console.log('project notification settings tests passed');
