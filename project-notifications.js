(function initProtoDockProjectNotifications(global) {
  const FILE_NAME = 'protodock.local.json';
  const FEISHU_HOST = 'open.feishu.cn';
  const FEISHU_HOOK_PATH = /^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]{20,128}$/;

  function normalizeWebhook(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '';
    }
    let url;
    try {
      url = new URL(text);
    } catch (error) {
      throw new Error('Webhook 链接格式不正确');
    }
    if (
      url.protocol !== 'https:'
      || url.hostname !== FEISHU_HOST
      || url.port
      || url.username
      || url.password
      || url.search
      || url.hash
      || !FEISHU_HOOK_PATH.test(url.pathname)
    ) {
      throw new Error('请填写飞书自定义机器人的完整 Webhook 链接');
    }
    return url.toString();
  }

  function parseObject(text) {
    if (!String(text || '').trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      throw new Error(`${FILE_NAME} 不是有效的 JSON`);
    }
  }

  function webhookFromText(text) {
    const settings = parseObject(text);
    const value = settings.notifications?.feishuBot?.webhook || '';
    return normalizeWebhook(value);
  }

  function withWebhook(text, webhook) {
    const settings = parseObject(text);
    const normalized = normalizeWebhook(webhook);
    const notifications = settings.notifications && typeof settings.notifications === 'object'
      ? { ...settings.notifications }
      : {};
    const feishuBot = notifications.feishuBot && typeof notifications.feishuBot === 'object'
      ? { ...notifications.feishuBot }
      : {};

    if (normalized) {
      feishuBot.webhook = normalized;
      notifications.feishuBot = feishuBot;
      settings.notifications = notifications;
    } else {
      delete feishuBot.webhook;
      if (Object.keys(feishuBot).length) {
        notifications.feishuBot = feishuBot;
      } else {
        delete notifications.feishuBot;
      }
      if (Object.keys(notifications).length) {
        settings.notifications = notifications;
      } else {
        delete settings.notifications;
      }
    }
    return `${JSON.stringify(settings, null, 2)}\n`;
  }

  global.ProtoDockProjectNotifications = Object.freeze({
    fileName: FILE_NAME,
    normalizeWebhook,
    webhookFromText,
    withWebhook
  });
})(typeof window !== 'undefined' ? window : globalThis);
