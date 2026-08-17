(function initProductDocumentView() {
  const READY_EVENT = 'protodock:product-document-ready';
  const MESSAGE_EVENT = 'protodock:product-document-message';
  const sessionId = new URLSearchParams(window.location.search).get('session') || '';
  const channel = sessionId && typeof window.BroadcastChannel === 'function'
    ? new window.BroadcastChannel(`protodock-prd-${sessionId}`)
    : null;
  const pageElements = new Map();
  const screenshotUrls = new Set();
  let readyTimer = null;
  let started = false;

  const els = {
    projectName: document.getElementById('documentProjectName'),
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

  function renderStart(payload) {
    started = true;
    window.clearInterval(readyTimer);
    const project = payload.project || {};
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    const pages = sections.flatMap((section) => section.pages || []);
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
    els.outlinePageCount.textContent = `${pages.length} 个页面`;
    els.loading.hidden = true;
    els.cover.hidden = false;
    els.progress.textContent = `正在生成 0 / ${pages.length}`;

    els.outlineNavigation.innerHTML = sections.map((section) => `
      <section class="outline-group">
        <a class="outline-group-link" href="#${escapeHtml(domId('group', section.id))}">${escapeHtml(section.title)}</a>
        ${(section.pages || []).map((page) => `<a href="#${escapeHtml(domId('page', page.id))}" data-outline-page="${escapeHtml(page.id)}"><span>${escapeHtml(page.title)}</span><i></i></a>`).join('')}
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
              <figure class="prototype-shot">
                <div class="shot-placeholder"><i></i><span>正在生成原型截图</span></div>
              </figure>
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
  }

  function renderPage(payload) {
    const article = pageElements.get(payload.id);
    if (!article) {
      return;
    }
    const shot = article.querySelector('.prototype-shot');
    const markdownMount = article.querySelector('.product-markdown');
    shot.innerHTML = '';
    markdownMount.innerHTML = '';

    if (payload.screenshot instanceof Blob) {
      const url = URL.createObjectURL(payload.screenshot);
      screenshotUrls.add(url);
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
    } else {
      shot.innerHTML = `<div class="shot-error"><strong>截图暂不可用</strong><span>${escapeHtml(payload.captureError || '无法生成此页面截图')}</span></div>`;
    }

    renderMarkdown(markdownMount, payload.markdown);
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
  els.toggleOutline.addEventListener('click', () => {
    const open = document.body.classList.toggle('is-outline-open');
    els.toggleOutline.setAttribute('aria-expanded', String(open));
  });
  els.outlineNavigation.addEventListener('click', () => {
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
