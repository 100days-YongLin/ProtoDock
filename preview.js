(() => {
  const MANIFEST_FILE = 'protodock.project.json';
  const DOC_CONCURRENCY = 8;
  const FRAME_BRIDGE_SOURCE = `(() => {
    if (window.__protoDockShareBridgeInstalled || window.parent === window) return;
    window.__protoDockShareBridgeInstalled = true;
    const selector = '[data-protodock-back],[data-protodock-page],[data-protodock-target],[data-page],[data-page-id],[data-target-page],[data-url],[data-href],[data-action="back"],[data-action="go-back"],[data-action="navigate-back"],a[href]';
    const send = (type, payload = {}) => window.parent.postMessage({ type, ...payload }, window.location.origin);
    document.addEventListener('click', (event) => {
      const control = event.composedPath?.().find((item) => item?.matches?.(selector)) || event.target?.closest?.(selector);
      if (!control) return;
      const action = String(control.getAttribute('data-action') || '').trim().toLowerCase();
      if (control.hasAttribute('data-protodock-back') || ['back', 'go-back', 'navigate-back'].includes(action)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        send('protodock:back', { fallbackPageId: control.getAttribute('data-protodock-back') || null });
        return;
      }
      const directAttributes = ['data-protodock-page', 'data-protodock-target', 'data-page', 'data-page-id', 'data-target-page'];
      const pageId = directAttributes.map((name) => control.getAttribute(name)).find(Boolean) || '';
      const href = control.getAttribute('href') || control.getAttribute('data-url') || control.getAttribute('data-href') || '';
      if (!pageId && !href) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      send('protodock:frame-control', {
        pageId,
        href,
        label: control.getAttribute('aria-label') || control.getAttribute('title') || control.textContent || ''
      });
    }, true);
    window.ProtoDockPreview = {
      navigate: (pageId) => send('protodock:navigate', { pageId }),
      back: (fallbackPageId = null) => send('protodock:back', { fallbackPageId })
    };
  })();`;
  const els = {
    projectName: document.getElementById('documentProjectName'),
    progress: document.getElementById('documentProgress'),
    canvasLink: document.getElementById('canvasLink'),
    downloadLink: document.getElementById('downloadLink'),
    toggleOutline: document.getElementById('toggleOutline'),
    outlinePageCount: document.getElementById('outlinePageCount'),
    outlineNavigation: document.getElementById('outlineNavigation'),
    loading: document.getElementById('documentLoading'),
    loadingProgress: document.getElementById('loadingProgress'),
    cover: document.getElementById('documentCover'),
    coverTitle: document.getElementById('coverTitle'),
    coverDescription: document.getElementById('coverDescription'),
    coverPageCount: document.getElementById('coverPageCount'),
    coverGroupCount: document.getElementById('coverGroupCount'),
    sections: document.getElementById('documentSections')
  };

  const devicePresets = {
    'iphone-portrait': {
      deviceClass: 'device-iphone-14-pro device-black',
      width: 390,
      height: 830,
      frameWidth: 428,
      frameHeight: 868,
      safeTop: 59,
      safeBottom: 34
    },
    'ipad-portrait': {
      deviceClass: 'device-ipad-pro device-spacegray',
      width: 506,
      height: 724,
      frameWidth: 560,
      frameHeight: 778,
      safeTop: 24,
      safeBottom: 20
    },
    'iphone-landscape': { width: 844, height: 390 },
    'ipad-landscape': { width: 1180, height: 820 },
    'web-landscape': { width: 1440, height: 900 },
    'web-portrait': { width: 900, height: 1440 }
  };

  const state = {
    shareId: '',
    shareBaseUrl: '',
    manifest: null,
    sections: [],
    pages: [],
    pageById: new Map(),
    articleByPageId: new Map(),
    frameByPageId: new Map(),
    pageHistory: [],
    activePageId: '',
    prototypeObserverSuppressedUntil: 0,
    prototypeObserver: null,
    activeObserver: null
  };

  function isValidShareId(value) {
    return /^[a-zA-Z0-9_-]{6,80}$/.test(value || '');
  }

  function shareIdFromLocation() {
    const queryShareId = new URLSearchParams(window.location.search).get('share');
    if (isValidShareId(queryShareId)) {
      return queryShareId;
    }
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[0] === 's' && isValidShareId(parts[1]) ? parts[1] : '';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function domId(prefix, value) {
    return `${prefix}-${encodeURIComponent(String(value || '')).replace(/%/g, '_') || 'item'}`;
  }

  function projectFileUrl(path) {
    const value = String(path || '').trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      return value;
    }
    return new URL(value.replace(/^\/+/, ''), state.shareBaseUrl).toString();
  }

  function pageRecord(pageId, page = {}) {
    return {
      id: pageId,
      title: page.title || pageId,
      kind: page.kind || '原型页面',
      tag: page.tag || '',
      entry: page.entry || `pages/${pageId}/index.html`,
      doc: page.doc || `docs/${pageId}.md`
    };
  }

  function buildSections(manifest) {
    if (window.ProtoDockProductDocument?.buildDocumentOutline) {
      return window.ProtoDockProductDocument.buildDocumentOutline(manifest);
    }
    return [{
      id: 'all-pages',
      title: '全部页面',
      ungrouped: true,
      pages: Object.entries(manifest.pages || {}).map(([pageId, page]) => pageRecord(pageId, page))
    }];
  }

  function renderMarkdown(mount, markdown) {
    mount.innerHTML = '';
    if (window.toastui?.Editor?.factory) {
      window.toastui.Editor.factory({
        el: mount,
        viewer: true,
        initialValue: markdown || '暂无产品文档。'
      });
      return;
    }
    const fallback = document.createElement('pre');
    fallback.textContent = markdown || '暂无产品文档。';
    mount.append(fallback);
  }

  function setProgress(current, total) {
    const percent = total ? Math.round((current / total) * 100) : 0;
    els.progress.textContent = current >= total
      ? `${total} 个页面 · 原型按需加载`
      : `正在读取 ${current} / ${total}`;
    els.loadingProgress.style.width = `${percent}%`;
  }

  function renderStructure() {
    const project = state.manifest.project || {};
    const groupedCount = state.sections.filter((section) => !section.ungrouped).length;
    document.title = `${project.name || '公开预览'} · ProtoDock`;
    els.projectName.textContent = project.name || '未命名项目';
    els.coverTitle.textContent = project.name || '未命名项目';
    els.coverDescription.textContent = project.description || '可操作原型与页面 PRD 汇总文档。';
    els.coverPageCount.textContent = `${state.pages.length} 页`;
    els.coverGroupCount.textContent = `${groupedCount} 组`;
    els.outlinePageCount.textContent = `${state.pages.length} 个页面`;
    els.loading.hidden = true;
    els.cover.hidden = false;

    els.outlineNavigation.innerHTML = state.sections.map((section) => `
      <section class="outline-group">
        <a class="outline-group-link" href="#${escapeHtml(domId('group', section.id))}">${escapeHtml(section.title)}</a>
        ${(section.pages || []).map((page) => `
          <a href="#${escapeHtml(domId('page', page.id))}" data-outline-page="${escapeHtml(page.id)}">
            <span>${escapeHtml(page.title)}</span><i></i>
          </a>
        `).join('')}
      </section>
    `).join('');

    els.sections.innerHTML = state.sections.map((section) => `
      <section class="product-group" id="${escapeHtml(domId('group', section.id))}">
        <header class="product-group-header">
          <div><span>业务模块</span><h2>${escapeHtml(section.title)}</h2></div>
          <strong>${section.pages.length} 个页面</strong>
        </header>
        ${(section.pages || []).map((page, index) => `
          <article class="product-page is-loading" id="${escapeHtml(domId('page', page.id))}" data-page-id="${escapeHtml(page.id)}">
            <header class="product-page-header">
              <span>${String(index + 1).padStart(2, '0')}</span>
              <div><h3>${escapeHtml(page.title)}</h3><p>${escapeHtml(page.kind || '原型页面')}</p></div>
              ${page.tag ? `<strong>${escapeHtml(page.tag)}</strong>` : ''}
            </header>
            <div class="product-page-body">
              <figure class="prototype-live" data-prototype-page="${escapeHtml(page.id)}">
                <div class="prototype-live-placeholder"><i></i><span>滚动到这里即可操作原型</span></div>
              </figure>
              <section class="product-markdown" data-document-page="${escapeHtml(page.id)}" aria-label="${escapeHtml(page.title)}产品文档">
                <div class="markdown-placeholder"><i></i><i></i><i></i><i></i></div>
              </section>
            </div>
          </article>
        `).join('')}
      </section>
    `).join('');

    state.pages.forEach((page) => {
      const article = els.sections.querySelector(`[data-page-id="${CSS.escape(page.id)}"]`);
      if (article) {
        state.articleByPageId.set(page.id, article);
      }
    });
    mountPrototype(state.pages[0]);
  }

  function renderDocument(page, markdown, error = '') {
    const article = state.articleByPageId.get(page.id);
    const mount = article?.querySelector(`[data-document-page="${CSS.escape(page.id)}"]`);
    if (!mount) {
      return;
    }
    renderMarkdown(mount, error ? `# ${page.title}\n\n${error}` : markdown);
    article.classList.remove('is-loading');
    els.outlineNavigation.querySelector(`[data-outline-page="${CSS.escape(page.id)}"]`)?.classList.add('is-ready');
  }

  function configuredSafeArea(preset) {
    const project = state.manifest.project || {};
    const enabled = project.safeAreaEnabled !== false;
    return {
      enabled,
      top: enabled ? Math.max(0, Number(project.safeAreaTop ?? preset.safeTop ?? 0)) : 0,
      bottom: enabled ? Math.max(0, Number(project.safeAreaBottom ?? preset.safeBottom ?? 0)) : 0
    };
  }

  function frameMarkup(page) {
    return `<iframe class="prototype-live-frame" title="${escapeHtml(page.title)}可操作原型" loading="lazy"></iframe>`;
  }

  function deviceMarkup(page, preset) {
    const safeArea = configuredSafeArea(preset);
    return `
      <div class="prototype-live-stage">
        <div class="prototype-live-viewport">
          <div class="prototype-live-device device ${escapeHtml(preset.deviceClass)}${safeArea.enabled ? ' safe-area-on' : ''}">
            <div class="device-frame"><div class="device-screen">${frameMarkup(page)}</div></div>
            <div class="device-stripe"></div><div class="device-header"></div>
            <div class="device-sensors"></div><div class="device-btns"></div>
            <div class="device-power"></div><div class="device-home"></div>
          </div>
        </div>
      </div>
    `;
  }

  function browserMarkup(page) {
    return `
      <div class="prototype-live-stage">
        <div class="prototype-live-browser">
          <div class="prototype-live-browser-bar"><i></i><i></i><i></i></div>
          ${frameMarkup(page)}
        </div>
      </div>
    `;
  }

  function fitDevice(mount, preset) {
    const stage = mount.querySelector('.prototype-live-stage');
    const viewport = mount.querySelector('.prototype-live-viewport');
    const device = mount.querySelector('.prototype-live-device');
    if (!stage || !viewport || !device) {
      return;
    }
    const safeArea = configuredSafeArea(preset);
    const fit = () => {
      const availableWidth = Math.max(220, stage.clientWidth || 330);
      const scale = Math.min(0.82, availableWidth / preset.frameWidth);
      viewport.style.setProperty('--prototype-scaled-width', `${preset.frameWidth * scale}px`);
      viewport.style.setProperty('--prototype-scaled-height', `${preset.frameHeight * scale}px`);
      device.style.setProperty('--prototype-scale', scale.toFixed(5));
      device.style.setProperty('--prototype-frame-width', `${preset.frameWidth}px`);
      device.style.setProperty('--prototype-frame-height', `${preset.frameHeight}px`);
      device.style.setProperty('--prototype-width', `${preset.width}px`);
      device.style.setProperty('--prototype-height', `${preset.height}px`);
      device.style.setProperty('--safe-top', `${safeArea.top}px`);
      device.style.setProperty('--safe-bottom', `${safeArea.bottom}px`);
    };
    fit();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(fit);
      observer.observe(stage);
    }
  }

  function navigateToPage(pageId, options = {}) {
    const page = state.pageById.get(pageId);
    const article = state.articleByPageId.get(pageId);
    if (!page || !article) {
      return;
    }
    if (options.fromPageId && options.fromPageId !== pageId) {
      state.pageHistory.push(options.fromPageId);
    }
    mountPrototype(page, options.suffix || '');
    state.prototypeObserverSuppressedUntil = Date.now() + 600;
    article.scrollIntoView({ behavior: 'auto', block: 'start' });
    setActivePage(pageId);
  }

  function installDirectFrameNavigation(frame, page) {
    try {
      const frameWindow = frame.contentWindow;
      const frameDocument = frame.contentDocument;
      if (!frameWindow || !frameDocument) {
        return;
      }
      const redirected = window.ProtoDockNavigation?.navigationForFrameLocation(
        state.manifest,
        page.id,
        frameDocument.location?.href
      );
      if (redirected) {
        navigateToPage(redirected.pageId, {
          fromPageId: page.id,
          suffix: redirected.suffix
        });
        return;
      }
      const handleFrameClick = (event) => {
        const control = window.ProtoDockNavigation?.controlForEvent(event);
        if (!control) {
          return;
        }
        if (window.ProtoDockNavigation.isBackControl(control)) {
          event.preventDefault();
          event.stopImmediatePropagation?.();
          const fallbackPageId = window.ProtoDockNavigation.backFallbackForControl(
            state.manifest,
            control
          );
          navigateToPage(state.pageHistory.pop() || fallbackPageId, {});
          return;
        }
        const targetPageId = window.ProtoDockNavigation.routeForControl(
          state.manifest,
          page.id,
          control
        );
        if (!targetPageId || targetPageId === page.id) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation?.();
        navigateToPage(targetPageId, { fromPageId: page.id });
      };
      frameWindow.addEventListener('click', handleFrameClick, true);
      frameDocument.addEventListener('click', handleFrameClick, true);
      if (!frameDocument.querySelector('script[data-protodock-share-bridge]')) {
        const bridgeScript = frameDocument.createElement('script');
        bridgeScript.textContent = FRAME_BRIDGE_SOURCE;
        bridgeScript.dataset.protodockShareBridge = 'true';
        (frameDocument.head || frameDocument.documentElement).append(bridgeScript);
      }
      frameWindow.ProtoDockPreview = {
        navigate(targetPageId) {
          navigateToPage(targetPageId, { fromPageId: page.id });
        },
        back(fallbackPageId = null) {
          navigateToPage(state.pageHistory.pop() || fallbackPageId, {});
        }
      };
    } catch (error) {
      console.warn('ProtoDock could not install the share navigation bridge.', error);
    }
  }

  function bindPrototypeFrame(frame, page) {
    frame.addEventListener('load', () => installDirectFrameNavigation(frame, page));
    let attempts = 0;
    const waitForDocument = () => {
      attempts += 1;
      try {
        const href = frame.contentDocument?.location?.href || '';
        if (href && href !== 'about:blank') {
          installDirectFrameNavigation(frame, page);
          return;
        }
      } catch (error) {
        return;
      }
      if (attempts < 100) {
        window.setTimeout(waitForDocument, 50);
      }
    };
    window.setTimeout(waitForDocument, 50);
  }

  function mountPrototype(page, suffix = '') {
    const article = state.articleByPageId.get(page.id);
    const mount = article?.querySelector(`[data-prototype-page="${CSS.escape(page.id)}"]`);
    if (!mount) {
      return;
    }
    const existing = state.frameByPageId.get(page.id);
    if (existing) {
      if (suffix) {
        existing.src = `${projectFileUrl(page.entry)}${suffix}`;
      }
      return;
    }
    if (!page.entry) {
      mount.innerHTML = '<div class="prototype-live-error"><strong>原型不可用</strong><span>该页面没有配置入口文件。</span></div>';
      return;
    }
    const preset = devicePresets[state.manifest.project?.devicePreset] || devicePresets['iphone-portrait'];
    mount.innerHTML = preset.deviceClass ? deviceMarkup(page, preset) : browserMarkup(page);
    if (preset.deviceClass) {
      fitDevice(mount, preset);
    }
    const frame = mount.querySelector('.prototype-live-frame');
    if (!frame) {
      return;
    }
    state.frameByPageId.set(page.id, frame);
    bindPrototypeFrame(frame, page);
    frame.src = `${projectFileUrl(page.entry)}${suffix}`;
  }

  function setActivePage(pageId) {
    if (!pageId || state.activePageId === pageId) {
      return;
    }
    state.activePageId = pageId;
    els.outlineNavigation.querySelectorAll('[data-outline-page]').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.outlinePage === pageId);
    });
  }

  function installObservers() {
    state.prototypeObserver?.disconnect();
    state.activeObserver?.disconnect();
    if (typeof IntersectionObserver !== 'function') {
      state.pages.forEach((page) => mountPrototype(page));
      return;
    }
    state.prototypeObserver = new IntersectionObserver((entries) => {
      if (Date.now() < state.prototypeObserverSuppressedUntil) {
        return;
      }
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        const page = state.pageById.get(entry.target.dataset.pageId);
        if (page) {
          mountPrototype(page);
          state.prototypeObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '900px 0px' });
    state.activeObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) {
        setActivePage(visible.target.dataset.pageId);
      }
    }, { rootMargin: '-25% 0px -55% 0px', threshold: [0, 0.1, 0.5] });
    state.articleByPageId.forEach((article) => {
      state.prototypeObserver.observe(article);
      state.activeObserver.observe(article);
    });
  }

  async function loadDocuments() {
    let nextIndex = 0;
    let completed = 0;
    const total = state.pages.length;
    setProgress(0, total);
    async function worker() {
      while (nextIndex < total) {
        const page = state.pages[nextIndex++];
        try {
          const response = await fetch(projectFileUrl(page.doc), { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`文档文件不存在：${page.doc}`);
          }
          renderDocument(page, await response.text());
        } catch (error) {
          renderDocument(page, '', error.message || '无法读取页面文档。');
        }
        completed += 1;
        setProgress(completed, total);
      }
    }
    await Promise.all(Array.from({ length: Math.min(DOC_CONCURRENCY, total) }, worker));
  }

  function bindEvents() {
    els.toggleOutline.addEventListener('click', () => {
      const open = document.body.classList.toggle('is-outline-open');
      els.toggleOutline.setAttribute('aria-expanded', String(open));
    });
    els.outlineNavigation.addEventListener('click', (event) => {
      const pageLink = event.target.closest('[data-outline-page]');
      document.body.classList.remove('is-outline-open');
      els.toggleOutline.setAttribute('aria-expanded', 'false');
      if (!pageLink) {
        return;
      }
      event.preventDefault();
      navigateToPage(pageLink.dataset.outlinePage);
    });
    window.addEventListener('message', (event) => {
      state.frameByPageId.forEach((frame, sourcePageId) => {
        if (event.source === frame.contentWindow && event.data?.type === 'protodock:frame-control') {
          const directPageId = String(event.data.pageId || '').trim();
          const targetPageId = state.pageById.has(directPageId)
            ? directPageId
            : window.ProtoDockNavigation?.pageIdForHref(
              state.manifest,
              sourcePageId,
              event.data.href || ''
            ) || window.ProtoDockNavigation?.routeForLabel(
              window.ProtoDockNavigation.routesForPage(state.manifest, sourcePageId),
              event.data.label || ''
            );
          if (targetPageId) {
            navigateToPage(targetPageId, { fromPageId: sourcePageId });
          }
          return;
        }
        const targetPageId = window.ProtoDockNavigation?.pageIdFromMessage(event, frame, state.manifest);
        if (targetPageId) {
          navigateToPage(targetPageId, { fromPageId: sourcePageId });
          return;
        }
        const back = window.ProtoDockNavigation?.backActionFromMessage(event, frame, state.manifest);
        if (back) {
          navigateToPage(state.pageHistory.pop() || back.fallbackPageId, {});
        }
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        document.body.classList.remove('is-outline-open');
        els.toggleOutline.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function renderError(message) {
    els.loading.hidden = false;
    els.loading.classList.add('is-error');
    els.loading.querySelector('strong').textContent = '公开预览加载失败';
    els.loading.querySelector('p').textContent = message || '请确认分享链接有效后重试。';
    els.progress.textContent = '加载失败';
  }

  async function init() {
    state.shareId = shareIdFromLocation();
    if (!state.shareId) {
      renderError('分享链接缺少有效的项目编号。');
      return;
    }
    state.shareBaseUrl = new URL(`/shares/${encodeURIComponent(state.shareId)}/`, window.location.origin).toString();
    els.canvasLink.href = `/s/${encodeURIComponent(state.shareId)}/canvas`;
    els.downloadLink.href = `/api/shares/${encodeURIComponent(state.shareId)}/download`;
    try {
      const response = await fetch(projectFileUrl(MANIFEST_FILE), { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('分享项目不存在或已经失效。');
      }
      state.manifest = await response.json();
      state.sections = buildSections(state.manifest);
      state.pages = state.sections.flatMap((section) => section.pages || []);
      state.pages.forEach((page) => state.pageById.set(page.id, page));
      if (!state.pages.length) {
        throw new Error('项目中没有可预览页面。');
      }
      renderStructure();
      await loadDocuments();
      installObservers();
    } catch (error) {
      renderError(error.message || '无法读取分享项目。');
    }
  }

  bindEvents();
  window.lucide?.createIcons();
  init();
})();
