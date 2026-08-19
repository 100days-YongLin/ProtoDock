(() => {
  const LEGACY_DESCRIPTION_LINE = /^-\s*(用户|产品)\s*：\s*(.+)$/;
  const SECTION_LINE = /^(用户体验|产品调整|前后端逻辑)\s*：$/;
  const BULLET_LINE = /^-\s*(.+)$/;
  const SECTION_ORDER = ['用户体验', '产品调整', '前后端逻辑'];
  const LEGACY_SECTION = { 用户: '用户体验', 产品: '产品调整' };
  const MAX_DESCRIPTION_ITEMS = 8;
  const MAX_ITEM_LENGTH = 80;

  function text(value) {
    return String(value ?? '').trim();
  }

  function descriptionItems(value) {
    const lines = text(value)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const legacyMatches = lines.map((line) => line.match(LEGACY_DESCRIPTION_LINE));
    if (legacyMatches.every(Boolean)) {
      return legacyMatches.map((matched) => ({
        audience: LEGACY_SECTION[matched[1]],
        content: matched[2].trim()
      }));
    }

    let audience = '';
    return lines.flatMap((line) => {
      const section = line.match(SECTION_LINE);
      if (section) {
        audience = section[1];
        return [];
      }
      const bullet = line.match(BULLET_LINE);
      return bullet && audience ? [{ audience, content: bullet[1].trim() }] : [null];
    });
  }

  function validateDescription(value) {
    const lines = text(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const items = descriptionItems(value);
    if (!lines.length) {
      return { ok: false, message: '更新内容不能为空' };
    }
    const legacyMatches = lines.map((line) => line.match(LEGACY_DESCRIPTION_LINE));
    const isLegacy = legacyMatches.every(Boolean);
    const headings = lines.filter((line) => SECTION_LINE.test(line)).map((line) => line.match(SECTION_LINE)[1]);
    if (items.some((item) => !item)) {
      return { ok: false, message: '请按“用户体验 / 产品调整 / 前后端逻辑”分栏，并在栏目下使用短项目符号' };
    }
    if (!isLegacy) {
      if (!headings.length || headings.some((heading, index) => headings.indexOf(heading) !== index)) {
        return { ok: false, message: '每个更新栏目只能出现一次' };
      }
      const headingIndexes = headings.map((heading) => SECTION_ORDER.indexOf(heading));
      if (headingIndexes.some((value, index) => index > 0 && value <= headingIndexes[index - 1])) {
        return { ok: false, message: '请依次填写用户体验、产品调整、前后端逻辑' };
      }
      if (headings.some((heading) => !items.some((item) => item?.audience === heading))) {
        return { ok: false, message: '已填写的更新栏目至少需要一条内容' };
      }
    }
    if (items.length > MAX_DESCRIPTION_ITEMS) {
      return { ok: false, message: `更新内容最多 ${MAX_DESCRIPTION_ITEMS} 项，请合并精简` };
    }
    if (items.some((item) => item.content.length > MAX_ITEM_LENGTH)) {
      return { ok: false, message: `每项更新内容不能超过 ${MAX_ITEM_LENGTH} 字` };
    }
    const audiences = items.map((item) => item.audience);
    if (!audiences.includes('用户体验') || !audiences.includes('产品调整')) {
      return { ok: false, message: '更新内容必须同时包含用户体验和产品调整' };
    }
    const audienceIndexes = audiences.map((audience) => SECTION_ORDER.indexOf(audience));
    if (audienceIndexes.some((value, index) => index > 0 && value < audienceIndexes[index - 1])) {
      return { ok: false, message: '请依次填写用户体验、产品调整、前后端逻辑' };
    }
    return { ok: true, message: '', items, format: isLegacy ? 'legacy' : 'sections' };
  }

  function formatDescription(userItems, productItems, technicalItems = '') {
    const linesFor = (items, audience) => {
      const bullets = String(items || '')
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^[-*•]\s*/, '').replace(/^(?:用户|产品)\s*：\s*/, ''))
      .filter(Boolean);
      return bullets.length ? [`${audience}：`, ...bullets.map((line) => `- ${line}`)] : [];
    };
    return [
      ...linesFor(userItems, '用户体验'),
      ...linesFor(productItems, '产品调整'),
      ...linesFor(technicalItems, '前后端逻辑')
    ].join('\n');
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
      unique(allItems.filter((item) => item.audience === '用户体验')).join('\n'),
      unique(allItems.filter((item) => item.audience === '产品调整')).join('\n'),
      unique(allItems.filter((item) => item.audience === '前后端逻辑')).join('\n')
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
