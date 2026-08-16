(function initProtoDockNavigation(global) {
  const ACTION_PREFIX = /^(?:请)?(?:点击|进入|打开|前往|跳转到?|查看|选择|返回)/;
  const CONTROL_SELECTOR = [
    '[data-protodock-back]',
    '[data-protodock-page]',
    '[data-protodock-target]',
    '[data-page]',
    '[data-page-id]',
    '[data-target-page]',
    '[data-url]',
    '[data-href]',
    '[data-action="back"]',
    '[data-action="go-back"]',
    '[data-action="navigate-back"]',
    '[onclick*="history.back"]',
    '[onclick*="history.go(-1)"]',
    '[class*="-back"]',
    '[class*="back-"]',
    '[id*="-back"]',
    '[id*="back-"]',
    'a[href]',
    'button',
    '[role="button"]',
    'input[type="button"]',
    'input[type="submit"]'
  ].join(', ');
  const BACK_LABELS = new Set(['返回', '后退', '上一页', '返回上一页', 'back', 'goback']);
  const BACK_ACTIONS = new Set(['back', 'go-back', 'navigate-back', 'return']);

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]+/gu, '');
  }

  function actionText(value) {
    let normalized = normalizeText(value);
    let previous = '';
    while (normalized && normalized !== previous) {
      previous = normalized;
      normalized = normalized.replace(ACTION_PREFIX, '');
    }
    return normalized;
  }

  function pageExists(manifest, pageId) {
    return !!pageId && !!manifest?.pages?.[pageId];
  }

  function createPageHistory(limit = 100) {
    const entries = [];
    const maximum = Math.max(1, Number(limit) || 100);
    return {
      push(index, suffix = '') {
        entries.push({ index, suffix: String(suffix || '') });
        if (entries.length > maximum) {
          entries.shift();
        }
      },
      pop() {
        return entries.pop() || null;
      },
      reset() {
        entries.length = 0;
      },
      get size() {
        return entries.length;
      }
    };
  }

  function routesForPage(manifest, pageId) {
    const nodes = Array.isArray(manifest?.canvas?.nodes) ? manifest.canvas.nodes : [];
    const edges = Array.isArray(manifest?.canvas?.edges) ? manifest.canvas.edges : [];
    const sourceNodeIds = new Set(nodes.filter((node) => node.pageId === pageId).map((node) => node.id));
    const pageByNodeId = new Map(nodes.map((node) => [node.id, node.pageId]));
    return edges.flatMap((edge) => {
      const targetPageId = pageByNodeId.get(edge.to);
      if (!sourceNodeIds.has(edge.from) || !pageExists(manifest, targetPageId)) {
        return [];
      }
      return [{
        pageId: targetPageId,
        label: String(edge.label || '').trim()
      }];
    });
  }

  function normalizePath(value) {
    const parts = [];
    String(value || '').replace(/\\/g, '/').split('/').forEach((part) => {
      if (!part || part === '.') {
        return;
      }
      if (part === '..') {
        parts.pop();
        return;
      }
      parts.push(part);
    });
    return parts.join('/');
  }

  function resolveRelativeEntry(currentEntry, href) {
    const cleanHref = String(href || '').split('#')[0].split('?')[0];
    if (!cleanHref || cleanHref.startsWith('#')) {
      return '';
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(cleanHref)) {
      try {
        return normalizePath(new URL(cleanHref).pathname);
      } catch (error) {
        return '';
      }
    }
    if (cleanHref.startsWith('/')) {
      return normalizePath(cleanHref);
    }
    const currentParts = normalizePath(currentEntry).split('/');
    currentParts.pop();
    return normalizePath([...currentParts, cleanHref].join('/'));
  }

  function pageIdForHref(manifest, currentPageId, href) {
    const protocolMatch = String(href || '').match(/^(?:#)?protodock:(?:\/\/)?(.+)$/i);
    if (protocolMatch) {
      const pageId = decodeURIComponent(protocolMatch[1]).replace(/^\/+/, '');
      return pageExists(manifest, pageId) ? pageId : null;
    }

    const currentEntry = manifest?.pages?.[currentPageId]?.entry || '';
    const resolved = resolveRelativeEntry(currentEntry, href);
    if (!resolved) {
      return null;
    }
    const matches = Object.entries(manifest?.pages || {}).filter(([, page]) => {
      const entry = normalizePath(page?.entry || '');
      const resolvedWithoutHtml = resolved.replace(/\.html?$/i, '');
      const entryWithoutHtml = entry.replace(/\.html?$/i, '');
      return entry && (
        resolved === entry
        || resolved.endsWith(`/${entry}`)
        || resolvedWithoutHtml === entryWithoutHtml
        || resolvedWithoutHtml.endsWith(`/${entryWithoutHtml}`)
      );
    });
    return matches.length === 1 ? matches[0][0] : null;
  }

  function navigationForFrameLocation(manifest, currentPageId, href) {
    let url;
    try {
      url = new URL(href, global.location?.href || 'http://localhost/');
    } catch (error) {
      return null;
    }
    if (url.protocol === 'about:') {
      return null;
    }
    const pageId = pageIdForHref(manifest, currentPageId, url.href);
    if (!pageId || pageId === currentPageId) {
      return null;
    }
    return {
      pageId,
      url: url.href,
      suffix: `${url.search}${url.hash}`
    };
  }

  function routeForLabel(routes, label) {
    const normalizedLabel = normalizeText(label);
    const normalizedAction = actionText(label);
    if (!normalizedLabel) {
      return null;
    }
    const matches = routes.filter((route) => {
      const routeLabel = normalizeText(route.label);
      if (!routeLabel) {
        return false;
      }
      return routeLabel === normalizedLabel
        || (normalizedAction && actionText(route.label) === normalizedAction);
    });
    const targetIds = Array.from(new Set(matches.map((route) => route.pageId)));
    return targetIds.length === 1 ? targetIds[0] : null;
  }

  function controlLabel(control) {
    return control?.getAttribute?.('aria-label')
      || control?.getAttribute?.('title')
      || control?.value
      || control?.textContent
      || '';
  }

  function backFallbackForControl(manifest, control) {
    const fallback = String(control?.getAttribute?.('data-protodock-back') || '').trim();
    return pageExists(manifest, fallback) ? fallback : null;
  }

  function isBackControl(control) {
    if (!control) {
      return false;
    }
    if (control.hasAttribute?.('data-protodock-back')) {
      return true;
    }
    const action = String(control.getAttribute?.('data-action') || '').trim().toLowerCase();
    if (BACK_ACTIONS.has(action)) {
      return true;
    }
    const inlineHandler = String(control.getAttribute?.('onclick') || '');
    const href = String(control.getAttribute?.('href') || '');
    if (/history\s*\.\s*(?:back\s*\(|go\s*\(\s*-1\s*\))/i.test(`${inlineHandler} ${href}`)) {
      return true;
    }
    const identifier = `${control.getAttribute?.('id') || ''} ${control.getAttribute?.('class') || ''}`;
    if (/(?:^|[\s_-])(?:back|return)(?:$|[\s_-])/i.test(identifier)) {
      return true;
    }
    return BACK_LABELS.has(normalizeText(controlLabel(control)));
  }

  function controlForEvent(event) {
    const pathControl = event.composedPath?.().find((item) => item?.matches?.(CONTROL_SELECTOR));
    if (pathControl) {
      return pathControl;
    }
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    return target?.closest?.(CONTROL_SELECTOR) || null;
  }

  function routeForControl(manifest, currentPageId, control) {
    if (!control) {
      return null;
    }
    const directAttributes = [
      'data-protodock-page',
      'data-protodock-target',
      'data-page',
      'data-page-id',
      'data-target-page'
    ];
    for (const attribute of directAttributes) {
      const direct = control.getAttribute?.(attribute);
      if (pageExists(manifest, direct)) {
        return direct;
      }
    }

    const pathAttributes = ['href', 'data-url', 'data-href'];
    for (const attribute of pathAttributes) {
      const href = control.getAttribute?.(attribute);
      const linkedPageId = pageIdForHref(manifest, currentPageId, href);
      if (linkedPageId) {
        return linkedPageId;
      }
    }
    return routeForLabel(routesForPage(manifest, currentPageId), controlLabel(control));
  }

  function bindFrame(frame, options = {}) {
    if (!frame || typeof options.onNavigate !== 'function') {
      return;
    }
    frame.__protoDockNavigationOptions = options;
    const install = () => {
      try {
        const documentForFrame = frame.contentDocument;
        if (!documentForFrame) {
          return;
        }
        const current = frame.__protoDockNavigationOptions;
        const redirected = navigationForFrameLocation(
          current?.manifest,
          current?.pageId,
          documentForFrame.location?.href
        );
        if (redirected) {
          global.setTimeout(() => {
            const latest = frame.__protoDockNavigationOptions;
            if (latest?.pageId === current?.pageId) {
              latest.onNavigate(redirected.pageId, 'location', redirected);
            }
          }, 0);
          return;
        }
        if (documentForFrame.__protoDockNavigationState) {
          documentForFrame.__protoDockNavigationState.bindControls(documentForFrame);
          documentForFrame.__protoDockNavigationState.observe(documentForFrame);
          return;
        }
        const boundControls = new WeakSet();
        const handledEvents = new WeakSet();
        const navigateFromControl = (event, control) => {
          if (handledEvents.has(event)
            || (Number.isFinite(event.button) && event.button !== 0)
            || event.metaKey
            || event.ctrlKey
            || event.shiftKey
            || event.altKey) {
            return;
          }
          const current = frame.__protoDockNavigationOptions;
          if (isBackControl(control) && typeof current?.onBack === 'function') {
            handledEvents.add(event);
            event.preventDefault();
            event.stopImmediatePropagation?.();
            const fallbackPageId = backFallbackForControl(current?.manifest, control);
            global.setTimeout(() => current.onBack(fallbackPageId, 'control'), 0);
            return;
          }
          const targetPageId = routeForControl(current?.manifest, current?.pageId, control);
          if (!targetPageId || targetPageId === current?.pageId) {
            return;
          }
          handledEvents.add(event);
          event.preventDefault();
          event.stopImmediatePropagation?.();
          global.setTimeout(() => current.onNavigate(targetPageId, 'control'), 0);
        };
        const bindControl = (control) => {
          if (boundControls.has(control)) {
            return;
          }
          boundControls.add(control);
          control.addEventListener('click', (event) => navigateFromControl(event, control));
        };
        const bindControls = (root) => {
          if (root?.matches?.(CONTROL_SELECTOR)) {
            bindControl(root);
          }
          root?.querySelectorAll?.(CONTROL_SELECTOR).forEach(bindControl);
        };
        let observer = null;
        let observedRoot = null;
        const observe = (documentToObserve) => {
          const root = documentToObserve.documentElement;
          if (!root || root === observedRoot) {
            return;
          }
          observer?.disconnect();
          const Observer = frame.contentWindow?.MutationObserver || global.MutationObserver;
          observer = new Observer((records) => {
            records.forEach((record) => record.addedNodes.forEach(bindControls));
          });
          observer.observe(root, { childList: true, subtree: true });
          observedRoot = root;
        };
        documentForFrame.__protoDockNavigationState = { bindControls, observe };
        bindControls(documentForFrame);
        observe(documentForFrame);
        if (frame.contentWindow) {
          frame.contentWindow.ProtoDockPreview = {
            navigate(pageId) {
              const current = frame.__protoDockNavigationOptions;
              if (pageExists(current?.manifest, pageId)) {
                current.onNavigate(pageId, 'api');
              }
            },
            back(fallbackPageId = null) {
              const current = frame.__protoDockNavigationOptions;
              if (typeof current?.onBack === 'function') {
                const fallback = pageExists(current?.manifest, fallbackPageId) ? fallbackPageId : null;
                current.onBack(fallback, 'api');
              }
            }
          };
        }
        documentForFrame.addEventListener('click', (event) => {
          navigateFromControl(event, controlForEvent(event));
        }, true);
      } catch (error) {
        // Cross-origin frontends still work through postMessage; same-origin failures need diagnostics.
        global.console?.warn?.('ProtoDock could not bind iframe navigation controls.', error);
      }
    };
    if (frame.dataset.protoDockNavigationBound !== 'true') {
      frame.dataset.protoDockNavigationBound = 'true';
      frame.addEventListener('load', install);
    }
    global.setTimeout(install, 0);
  }

  function pageIdFromMessage(event, frame, manifest) {
    if (!frame?.contentWindow || event.source !== frame.contentWindow) {
      return null;
    }
    const data = event.data;
    if (!data || data.type !== 'protodock:navigate' || !pageExists(manifest, data.pageId)) {
      return null;
    }
    return data.pageId;
  }

  function backActionFromMessage(event, frame, manifest) {
    if (!frame?.contentWindow || event.source !== frame.contentWindow) {
      return null;
    }
    const data = event.data;
    if (!data || data.type !== 'protodock:back') {
      return null;
    }
    return {
      fallbackPageId: pageExists(manifest, data.fallbackPageId) ? data.fallbackPageId : null
    };
  }

  global.ProtoDockNavigation = {
    normalizeText,
    actionText,
    createPageHistory,
    routesForPage,
    resolveRelativeEntry,
    pageIdForHref,
    navigationForFrameLocation,
    routeForLabel,
    controlForEvent,
    isBackControl,
    backFallbackForControl,
    routeForControl,
    bindFrame,
    pageIdFromMessage,
    backActionFromMessage
  };
})(window);
