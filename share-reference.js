(function initProtoDockShareReference(global) {
  const RESERVED_COMPONENTS = new Set(['canvas', 'download']);

  function isValidLegacyId(value) {
    return /^[A-Za-z0-9_-]{6,80}$/.test(String(value || ''));
  }

  function isValidBranchComponent(value) {
    const text = String(value || '');
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(text)
      && text.length <= 64
      && !text.endsWith('.')
      && !text.endsWith('.lock')
      && !text.includes('..')
      && !RESERVED_COMPONENTS.has(text.toLowerCase());
  }

  function normalize(value) {
    const parts = String(value || '').split('/').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 1 && isValidLegacyId(parts[0])) {
      return parts[0];
    }
    if (parts.length === 2 && parts.every(isValidBranchComponent)) {
      return parts.join('/');
    }
    return '';
  }

  function branch(productName, version) {
    const reference = `${String(productName || '').trim()}/${String(version || '').trim()}`;
    return normalize(reference);
  }

  function encoded(reference) {
    const normalized = normalize(reference);
    return normalized ? normalized.split('/').map(encodeURIComponent).join('/') : '';
  }

  function sharePath(reference, suffix = '') {
    const path = encoded(reference);
    return path ? `/s/${path}${suffix}` : '';
  }

  function assetBasePath(reference) {
    const path = encoded(reference);
    return path ? `/shares/${path}/` : '';
  }

  function downloadPath(reference) {
    const path = encoded(reference);
    return path ? `/api/shares/${path}/download` : '';
  }

  function decodePathPart(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return null;
    }
  }

  function fromLocation(location = global.location) {
    const queryReference = new URLSearchParams(location?.search || '').get('share');
    const normalizedQuery = normalize(queryReference);
    if (normalizedQuery) {
      return normalizedQuery;
    }
    const parts = String(location?.pathname || '').split('/').filter(Boolean).map(decodePathPart);
    if (parts.some((part) => part === null)) {
      return '';
    }
    if (parts[0] !== 's') {
      return '';
    }
    const referenceParts = parts.slice(1);
    if (referenceParts.at(-1) === 'canvas') {
      referenceParts.pop();
    }
    return normalize(referenceParts.join('/'));
  }

  global.ProtoDockShareReference = Object.freeze({
    assetBasePath,
    branch,
    downloadPath,
    encoded,
    fromLocation,
    isValidBranchComponent,
    isValidLegacyId,
    normalize,
    sharePath
  });
})(typeof window !== 'undefined' ? window : globalThis);
