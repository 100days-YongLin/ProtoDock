(() => {
  const DESCRIPTION_LINE = /^-\s*(用户|产品)\s*：\s*(.+)$/;
  const MAX_DESCRIPTION_ITEMS = 8;
  const MAX_ITEM_LENGTH = 80;

  function text(value) {
    return String(value ?? '').trim();
  }

  function descriptionItems(value) {
    return text(value)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const matched = line.match(DESCRIPTION_LINE);
        return matched ? { audience: matched[1], content: matched[2].trim() } : null;
      });
  }

  function validateDescription(value) {
    const lines = text(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const items = descriptionItems(value);
    if (!lines.length) {
      return { ok: false, message: '更新内容不能为空' };
    }
    if (items.some((item) => !item)) {
      return { ok: false, message: '更新内容每行必须使用“用户”或“产品”项目符号' };
    }
    if (items.length > MAX_DESCRIPTION_ITEMS) {
      return { ok: false, message: `更新内容最多 ${MAX_DESCRIPTION_ITEMS} 项，请合并精简` };
    }
    if (items.some((item) => item.content.length > MAX_ITEM_LENGTH)) {
      return { ok: false, message: `每项更新内容不能超过 ${MAX_ITEM_LENGTH} 字` };
    }
    const firstProductIndex = items.findIndex((item) => item.audience === '产品');
    const lastUserIndex = items.findLastIndex((item) => item.audience === '用户');
    if (lastUserIndex < 0 || firstProductIndex < 0) {
      return { ok: false, message: '更新内容必须同时包含用户视角和产品视角' };
    }
    if (firstProductIndex < lastUserIndex) {
      return { ok: false, message: '请先写用户视角，再写产品视角' };
    }
    return { ok: true, message: '', items };
  }

  function formatDescription(userItems, productItems) {
    const linesFor = (items, audience) => String(items || '')
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^[-*•]\s*/, ''))
      .filter(Boolean)
      .map((line) => `- ${audience}：${line}`);
    return [...linesFor(userItems, '用户'), ...linesFor(productItems, '产品')].join('\n');
  }

  function requireDescription(value) {
    const validation = validateDescription(value);
    if (!validation.ok) {
      throw new Error(validation.message);
    }
  }

  function normalize(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        version: text(entry.version),
        changedAt: text(entry.changedAt),
        description: text(entry.description)
      }))
      .filter((entry) => entry.version || entry.changedAt || entry.description);
  }

  function latest(entries) {
    const normalized = normalize(entries);
    return normalized[normalized.length - 1] || null;
  }

  function newestFirst(entries) {
    return normalize(entries).reverse();
  }

  function normalizePending(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        changedAt: text(entry.changedAt),
        description: text(entry.description)
      }))
      .filter((entry) => entry.changedAt || entry.description);
  }

  function inferredVersion(manifest) {
    const projectName = text(manifest?.project?.name);
    const tagged = projectName.match(/(v\d+(?:\.\d+){1,3})\s*$/i);
    const plain = projectName.match(/(?:^|\s)(\d+(?:\.\d+){1,3})\s*$/);
    return tagged?.[1] || plain?.[1] || '';
  }

  function suggestedVersion(manifest) {
    const current = latest(manifest?.changelog);
    return current?.version || inferredVersion(manifest) || 'v1.0';
  }

  function append(manifest, entry) {
    const next = {
      version: text(entry?.version),
      changedAt: text(entry?.changedAt),
      description: text(entry?.description)
    };
    if (!next.version || !next.changedAt || !next.description) {
      throw new Error('版本号、变更时间和变更内容均不能为空');
    }
    if (Number.isNaN(Date.parse(next.changedAt))) {
      throw new Error('变更时间必须是有效日期');
    }
    requireDescription(next.description);
    manifest.changelog = [...normalize(manifest.changelog), next];
    return next;
  }

  function appendPending(manifest, entry) {
    const next = {
      changedAt: text(entry?.changedAt),
      description: text(entry?.description)
    };
    if (!next.changedAt || !next.description) {
      throw new Error('变更时间和变更内容均不能为空');
    }
    if (Number.isNaN(Date.parse(next.changedAt))) {
      throw new Error('变更时间必须是有效日期');
    }
    requireDescription(next.description);
    manifest.pendingChanges = [...normalizePending(manifest.pendingChanges), next];
    return next;
  }

  function pendingDescription(manifest) {
    const descriptions = normalizePending(manifest?.pendingChanges).map((entry) => entry.description).filter(Boolean);
    const parsed = descriptions.map((description) => validateDescription(description));
    if (!parsed.length || parsed.some((result) => !result.ok)) {
      return descriptions.join('\n');
    }
    const unique = (items) => [...new Set(items.map((item) => item.content))];
    const allItems = parsed.flatMap((result) => result.items);
    return formatDescription(
      unique(allItems.filter((item) => item.audience === '用户')).join('\n'),
      unique(allItems.filter((item) => item.audience === '产品')).join('\n')
    );
  }

  function releaseSnapshot(manifest, release) {
    const snapshot = structuredClone(manifest || {});
    const version = text(release?.version);
    const changedAt = text(release?.changedAt);
    const description = text(release?.description) || pendingDescription(snapshot);
    const pending = normalizePending(snapshot.pendingChanges);
    const current = latest(snapshot.changelog);

    if (!version || !changedAt || !description) {
      throw new Error('发布版本、发布时间和更新内容均不能为空');
    }
    if (description.length > 1200) {
      throw new Error('发布更新内容不能超过 1200 字，请在发布前合并精简');
    }
    requireDescription(description);
    if (Number.isNaN(Date.parse(changedAt))) {
      throw new Error('发布时间必须是有效日期');
    }
    if (current?.version === version) {
      if (pending.length) {
        throw new Error(`版本 ${version} 已发布；当前有待发布变更，请填写新的发布版本`);
      }
      return { manifest: snapshot, entry: current, changed: false };
    }

    const entry = { version, changedAt, description };
    snapshot.changelog = [...normalize(snapshot.changelog), entry];
    snapshot.pendingChanges = [];
    return { manifest: snapshot, entry, changed: true };
  }

  function applyRelease(manifest, release) {
    const result = releaseSnapshot(manifest, release);
    manifest.changelog = result.manifest.changelog;
    manifest.pendingChanges = result.manifest.pendingChanges;
    return result;
  }

  function formatDate(value, locale = 'zh-CN') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return text(value) || '时间未记录';
    }
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(date);
  }

  globalThis.ProtoDockChangeLog = {
    normalize,
    normalizePending,
    latest,
    newestFirst,
    inferredVersion,
    suggestedVersion,
    append,
    appendPending,
    pendingDescription,
    releaseSnapshot,
    applyRelease,
    formatDate,
    descriptionItems,
    validateDescription,
    formatDescription
  };
})();
