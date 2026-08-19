(function initProtoDockProductDocument(global) {
  const READY_EVENT = 'protodock:product-document-ready';
  const MESSAGE_EVENT = 'protodock:product-document-message';
  const READY_TIMEOUT_MS = 20000;
  const WEB_DEVICE_PRESETS = new Set(['web-landscape', 'web-portrait']);

  function documentLayoutMode(projectOrPreset) {
    const preset = typeof projectOrPreset === 'string'
      ? projectOrPreset
      : projectOrPreset?.devicePreset;
    return WEB_DEVICE_PRESETS.has(String(preset || '').trim()) ? 'web' : 'device';
  }

  function applyDocumentLayout(root, projectOrPreset) {
    if (!root?.classList) {
      return documentLayoutMode(projectOrPreset);
    }
    const preset = typeof projectOrPreset === 'string'
      ? projectOrPreset
      : projectOrPreset?.devicePreset;
    const mode = documentLayoutMode(preset);
    root.classList.toggle('is-web-document', mode === 'web');
    root.dataset.prototypeLayout = mode;
    root.dataset.prototypePreset = String(preset || 'iphone-portrait');
    return mode;
  }

  function uniqueId(prefix = 'document') {
    const random = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function buildViewerUrl(viewerUrl, sessionId, sourceUrl) {
    const url = new URL(viewerUrl, sourceUrl || global.location?.href || undefined);
    url.searchParams.set('session', sessionId);
    if (sourceUrl) {
      url.searchParams.set('return', sourceUrl);
    }
    return url;
  }

  function pageDescriptor(manifest, node, group) {
    const page = manifest.pages?.[node.pageId];
    if (!page) {
      return null;
    }
    return {
      id: node.pageId,
      nodeId: node.id,
      groupId: group?.id || '',
      groupTitle: group?.title || '',
      title: page.title || node.pageId,
      kind: page.kind || '原型页面',
      tag: page.tag || '',
      entry: page.entry || '',
      doc: page.doc || ''
    };
  }

  function buildDocumentOutline(manifest) {
    if (!manifest?.pages || !manifest?.canvas) {
      return [];
    }

    const nodes = Array.isArray(manifest.canvas.nodes) ? manifest.canvas.nodes : [];
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const seenPageIds = new Set();
    const sections = [];

    (manifest.canvas.groups || []).forEach((group, groupIndex) => {
      const orderedNodeIds = Array.isArray(group.nodeIds) ? [...group.nodeIds] : [];
      if (group.rootNodeId && orderedNodeIds.includes(group.rootNodeId)) {
        orderedNodeIds.splice(orderedNodeIds.indexOf(group.rootNodeId), 1);
        orderedNodeIds.unshift(group.rootNodeId);
      }
      const pages = orderedNodeIds.map((nodeId) => nodeById.get(nodeId)).filter(Boolean).map((node) => {
        if (seenPageIds.has(node.pageId)) {
          return null;
        }
        const descriptor = pageDescriptor(manifest, node, group);
        if (descriptor) {
          seenPageIds.add(node.pageId);
        }
        return descriptor;
      }).filter(Boolean);
      if (pages.length) {
        sections.push({
          id: group.id || `group-${groupIndex + 1}`,
          title: group.title || `页面组 ${groupIndex + 1}`,
          ungrouped: false,
          pages
        });
      }
    });

    const ungroupedPages = nodes.map((node) => {
      if (seenPageIds.has(node.pageId)) {
        return null;
      }
      const descriptor = pageDescriptor(manifest, node, null);
      if (descriptor) {
        seenPageIds.add(node.pageId);
      }
      return descriptor;
    }).filter(Boolean);

    Object.entries(manifest.pages).forEach(([pageId, page]) => {
      if (seenPageIds.has(pageId)) {
        return;
      }
      ungroupedPages.push({
        id: pageId,
        nodeId: '',
        groupId: '',
        groupTitle: '',
        title: page.title || pageId,
        kind: page.kind || '原型页面',
        tag: page.tag || '',
        entry: page.entry || '',
        doc: page.doc || ''
      });
      seenPageIds.add(pageId);
    });

    if (ungroupedPages.length) {
      sections.push({
        id: 'all-pages',
        title: sections.length ? '其他页面' : '全部页面',
        ungrouped: true,
        pages: ungroupedPages
      });
    }
    return sections;
  }

  function buildOutlineHierarchy(section) {
    const pages = Array.isArray(section?.pages) ? section.pages : [];
    const splitTitle = (value) => {
      const parts = [];
      let current = '';
      let depth = 0;
      for (const character of String(value || '')) {
        if (character === '(' || character === '（') {
          depth += 1;
        } else if (character === ')' || character === '）') {
          depth = Math.max(0, depth - 1);
        }
        if (character === '/' && depth === 0) {
          if (current.trim()) {
            parts.push(current.trim());
          }
          current = '';
        } else {
          current += character;
        }
      }
      if (current.trim()) {
        parts.push(current.trim());
      }
      return parts;
    };
    const prefixes = Array.from(new Set(pages.flatMap((page) => {
      const parts = splitTitle(page.title);
      return parts.length > 1 ? [parts[0]] : [];
    })));
    const entries = [];
    const subgroupByTitle = new Map();

    pages.forEach((page) => {
      const title = String(page.title || page.id || '').trim();
      const parts = splitTitle(title);
      let subgroupTitle = parts.length > 1 ? parts[0] : '';
      if (!subgroupTitle) {
        subgroupTitle = prefixes.find((prefix) => (
          title === prefix || new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[（(]`).test(title)
        )) || '';
      }
      if (!subgroupTitle) {
        entries.push({ type: 'page', page, label: title });
        return;
      }
      let subgroup = subgroupByTitle.get(subgroupTitle);
      if (!subgroup) {
        subgroup = { type: 'subgroup', title: subgroupTitle, pages: [] };
        subgroupByTitle.set(subgroupTitle, subgroup);
        entries.push(subgroup);
      }
      const suffix = parts.length > 1 ? parts.slice(1).join(' / ') : title.slice(subgroupTitle.length).trim();
      subgroup.pages.push({
        page,
        label: parts.length > 1 ? suffix : `概览${suffix}`
      });
    });
    return entries;
  }

  function openViewer(viewerUrl) {
    const sessionId = uniqueId('prd');
    const sourceUrl = global.location?.href || '';
    const url = buildViewerUrl(viewerUrl, sessionId, sourceUrl);
    const channel = typeof global.BroadcastChannel === 'function'
      ? new global.BroadcastChannel(`protodock-prd-${sessionId}`)
      : null;
    const viewerWindow = global.open(url.toString(), '_blank');
    if (!viewerWindow) {
      channel?.close();
      throw new Error('浏览器阻止了新窗口，请允许 ProtoDock 打开新标签页');
    }

    const targetOrigin = global.location?.origin && global.location.origin !== 'null'
      ? global.location.origin
      : '*';
    let disposed = false;
    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const timeoutId = global.setTimeout(() => {
      rejectReady(new Error('完整产品文档页面加载超时'));
    }, READY_TIMEOUT_MS);

    function handleMessage(event) {
      if (disposed || !viewerWindow || event.source !== viewerWindow) {
        return;
      }
      const message = event.data || {};
      if (message.type !== READY_EVENT || message.sessionId !== sessionId) {
        return;
      }
      global.clearTimeout(timeoutId);
      resolveReady();
    }

    function handleChannelMessage(event) {
      const message = event.data || {};
      if (message.type !== READY_EVENT || message.sessionId !== sessionId) {
        return;
      }
      global.clearTimeout(timeoutId);
      resolveReady();
    }

    global.addEventListener('message', handleMessage);
    if (channel) {
      channel.addEventListener('message', handleChannelMessage);
    }

    return {
      sessionId,
      viewerWindow,
      ready,
      isClosed() {
        return !!viewerWindow?.closed;
      },
      send(action, payload = {}) {
        if (disposed || viewerWindow?.closed) {
          return false;
        }
        const message = {
          type: MESSAGE_EVENT,
          sessionId,
          action,
          payload
        };
        if (channel) {
          channel.postMessage(message);
        } else {
          viewerWindow.postMessage(message, targetOrigin);
        }
        return true;
      },
      dispose() {
        if (disposed) {
          return;
        }
        disposed = true;
        global.clearTimeout(timeoutId);
        global.removeEventListener('message', handleMessage);
        if (channel) {
          channel.removeEventListener('message', handleChannelMessage);
          global.setTimeout(() => channel.close(), 1000);
        }
      }
    };
  }

  async function generate(options) {
    const manifest = options.manifest;
    const sections = buildDocumentOutline(manifest);
    const pages = sections.flatMap((section) => section.pages);
    const sharedDocuments = (options.sharedDocuments || []).map((document) => ({
      id: String(document.id || ''),
      title: String(document.title || document.id || '共享文档'),
      path: String(document.path || ''),
      markdown: String(document.markdown || '')
    }));
    const product = options.product || {};
    const endpoint = options.endpoint || {};
    const controller = (options.openViewer || openViewer)(options.viewerUrl);
    let failedCaptureCount = 0;
    let cachedCaptureCount = 0;
    let completedCount = 0;
    let nextPageIndex = 0;

    try {
      await controller.ready;
      controller.send('start', {
        project: {
          id: manifest.project?.id || '',
          name: product.name || manifest.project?.name || '未命名项目',
          description: product.description || manifest.project?.description || '',
          version: product.version || '',
          endpointId: endpoint.id || '',
          endpointName: endpoint.name || manifest.project?.name || '',
          devicePreset: manifest.project?.devicePreset || 'iphone-portrait',
          safeAreaEnabled: manifest.project?.safeAreaEnabled,
          safeAreaTop: manifest.project?.safeAreaTop,
          safeAreaBottom: manifest.project?.safeAreaBottom,
          changelog: global.ProtoDockChangeLog?.normalize(manifest.changelog) || []
        },
        navigationManifest: {
          pages: manifest.pages || {},
          canvas: {
            nodes: Array.isArray(manifest.canvas?.nodes) ? manifest.canvas.nodes : [],
            edges: Array.isArray(manifest.canvas?.edges) ? manifest.canvas.edges : []
          }
        },
        generatedAt: new Date().toISOString(),
        sharedDocuments,
        sections
      });

      async function buildNextPage() {
        const index = nextPageIndex;
        nextPageIndex += 1;
        if (index >= pages.length) {
          return;
        }
        if (controller.isClosed()) {
          throw new Error('完整产品文档页面已关闭');
        }
        const descriptor = pages[index];
        let markdown = '';
        let prototypePayload = {};
        let pagePayload;
        try {
          markdown = await options.loadMarkdown(descriptor);
          if (typeof options.loadPrototype === 'function') {
            try {
              prototypePayload = await options.loadPrototype(descriptor) || {};
            } catch (error) {
              prototypePayload = {
                prototypeError: error.message || '无法加载可操作原型'
              };
              options.onPrototypeError?.(descriptor, error);
            }
          }
          controller.send('page', {
            ...descriptor,
            markdown,
            ...prototypePayload,
            screenshot: null,
            capturePending: true
          });
          pagePayload = await options.buildPage(descriptor, { markdown });
        } catch (error) {
          failedCaptureCount += 1;
          pagePayload = {
            markdown: markdown || `# ${descriptor.title}\n\n产品文档或截图读取失败。`,
            screenshot: null,
            captureError: error.message || '无法生成截图'
          };
          options.onPageError?.(descriptor, error);
        }
        if (!pagePayload.screenshot) {
          failedCaptureCount += pagePayload.captureError ? 0 : 1;
        }
        if (pagePayload.cacheHit) {
          cachedCaptureCount += 1;
        }
        controller.send('page', {
          ...descriptor,
          markdown,
          ...prototypePayload,
          ...pagePayload,
          capturePending: false
        });
        completedCount += 1;
        const progress = {
          current: completedCount,
          total: pages.length,
          cached: cachedCaptureCount
        };
        controller.send('progress', progress);
        options.onProgress?.(completedCount, pages.length, progress);
        await buildNextPage();
      }

      const requestedConcurrency = Number(options.concurrency || 1);
      const workerCount = Math.min(
        pages.length,
        Math.max(1, Number.isFinite(requestedConcurrency) ? Math.floor(requestedConcurrency) : 1)
      );
      await Promise.all(Array.from({ length: workerCount }, () => buildNextPage()));

      const result = {
        total: pages.length,
        failed: failedCaptureCount,
        cached: cachedCaptureCount
      };
      controller.send('complete', result);
      return result;
    } catch (error) {
      controller.send('error', { message: error.message || '无法生成完整产品文档' });
      throw error;
    } finally {
      controller.dispose();
    }
  }

  global.ProtoDockProductDocument = {
    READY_EVENT,
    MESSAGE_EVENT,
    buildDocumentOutline,
    buildOutlineHierarchy,
    buildViewerUrl,
    documentLayoutMode,
    applyDocumentLayout,
    openViewer,
    generate
  };
})(typeof window !== 'undefined' ? window : globalThis);
