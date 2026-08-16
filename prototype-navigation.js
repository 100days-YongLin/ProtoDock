(function initProtoDockNavigation(global) {
  const ACTION_PREFIX = /^(?:请)?(?:点击|进入|打开|前往|跳转到?|查看|选择|返回)/;
  const CONTROL_SELECTOR = '[data-protodock-page], [data-protodock-target], a[href], button, [role="button"], input[type="button"], input[type="submit"]';

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
      return entry && (resolved === entry || resolved.endsWith(`/${entry}`));
    });
    return matches.length === 1 ? matches[0][0] : null;
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
    const direct = control.getAttribute?.('data-protodock-page')
      || control.getAttribute?.('data-protodock-target');
    if (pageExists(manifest, direct)) {
      return direct;
    }
    if (control.tagName?.toLowerCase() === 'a') {
      const linkedPageId = pageIdForHref(manifest, currentPageId, control.getAttribute('href'));
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
          const targetPageId = routeForControl(current?.manifest, current?.pageId, control);
          if (!targetPageId || targetPageId === current?.pageId) {
            return;
          }
          handledEvents.add(event);
          event.preventDefault();
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
            }
          };
        }
        documentForFrame.addEventListener('click', (event) => {
          navigateFromControl(event, controlForEvent(event));
        });
      } catch (error) {
        // Cross-origin frontends still work; they can navigate with postMessage.
      }
    };
    if (frame.dataset.protoDockNavigationBound !== 'true') {
      frame.dataset.protoDockNavigationBound = 'true';
      frame.addEventListener('load', install);
    }
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

  global.ProtoDockNavigation = {
    normalizeText,
    actionText,
    routesForPage,
    resolveRelativeEntry,
    pageIdForHref,
    routeForLabel,
    controlForEvent,
    routeForControl,
    bindFrame,
    pageIdFromMessage
  };
})(window);
