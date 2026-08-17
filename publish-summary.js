(function initProtoDockPublishSummary(global) {
  function clean(value) {
    return String(value || '').trim();
  }

  function build(options = {}) {
    const projectName = clean(options.projectName) || '原型项目';
    const version = clean(options.version);
    const updateContent = clean(options.updateContent) || '完成本次原型更新。';
    const shareUrl = clean(options.shareUrl);
    const branchUrl = clean(options.branchUrl);
    const title = [projectName, version].filter(Boolean).join(' ');
    const lines = [
      `${title} 已更新`,
      '',
      '更新内容：',
      updateContent
    ];
    if (shareUrl) {
      lines.push('', `公开预览：${shareUrl}`);
    }
    if (branchUrl) {
      lines.push(`GitHub 分支：${branchUrl}`);
    }
    return lines.join('\n');
  }

  global.ProtoDockPublishSummary = Object.freeze({ build });
})(typeof window !== 'undefined' ? window : globalThis);
