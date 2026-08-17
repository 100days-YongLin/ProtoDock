(() => {
  const MANIFEST_FILE = 'protodock.project.json';
  const DOC_CONCURRENCY = 8;
  const PRINT_CAPTURE_CONCURRENCY = 3;
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
    print: document.getElementById('printDocument'),
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
    coverCurrentVersion: document.getElementById('coverCurrentVersion'),
    coverChangeLogList: document.getElementById('coverChangeLogList'),
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
    manifestRevision: '',
    printPreparing: false,
    printImageUrls: new Set(),
    printCaptureAssetCache: new Map(),
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

  function renderOutlineEntries(section) {
    const entries = window.ProtoDockProductDocument?.buildOutlineHierarchy?.(section)
      || (section.pages || []).map((page) => ({ type: 'page', page, label: page.title }));
    return entries.map((entry) => {
      if (entry.type === 'subgroup') {
        return `
          <div class="outline-subgroup">
            <div class="outline-subgroup-title">${escapeHtml(entry.title)}</div>
            ${entry.pages.map(({ page, label }) => `
              <a href="#${escapeHtml(domId('page', page.id))}" data-outline-page="${escapeHtml(page.id)}">
                <span>${escapeHtml(label)}</span><i></i>
              </a>
            `).join('')}
          </div>
        `;
      }
      return `
        <a href="#${escapeHtml(domId('page', entry.page.id))}" data-outline-page="${escapeHtml(entry.page.id)}">
          <span>${escapeHtml(entry.label)}</span><i></i>
        </a>
      `;
    }).join('');
  }

  function renderChangeLog(entries, manifest) {
    const items = window.ProtoDockChangeLog?.normalize(entries) || [];
    const current = items[items.length - 1] || null;
    const currentVersion = current?.version || window.ProtoDockChangeLog?.inferredVersion(manifest) || '';
    els.coverCurrentVersion.hidden = !currentVersion;
    els.coverCurrentVersion.textContent = currentVersion ? `当前版本 ${currentVersion}` : '';
    els.coverChangeLogList.innerHTML = items.length
      ? items.map((entry, index) => `
        <li class="${index === items.length - 1 ? 'is-current' : ''}">
          <div>
            <time datetime="${escapeHtml(entry.changedAt)}">${escapeHtml(window.ProtoDockChangeLog.formatDate(entry.changedAt))}</time>
            <strong>${escapeHtml(entry.version)}</strong>
          </div>
          <p>${escapeHtml(entry.description)}</p>
          ${index === items.length - 1 ? '<span>当前</span>' : ''}
        </li>
      `).join('')
      : '<li class="is-empty">尚无变更记录，下一次在 ProtoDock 保存项目后生成。</li>';
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
    renderChangeLog(state.manifest.changelog, state.manifest);
    els.outlinePageCount.textContent = `${state.pages.length} 个页面`;
    els.loading.hidden = true;
    els.cover.hidden = false;

    els.outlineNavigation.innerHTML = state.sections.map((section) => `
      <section class="outline-group">
        <a class="outline-group-link" href="#${escapeHtml(domId('group', section.id))}">${escapeHtml(section.title)}</a>
        ${renderOutlineEntries(section)}
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

  function waitForFrameReady(frame, timeout = 30000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = async () => {
        if (settled) {
          return;
        }
        try {
          const documentRef = frame.contentDocument;
          const href = documentRef?.location?.href || '';
          if (!documentRef || documentRef.readyState !== 'complete' || !href || href === 'about:blank') {
            return;
          }
          settled = true;
          window.clearTimeout(timer);
          frame.removeEventListener('load', finish);
          await documentRef.fonts?.ready?.catch(() => {});
          await Promise.race([
            Promise.all(Array.from(documentRef.images || []).map((image) => {
              if (image.complete) {
                return Promise.resolve();
              }
              return new Promise((done) => {
                image.addEventListener('load', done, { once: true });
                image.addEventListener('error', done, { once: true });
              });
            })),
            new Promise((done) => window.setTimeout(done, 4000))
          ]);
          window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
        } catch (error) {
          settled = true;
          window.clearTimeout(timer);
          frame.removeEventListener('load', finish);
          reject(error);
        }
      };
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          frame.removeEventListener('load', finish);
          reject(new Error('原型页面加载超时'));
        }
      }, timeout);
      frame.addEventListener('load', finish);
      finish();
    });
  }

  async function acquirePrintFrame(page, preset) {
    const existing = state.frameByPageId.get(page.id);
    if (existing) {
      try {
        await waitForFrameReady(existing);
        return { frame: existing, temporary: false };
      } catch (error) {
        console.warn(`ProtoDock: active preview was not ready for ${page.id}; using a clean print frame.`, error);
      }
    }
    const frame = document.createElement('iframe');
    frame.className = 'print-capture-frame';
    frame.title = `${page.title}打印截图`;
    frame.style.width = `${preset.width}px`;
    frame.style.height = `${preset.height}px`;
    document.body.append(frame);
    frame.src = projectFileUrl(page.entry);
    try {
      await waitForFrameReady(frame);
      return { frame, temporary: true };
    } catch (error) {
      frame.remove();
      throw error;
    }
  }

  async function installPrintScreenshot(page, blob) {
    const article = state.articleByPageId.get(page.id);
    const mount = article?.querySelector(`[data-prototype-page="${CSS.escape(page.id)}"]`);
    if (!mount) {
      return;
    }
    mount.querySelector('.prototype-print-shot, .prototype-print-error')?.remove();
    const image = new Image();
    const url = URL.createObjectURL(blob);
    state.printImageUrls.add(url);
    image.className = 'prototype-print-shot';
    image.alt = `${page.title}原型全图`;
    image.src = url;
    mount.append(image);
    if (image.decode) {
      await image.decode().catch(() => {});
    }
  }

  function installPrintError(page, message) {
    const article = state.articleByPageId.get(page.id);
    const mount = article?.querySelector(`[data-prototype-page="${CSS.escape(page.id)}"]`);
    if (!mount) {
      return;
    }
    mount.querySelector('.prototype-print-shot, .prototype-print-error')?.remove();
    const error = document.createElement('div');
    error.className = 'prototype-print-error';
    error.textContent = message || '原型截图生成失败';
    mount.append(error);
  }

  async function preparePrintSnapshots() {
    if (state.pages.every((page) => state.articleByPageId.get(page.id)?.querySelector('.prototype-print-shot'))) {
      return;
    }
    if (!window.ProtoDockCapture?.capturePagePng || !window.ProtoDockProductDocumentCache) {
      throw new Error('打印截图模块未加载');
    }
    const preset = devicePresets[state.manifest.project?.devicePreset] || devicePresets['iphone-portrait'];
    const safeArea = configuredSafeArea(preset);
    const captureProfile = {
      preset: state.manifest.project?.devicePreset || 'iphone-portrait',
      width: preset.width,
      height: preset.height,
      frameWidth: preset.frameWidth || preset.width,
      frameHeight: preset.frameHeight || preset.height,
      safeAreaEnabled: safeArea.enabled,
      safeAreaTop: safeArea.top,
      safeAreaBottom: safeArea.bottom,
      includeFrame: true,
      fullPage: true,
      rendererVersion: 5
    };
    const revisionSession = window.ProtoDockProductDocumentCache.createProjectRevisionSession({
      projectId: state.manifest.project?.id || '',
      projectBaseUrl: state.shareBaseUrl,
      shareId: state.shareId,
      manifestHash: state.manifestRevision
    });
    const screenshotCache = window.ProtoDockProductDocumentCache.screenshotCache;
    let nextIndex = 0;
    let completed = 0;
    let failed = 0;

    async function captureScreenshot(page) {
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let capture = null;
        try {
          capture = await acquirePrintFrame(page, preset);
          return await window.ProtoDockCapture.capturePagePng({
            iframe: capture.frame,
            preset,
            safeAreaEnabled: safeArea.enabled,
            safeAreaTop: safeArea.top,
            safeAreaBottom: safeArea.bottom,
            includeFrame: true,
            fullPage: true,
            assetCache: state.printCaptureAssetCache
          });
        } catch (error) {
          lastError = error;
        } finally {
          if (capture?.temporary) {
            capture.frame.remove();
          }
        }
      }
      throw lastError || new Error('原型截图生成失败');
    }

    async function worker() {
      while (nextIndex < state.pages.length) {
        const page = state.pages[nextIndex++];
        if (state.articleByPageId.get(page.id)?.querySelector('.prototype-print-shot')) {
          completed += 1;
          els.progress.textContent = `正在准备打印 ${completed} / ${state.pages.length}`;
          continue;
        }
        try {
          const cacheKey = await revisionSession.keyForPage(page, captureProfile);
          let screenshot = await screenshotCache.get(cacheKey);
          if (!screenshot) {
            screenshot = await captureScreenshot(page);
            await screenshotCache.set(cacheKey, screenshot);
          }
          await installPrintScreenshot(page, screenshot);
        } catch (error) {
          failed += 1;
          console.warn(`ProtoDock: print capture failed for ${page.id}`, error);
          installPrintError(page, `截图生成失败：${error.message || '未知错误'}`);
        } finally {
          completed += 1;
          els.progress.textContent = `正在准备打印 ${completed} / ${state.pages.length}`;
        }
      }
    }
    await Promise.all(Array.from({
      length: Math.min(PRINT_CAPTURE_CONCURRENCY, state.pages.length)
    }, worker));
    return { failed };
  }

  async function printDocument() {
    if (state.printPreparing) {
      return;
    }
    state.printPreparing = true;
    els.print.disabled = true;
    try {
      const result = await preparePrintSnapshots();
      els.progress.textContent = result?.failed ? `${result.failed} 个原型截图未生成` : '打印内容已准备';
      window.print();
    } catch (error) {
      console.error(error);
      els.progress.textContent = error.message || '打印准备失败';
    } finally {
      state.printPreparing = false;
      els.print.disabled = false;
    }
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
        const bridgeRoot = frameDocument.head || frameDocument.documentElement;
        bridgeRoot?.append(bridgeScript);
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
    els.print.addEventListener('click', printDocument);
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
    window.addEventListener('afterprint', () => setProgress(state.pages.length, state.pages.length));
    window.addEventListener('beforeunload', () => {
      state.printImageUrls.forEach((url) => URL.revokeObjectURL(url));
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
      state.manifestRevision = [
        response.headers.get('etag') || '',
        response.headers.get('last-modified') || '',
        response.headers.get('content-length') || '',
        JSON.stringify(state.manifest)
      ].join('|');
      state.sections = buildSections(state.manifest);
      state.pages = state.sections.flatMap((section) => section.pages || []);
      state.pages.forEach((page) => state.pageById.set(page.id, page));
      if (!state.pages.length) {
        throw new Error('项目中没有可预览页面。');
      }
      renderStructure();
      await loadDocuments();
      els.print.disabled = false;
      installObservers();
    } catch (error) {
      renderError(error.message || '无法读取分享项目。');
    }
  }

  bindEvents();
  window.lucide?.createIcons();
  init();
})();
