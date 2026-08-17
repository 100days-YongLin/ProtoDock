(() => {
  function text(value) {
    return String(value ?? '').trim();
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
    manifest.changelog = [...normalize(manifest.changelog), next];
    return next;
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
    latest,
    inferredVersion,
    suggestedVersion,
    append,
    formatDate
  };
})();
