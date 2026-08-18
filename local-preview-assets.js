(function initProtoDockLocalPreviewAssets(global) {
  const ATTRIBUTE_SELECTORS = [
    ['audio[src]', 'src'],
    ['embed[src]', 'src'],
    ['iframe[src]', 'src'],
    ['img[src]', 'src'],
    ['input[type="image"][src]', 'src'],
    ['link[href]', 'href'],
    ['object[data]', 'data'],
    ['script[src]', 'src'],
    ['source[src]', 'src'],
    ['track[src]', 'src'],
    ['video[src]', 'src'],
    ['video[poster]', 'poster'],
    ['image[href]', 'href'],
    ['image[xlink\\:href]', 'xlink:href']
  ];
  const pendingValues = new WeakMap();

  function reserve(element, key, value) {
    const pending = pendingValues.get(element) || new Map();
    if (pending.get(key) === value) {
      return false;
    }
    pending.set(key, value);
    pendingValues.set(element, pending);
    return true;
  }

  function release(element, key, value) {
    const pending = pendingValues.get(element);
    if (pending?.get(key) === value) {
      pending.delete(key);
    }
  }

  function isLocalReference(value) {
    const reference = String(value || '').trim();
    return !!reference
      && !reference.startsWith('#')
      && !reference.startsWith('//')
      && !/^[a-z][a-z0-9+.-]*:/i.test(reference);
  }

  function srcsetCandidates(value) {
    const source = String(value || '').trim();
    if (!source || source.toLowerCase().startsWith('data:')) {
      return [];
    }
    return source.split(',').map((candidate) => {
      const match = candidate.trim().match(/^(\S+)(\s+.+)?$/);
      return match ? { url: match[1], descriptor: match[2] || '' } : null;
    }).filter(Boolean);
  }

  async function replaceAttribute(element, attribute, value, options) {
    if (!isLocalReference(value) || !reserve(element, attribute, value)) {
      return;
    }
    try {
      const resolved = await options.resolveAttribute(element, attribute, value);
      if (resolved && element.getAttribute(attribute) === value) {
        element.setAttribute(attribute, resolved);
      }
    } finally {
      release(element, attribute, value);
    }
  }

  async function replaceSrcset(element, attribute, options) {
    const original = element.getAttribute(attribute) || '';
    const candidates = srcsetCandidates(original);
    if (!candidates.length || !reserve(element, attribute, original)) {
      return;
    }
    try {
      const rewritten = await Promise.all(candidates.map(async (candidate) => {
        if (!isLocalReference(candidate.url)) {
          return `${candidate.url}${candidate.descriptor}`;
        }
        const resolved = await options.resolveAttribute(element, attribute, candidate.url);
        return `${resolved || candidate.url}${candidate.descriptor}`;
      }));
      if (element.getAttribute(attribute) === original) {
        element.setAttribute(attribute, rewritten.join(', '));
      }
    } finally {
      release(element, attribute, original);
    }
  }

  async function processElement(element, options) {
    if (!element?.matches) {
      return;
    }
    const jobs = [];
    for (const [selector, attribute] of ATTRIBUTE_SELECTORS) {
      if (element.matches(selector)) {
        const value = element.getAttribute(attribute) || '';
        jobs.push(replaceAttribute(element, attribute, value, options));
      }
    }
    for (const attribute of ['srcset', 'imagesrcset']) {
      if (element.hasAttribute(attribute)) {
        jobs.push(replaceSrcset(element, attribute, options));
      }
    }
    if (element.hasAttribute('style')) {
      const original = element.getAttribute('style') || '';
      jobs.push(options.rewriteCss(original).then((rewritten) => {
        if (rewritten && rewritten !== original && element.getAttribute('style') === original) {
          element.setAttribute('style', rewritten);
        }
      }));
    }
    if (element.tagName?.toLowerCase() === 'style') {
      const original = element.textContent || '';
      jobs.push(options.rewriteCss(original).then((rewritten) => {
        if (rewritten && rewritten !== original && element.textContent === original) {
          element.textContent = rewritten;
        }
      }));
    }
    await Promise.all(jobs);
  }

  function elementsIn(root) {
    if (!root) {
      return [];
    }
    const selector = [
      ...ATTRIBUTE_SELECTORS.map(([item]) => item),
      '[srcset]',
      '[imagesrcset]',
      '[style]',
      'style'
    ].join(',');
    return [
      ...(root.matches?.(selector) ? [root] : []),
      ...(root.querySelectorAll?.(selector) || [])
    ];
  }

  function bindFrame(frame, options) {
    const install = () => {
      const documentRef = frame.contentDocument;
      const frameWindow = frame.contentWindow;
      if (!documentRef || !frameWindow || documentRef.__protoDockLocalAssets) {
        return;
      }
      const processRoot = (root) => Promise.all(elementsIn(root).map((element) => processElement(element, options)));
      const observer = new frameWindow.MutationObserver((records) => {
        records.forEach((record) => {
          if (record.type === 'attributes') {
            processElement(record.target, options).catch(options.onError);
          }
          record.addedNodes.forEach((node) => processRoot(node).catch(options.onError));
        });
      });
      observer.observe(documentRef.documentElement, {
        attributes: true,
        attributeFilter: ['src', 'href', 'xlink:href', 'data', 'poster', 'srcset', 'imagesrcset', 'style'],
        childList: true,
        subtree: true
      });
      documentRef.__protoDockLocalAssets = { observer, processRoot };
      processRoot(documentRef).catch(options.onError);
    };
    frame.addEventListener('load', install);
    global.setTimeout(install, 0);
  }

  global.ProtoDockLocalPreviewAssets = {
    isLocalReference,
    srcsetCandidates,
    bindFrame
  };
})(window);
