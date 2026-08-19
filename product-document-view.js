(function initProductDocumentView() {
  const READY_EVENT = 'protodock:product-document-ready';
  const MESSAGE_EVENT = 'protodock:product-document-message';
  const searchParams = new URLSearchParams(window.location.search);
  const sessionId = searchParams.get('session') || '';
  const channel = sessionId && typeof window.BroadcastChannel === 'function'
    ? new window.BroadcastChannel(`protodock-prd-${sessionId}`)
    : null;
  const pageElements = new Map();
  const screenshotUrls = new Set();
  const prototypeSources = new Map();
  const prototypeFrames = new Map();
  let prototypeObserver = null;
  let prototypeHistory = null;
  let navigationManifest = { pages: {}, canvas: { nodes: [], edges: [] } };
  let project = {};
  let webDocument = false;
  let activePageId = '';
  let presentation = null;
  let readyTimer = null;
  let started = false;

  const els = {
    projectName: document.getElementById('documentProjectName'),
    returnToCanvas: document.getElementById('returnToCanvas'),
    openPresentation: document.getElementById('openPresentation'),
    progress: document.getElementById('documentProgress'),
    print: document.getElementById('printDocument'),
    toggleOutline: document.getElementById('toggleOutline'),
    outline: document.getElementById('documentOutline'),
    outlinePageCount: document.getElementById('outlinePageCount'),
    outlineNavigation: document.getElementById('outlineNavigation'),
    content: document.getElementById('documentContent'),
    loading: document.getElementById('documentLoading'),
    loadingProgress: document.getElementById('loadingProgress'),
    cover: document.getElementById('documentCover'),
    coverTitle: document.getElementById('coverTitle'),
    coverDescription: document.getElementById('coverDescription'),
    coverPageCount: document.getElementById('coverPageCount'),
    coverGroupCount: document.getElementById('coverGroupCount'),
    coverGeneratedAt: document.getElementById('coverGeneratedAt'),
    coverCurrentVersion: document.getElementById('coverCurrentVersion'),
    coverChangeLogList: document.getElementById('coverChangeLogList'),
    sections: document.getElementById('documentSections'),
    imagePreview: document.getElementById('imagePreview'),
    previewImage: document.getElementById('previewImage'),
    closeImagePreview: document.getElementById('closeImagePreview')
  };

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
    const encoded = encodeURIComponent(String(value || '')).replace(/%/g, '_');
    return `${prefix}-${encoded || 'item'}`;
  }

  function postReady() {
    if (!sessionId) {
      return;
    }
    const message = { type: READY_EVENT, sessionId };
    if (channel) {
      channel.postMessage(message);
    } else if (window.opener) {
      window.opener.postMessage(message, '*');
    }
  }

  function canvasReturnUrl() {
    const fallback = new URL('./index.html', window.location.href);
    const value = searchParams.get('return');
    if (!value) {
      return fallback.toString();
    }
    try {
      const target = new URL(value, window.location.href);
      if (target.origin !== window.location.origin || target.pathname.endsWith('/product-document.html')) {
        return fallback.toString();
      }
      return target.toString();
    } catch (error) {
      return fallback.toString();
    }
  }

  function returnToCanvas() {
    const returnUrl = canvasReturnUrl();
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.focus();
        window.close();
        window.setTimeout(() => window.location.replace(returnUrl), 150);
        return;
      } catch (error) {
        // Fall through to same-tab navigation when opener access is unavailable.
      }
    }
    window.location.replace(returnUrl);
  }

  function renderMarkdown(mount, markdown) {
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

  function renderOutlineEntries(section) {
    const entries = window.ProtoDockProductDocument?.buildOutlineHierarchy?.(section)
      || (section.pages || []).map((page) => ({ type: 'page', page, label: page.title }));
    return entries.map((entry) => {
      if (entry.type === 'subgroup') {
        return `
          <div class="outline-subgroup">
            <div class="outline-subgroup-title">${escapeHtml(entry.title)}</div>
            ${entry.pages.map(({ page, label }) => `<a href="#${escapeHtml(domId('page', page.id))}" data-outline-page="${escapeHtml(page.id)}"><span>${escapeHtml(label)}</span><i></i></a>`).join('')}
          </div>
        `;
      }
      return `<a href="#${escapeHtml(domId('page', entry.page.id))}" data-outline-page="${escapeHtml(entry.page.id)}"><span>${escapeHtml(entry.label)}</span><i></i></a>`;
    }).join('');
  }

  function renderChangeLog(entries, project) {
    const items = window.ProtoDockChangeLog?.normalize(entries) || [];
    const displayedItems = window.ProtoDockChangeLog?.newestFirst(items) || [...items].reverse();
    const current = items[items.length - 1] || null;
    const currentVersion = current?.version || window.ProtoDockChangeLog?.inferredVersion({ project }) || '';
    els.coverCurrentVersion.hidden = !currentVersion;
    els.coverCurrentVersion.textContent = currentVersion ? `当前版本 ${currentVersion}` : '';
    els.coverChangeLogList.innerHTML = displayedItems.length
      ? displayedItems.map((entry, index) => `
        <li class="${index === 0 ? 'is-current' : ''}">
          <div>
            <time datetime="${escapeHtml(entry.changedAt)}">${escapeHtml(window.ProtoDockChangeLog.formatDate(entry.changedAt))}</time>
            <strong>${escapeHtml(entry.version)}</strong>
          </div>
          <p>${escapeHtml(entry.description)}</p>
          ${index === 0 ? '<span>当前</span>' : ''}
        </li>
      `).join('')
      : '<li class="is-empty">尚无正式发布记录，下一次在 ProtoDock 发布项目后生成。</li>';
  }

  function showImage(url, title) {
    els.previewImage.src = url;
    els.previewImage.alt = title;
    els.imagePreview.hidden = false;
    document.body.classList.add('is-previewing-image');
  }

  function closeImagePreview() {
    els.imagePreview.hidden = true;
    els.previewImage.removeAttribute('src');
    document.body.classList.remove('is-previewing-image');
  }

  function prototypeFigure(page) {
    if (!webDocument) {
      return `
        <figure class="prototype-shot">
          <div class="shot-placeholder"><i></i><span>正在生成原型截图</span></div>
        </figure>
      `;
    }
    return `
      <figure class="prototype-shot prototype-live" data-prototype-page="${escapeHtml(page.id)}">
        <div class="prototype-live-placeholder"><i></i><span>滚动到这里即可操作原型</span></div>
      </figure>
    `;
  }

  function webPreset() {
    return project.devicePreset === 'web-portrait'
      ? { width: 900, height: 1440 }
      : { width: 1440, height: 900 };
  }

  function fitBrowser(mount) {
    const stage = mount.querySelector('.prototype-live-stage');
    const viewport = mount.querySelector('.prototype-live-browser-viewport');
    const browser = mount.querySelector('.prototype-live-browser');
    if (!stage || !viewport || !browser || !window.ProtoDockCapture?.scaledViewportGeometry) {
      return;
    }
    const fit = () => {
      const preset = webPreset();
      const geometry = window.ProtoDockCapture.scaledViewportGeometry(
        preset,
        Math.max(220, stage.clientWidth || preset.width),
        { chromeHeight: 30, maxScale: 1 }
      );
      viewport.style.setProperty('--prototype-browser-scaled-width', `${geometry.scaledWidth}px`);
      viewport.style.setProperty('--prototype-browser-scaled-height', `${geometry.scaledHeight}px`);
      browser.style.setProperty('--prototype-browser-scale', geometry.scale.toFixed(5));
      browser.style.setProperty('--prototype-browser-width', `${geometry.width}px`);
      browser.style.setProperty('--prototype-browser-height', `${geometry.height + geometry.chromeHeight}px`);
      browser.style.setProperty('--prototype-width', `${geometry.width}px`);
      browser.style.setProperty('--prototype-height', `${geometry.height}px`);
    };
    fit();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(fit);
      observer.observe(stage);
    }
  }

  function scrollToPrototype(pageId) {
    const article = pageElements.get(pageId);
    if (!article) {
      return;
    }
    mountPrototype(pageId);
    activePageId = pageId;
    article.scrollIntoView({ behavior: 'smooth', block: 'start' });
    els.outlineNavigation.querySelectorAll('[data-outline-page]').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.outlinePage === pageId);
    });
  }

  function navigatePrototype(fromPageId, targetPageId, suffix = '') {
    if (!navigationManifest.pages?.[targetPageId]) {
      return;
    }
    if (fromPageId && fromPageId !== targetPageId) {
      prototypeHistory?.push(fromPageId);
    }
    mountPrototype(targetPageId, suffix);
    scrollToPrototype(targetPageId);
  }

  function backPrototype(fallbackPageId) {
    const previous = prototypeHistory?.pop();
    const targetPageId = previous?.index || fallbackPageId;
    if (targetPageId) {
      mountPrototype(targetPageId, previous?.suffix || '');
      scrollToPrototype(targetPageId);
    }
  }

  function bindPrototypeFrame(frame, pageId) {
    window.ProtoDockNavigation?.bindFrame(frame, {
      manifest: navigationManifest,
      pageId,
      onNavigate(targetPageId, source, navigation) {
        navigatePrototype(pageId, targetPageId, navigation?.suffix || '');
      },
      onBack(fallbackPageId) {
        backPrototype(fallbackPageId);
      }
    });
  }

  function mountPrototype(pageId, suffix = '') {
    if (!webDocument) {
      return null;
    }
    const source = prototypeSources.get(pageId);
    const article = pageElements.get(pageId);
    const mount = article?.querySelector(`[data-prototype-page="${CSS.escape(pageId)}"]`);
    if (!source || !mount) {
      return null;
    }
    const existing = prototypeFrames.get(pageId);
    if (existing) {
      if (suffix && source.src) {
        const target = new URL(source.src, window.location.href);
        const routed = new URL(suffix, target);
        target.search = routed.search;
        target.hash = routed.hash;
        existing.src = target.toString();
      }
      return existing;
    }
    if (source.error || (!source.src && !source.srcdoc)) {
      mount.innerHTML = `<div class="prototype-live-error"><strong>原型不可用</strong><span>${escapeHtml(source.error || '该页面没有可操作入口。')}</span></div>`;
      return null;
    }
    mount.innerHTML = `
      <div class="prototype-live-stage">
        <div class="prototype-live-browser-viewport">
          <div class="prototype-live-browser">
            <div class="prototype-live-browser-bar"><i></i><i></i><i></i></div>
            <iframe class="prototype-live-frame" title="${escapeHtml(navigationManifest.pages?.[pageId]?.title || pageId)}可操作原型" loading="lazy"></iframe>
          </div>
        </div>
      </div>
    `;
    fitBrowser(mount);
    const frame = mount.querySelector('.prototype-live-frame');
    if (!frame) {
      return null;
    }
    prototypeFrames.set(pageId, frame);
    bindPrototypeFrame(frame, pageId);
    if (source.srcdoc) {
      frame.srcdoc = source.srcdoc;
    } else {
      frame.src = source.src;
    }
    prototypeObserver?.unobserve(article);
    return frame;
  }

  function installPrototypeObserver() {
    prototypeObserver?.disconnect();
    if (!webDocument || typeof IntersectionObserver !== 'function') {
      return;
    }
    prototypeObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && mountPrototype(entry.target.dataset.pageId)) {
          prototypeObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '900px 0px' });
    pageElements.forEach((article) => prototypeObserver.observe(article));
  }

  function rememberPrototype(payload) {
    if (!payload.prototypeSrc && !payload.prototypeSrcdoc && !payload.prototypeError) {
      return;
    }
    prototypeSources.set(payload.id, {
      src: payload.prototypeSrc || '',
      srcdoc: payload.prototypeSrcdoc || '',
      error: payload.prototypeError || ''
    });
    presentation?.refresh();
    if (!webDocument) {
      return;
    }
    const article = pageElements.get(payload.id);
    const rect = article?.getBoundingClientRect?.();
    if (!rect || (rect.top < window.innerHeight + 900 && rect.bottom > -900)) {
      mountPrototype(payload.id);
    }
  }

  function renderStart(payload) {
    started = true;
    window.clearInterval(readyTimer);
    project = payload.project || {};
    navigationManifest = payload.navigationManifest || navigationManifest;
    webDocument = window.ProtoDockProductDocument?.documentLayoutMode?.(project) === 'web';
    prototypeHistory = window.ProtoDockNavigation?.createPageHistory?.() || null;
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    const pages = sections.flatMap((section) => section.pages || []);
    activePageId = pages[0]?.id || '';
    window.ProtoDockProductDocument?.applyDocumentLayout?.(document.body, project);
    document.title = `${project.name || '完整产品文档'} · ProtoDock`;
    els.projectName.textContent = project.name || '未命名项目';
    els.coverTitle.textContent = project.name || '未命名项目';
    els.coverDescription.textContent = project.description || '本产品文档由 ProtoDock 汇总页面 PRD 与原型截图生成。';
    els.coverPageCount.textContent = `${pages.length} 页`;
    els.coverGroupCount.textContent = `${sections.filter((section) => !section.ungrouped).length} 组`;
    els.coverGeneratedAt.textContent = new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'long',
      timeStyle: 'short'
    }).format(new Date(payload.generatedAt || Date.now()));
    renderChangeLog(project.changelog, project);
    els.outlinePageCount.textContent = `${pages.length} 个页面`;
    els.loading.hidden = true;
    els.cover.hidden = false;
    els.progress.textContent = `正在生成 0 / ${pages.length}`;

    els.outlineNavigation.innerHTML = sections.map((section) => `
      <section class="outline-group">
        <a class="outline-group-link" href="#${escapeHtml(domId('group', section.id))}">${escapeHtml(section.title)}</a>
        ${renderOutlineEntries(section)}
      </section>
    `).join('');

    els.sections.innerHTML = sections.map((section) => `
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
              ${prototypeFigure(page)}
              <section class="product-markdown" aria-label="${escapeHtml(page.title)}产品文档">
                <div class="markdown-placeholder"><i></i><i></i><i></i><i></i></div>
              </section>
            </div>
          </article>
        `).join('')}
      </section>
    `).join('');

    pages.forEach((page) => {
      const article = els.sections.querySelector(`[data-page-id="${CSS.escape(page.id)}"]`);
      if (article) {
        pageElements.set(page.id, article);
      }
    });
    installPrototypeObserver();
    presentation?.destroy();
    presentation = window.ProtoDockPresentation?.create?.({
      trigger: els.openPresentation,
      project,
      manifest: navigationManifest,
      pages,
      initialPageId: () => activePageId,
      sourceForPage: (pageId) => prototypeSources.get(pageId) || {},
      onPageChange(pageId) {
        activePageId = pageId;
      }
    }) || null;
  }

  function renderPage(payload) {
    const article = pageElements.get(payload.id);
    if (!article) {
      return;
    }
    const shot = article.querySelector('.prototype-shot');
    const markdownMount = article.querySelector('.product-markdown');

    rememberPrototype(payload);

    if (!article.dataset.markdownReady) {
      markdownMount.innerHTML = '';
      renderMarkdown(markdownMount, payload.markdown);
      article.dataset.markdownReady = 'true';
      article.classList.add('is-markdown-ready');
    }

    if (payload.capturePending) {
      const outlineLink = els.outlineNavigation.querySelector(`[data-outline-page="${CSS.escape(payload.id)}"]`);
      outlineLink?.classList.add('is-ready');
      return;
    }

    if (!webDocument) {
      shot.innerHTML = '';
    } else {
      shot.querySelector('.prototype-print-shot, .prototype-print-error')?.remove();
    }

    if (payload.screenshot instanceof Blob) {
      const url = URL.createObjectURL(payload.screenshot);
      screenshotUrls.add(url);
      if (webDocument) {
        const image = document.createElement('img');
        image.className = 'prototype-print-shot';
        image.src = url;
        image.alt = `${payload.title || payload.id}原型截图`;
        shot.append(image);
      } else {
      const button = document.createElement('button');
      button.className = 'prototype-shot-button';
      button.type = 'button';
      button.title = '查看原型大图';
      const image = document.createElement('img');
      image.src = url;
      image.alt = `${payload.title || payload.id}原型截图`;
      button.append(image);
      button.addEventListener('click', () => showImage(url, image.alt));
      shot.append(button);
      }
    } else {
      const errorClass = webDocument ? 'prototype-print-error' : 'shot-error';
      const errorMarkup = `<div class="${errorClass}"><strong>截图暂不可用</strong><span>${escapeHtml(payload.captureError || '无法生成此页面截图')}</span></div>`;
      if (webDocument) {
        shot.insertAdjacentHTML('beforeend', errorMarkup);
      } else {
        shot.innerHTML = errorMarkup;
      }
    }

    article.classList.remove('is-loading');
    const outlineLink = els.outlineNavigation.querySelector(`[data-outline-page="${CSS.escape(payload.id)}"]`);
    outlineLink?.classList.add('is-ready');
  }

  function renderProgress(payload) {
    const total = Number(payload.total || 0);
    const current = Number(payload.current || 0);
    const cached = Number(payload.cached || 0);
    const percent = total ? Math.round((current / total) * 100) : 0;
    els.progress.textContent = cached
      ? `正在生成 ${current} / ${total} · 已复用 ${cached} 张`
      : `正在生成 ${current} / ${total}`;
    els.loadingProgress.style.width = `${percent}%`;
  }

  function renderComplete(payload) {
    const failed = Number(payload.failed || 0);
    const cached = Number(payload.cached || 0);
    if (failed) {
      els.progress.textContent = `已完成，${failed} 张截图未生成`;
    } else if (cached) {
      els.progress.textContent = `文档已生成 · 已复用 ${cached} 张缓存截图`;
    } else {
      els.progress.textContent = '文档已生成 · 截图已缓存';
    }
    els.loadingProgress.style.width = '100%';
    els.print.disabled = false;
    document.body.classList.add('is-complete');
  }

  function renderError(payload) {
    els.loading.hidden = false;
    els.loading.querySelector('strong').textContent = '完整产品文档生成失败';
    els.loading.querySelector('p').textContent = payload.message || '请返回画布后重试。';
    els.progress.textContent = '生成失败';
  }

  function handleMessage(event) {
    for (const [pageId, frame] of prototypeFrames) {
      const targetPageId = window.ProtoDockNavigation?.pageIdFromMessage?.(
        event,
        frame,
        navigationManifest
      );
      if (targetPageId) {
        navigatePrototype(pageId, targetPageId);
        return;
      }
      const backAction = window.ProtoDockNavigation?.backActionFromMessage?.(
        event,
        frame,
        navigationManifest
      );
      if (backAction) {
        backPrototype(backAction.fallbackPageId);
        return;
      }
    }
    if (!channel && event.source !== window.opener) {
      return;
    }
    const message = event.data || {};
    if (message.type !== MESSAGE_EVENT || message.sessionId !== sessionId) {
      return;
    }
    if (message.action === 'start') {
      renderStart(message.payload);
    } else if (message.action === 'page') {
      renderPage(message.payload);
    } else if (message.action === 'progress') {
      renderProgress(message.payload);
    } else if (message.action === 'complete') {
      renderComplete(message.payload);
    } else if (message.action === 'error') {
      renderError(message.payload);
    }
  }

  window.addEventListener('message', handleMessage);
  channel?.addEventListener('message', handleMessage);

  els.print.addEventListener('click', () => window.print());
  els.returnToCanvas.addEventListener('click', returnToCanvas);
  els.toggleOutline.addEventListener('click', () => {
    const open = document.body.classList.toggle('is-outline-open');
    els.toggleOutline.setAttribute('aria-expanded', String(open));
  });
  els.outlineNavigation.addEventListener('click', (event) => {
    const pageLink = event.target.closest('[data-outline-page]');
    if (pageLink) {
      activePageId = pageLink.dataset.outlinePage;
    }
    document.body.classList.remove('is-outline-open');
    els.toggleOutline.setAttribute('aria-expanded', 'false');
  });
  els.closeImagePreview.addEventListener('click', closeImagePreview);
  els.imagePreview.addEventListener('click', (event) => {
    if (event.target === els.imagePreview) {
      closeImagePreview();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeImagePreview();
      document.body.classList.remove('is-outline-open');
      els.toggleOutline.setAttribute('aria-expanded', 'false');
    }
  });
  window.addEventListener('beforeunload', () => {
    prototypeObserver?.disconnect();
    presentation?.destroy();
    screenshotUrls.forEach((url) => URL.revokeObjectURL(url));
    channel?.close();
  });

  if ((window.opener || channel) && sessionId) {
    postReady();
    readyTimer = window.setInterval(() => {
      if (started) {
        window.clearInterval(readyTimer);
        return;
      }
      postReady();
    }, 500);
  } else {
    renderError({ message: '请从 ProtoDock 画布顶部的“完整产品文档”打开此页面。' });
  }
  window.lucide?.createIcons();
})();
