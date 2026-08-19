(function initProtoDockPublishTargets(global) {
  function previousVersion(options = {}) {
    const candidates = [
      options.lastPublishedVersion,
      options.savedVersion,
      options.inferredVersion
    ];
    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (value) {
        return value;
      }
    }
    return '';
  }

  function build(options = {}) {
    const product = String(options.product || '').trim();
    const version = String(options.version || '').trim();
    const reference = global.ProtoDockShareReference?.branch?.(product, version) || '';
    if (!reference) {
      return {
        reference: '',
        currentPath: '',
        latestPath: '',
        branch: '',
        tag: ''
      };
    }
    const encodedProduct = encodeURIComponent(product);
    return {
      reference,
      currentPath: global.ProtoDockShareReference.sharePath(reference),
      latestPath: `/s/${encodedProduct}/latest`,
      branch: `project/${product}`,
      tag: `release/${product}/${version}`
    };
  }

  global.ProtoDockPublishTargets = Object.freeze({ build, previousVersion });
})(typeof window !== 'undefined' ? window : globalThis);
