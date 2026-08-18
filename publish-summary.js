(function initProtoDockPublishSummary(global) {
  function clean(value) {
    return String(value || '').trim();
  }

  function build(options = {}) {
    const projectName = clean(options.projectName) || '原型项目';
    const version = clean(options.version);
    const updateContent = clean(options.updateContent) || '完成本次原型更新。';
    const shareUrl = clean(options.shareUrl);
    const latestShareUrl = clean(options.latestShareUrl);
    const branchUrl = clean(options.branchUrl);
    const tagUrl = clean(options.tagUrl);
    const title = [projectName, version].filter(Boolean).join(' ');
    const lines = [
      `${title} 已更新`,
      '',
      '更新内容：',
      updateContent
    ];
    if (shareUrl) {
      lines.push('', `当前版本PRD入口：${shareUrl}`);
    }
    if (latestShareUrl) {
      lines.push(`持续最新版PRD入口：${latestShareUrl}`);
    }
    if (tagUrl) {
      lines.push(`原型 GitHub 当前版本：${tagUrl}`);
    }
    if (branchUrl) {
      lines.push(`${tagUrl ? '原型 GitHub 持续最新版' : '原型 GitHub 分支'}：${branchUrl}`);
    }
    return lines.join('\n');
  }

  global.ProtoDockPublishSummary = Object.freeze({ build });
})(typeof window !== 'undefined' ? window : globalThis);
