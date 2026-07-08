(() => {
  const MANIFEST_FILE = 'protodock.project.json';
  const els = {
    projectTitle: document.getElementById('projectTitle'),
    pageTitle: document.getElementById('pageTitle'),
    canvasLink: document.getElementById('canvasLink'),
    downloadLink: document.getElementById('downloadLink'),
    stage: document.getElementById('previewStage'),
    shell: document.getElementById('previewShell'),
    frame: document.getElementById('prototypeFrame'),
    message: document.getElementById('previewMessage'),
    messageTitle: document.getElementById('messageTitle'),
    messageText: document.getElementById('messageText'),
    prev: document.getElementById('prevPage'),
    next: document.getElementById('nextPage'),
    pageSelect: document.getElementById('pageSelect'),
    pageCounter: document.getElementById('pageCounter')
  };

  const devicePresets = {
    'web-landscape': { label: 'Web 横版', width: 1440, height: 900 },
    'web-portrait': { label: 'Web 竖版', width: 900, height: 1440 },
    'iphone-portrait': { label: 'iPhone 14 Pro', width: 390, height: 830 },
    'iphone-landscape': { label: 'iPhone 横版', width: 844, height: 390 },
    'ipad-portrait': { label: 'iPad Pro', width: 506, height: 724 },
    'ipad-landscape': { label: 'iPad 横版', width: 1180, height: 820 }
  };

  const state = {
    shareId: null,
    manifest: null,
    shareBaseUrl: null,
    pages: [],
    index: 0,
    preset: devicePresets['iphone-portrait']
  };

  function isValidShareId(value) {
    return /^[a-zA-Z0-9_-]{6,80}$/.test(value || '');
  }

  function shareIdFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const queryShareId = params.get('share');
    if (isValidShareId(queryShareId)) {
      return queryShareId;
    }
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 's' && isValidShareId(pathParts[1])) {
      return pathParts[1];
    }
    return null;
  }

  function appUrl(path) {
    return new URL(path, window.location.origin || window.location.href).toString();
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
      pageId,
      title: page.title || pageId,
      kind: page.kind || '',
      tag: page.tag || '',
      entry: page.entry || `pages/${pageId}/index.html`
    };
  }

  function orderedPages(manifest) {
    const pages = manifest?.pages && typeof manifest.pages === 'object' ? manifest.pages : {};
    const nodes = Array.isArray(manifest?.canvas?.nodes) ? manifest.canvas.nodes : [];
    const ordered = [];
    const seen = new Set();

    nodes.forEach((node) => {
      const pageId = node?.pageId;
      if (!pageId || seen.has(pageId)) {
        return;
      }
      ordered.push(pageRecord(pageId, pages[pageId] || {}));
      seen.add(pageId);
    });

    Object.entries(pages).forEach(([pageId, page]) => {
      if (!seen.has(pageId)) {
        ordered.push(pageRecord(pageId, page || {}));
      }
    });

    return ordered;
  }

  function showMessage(title, text) {
    if (els.messageTitle) {
      els.messageTitle.textContent = title;
    }
    if (els.messageText) {
      els.messageText.textContent = text;
    }
    if (els.message) {
      els.message.hidden = false;
    }
    if (els.frame) {
      els.frame.removeAttribute('src');
    }
  }

  function hideMessage() {
    if (els.message) {
      els.message.hidden = true;
    }
  }

  function renderOptions() {
    if (!els.pageSelect) {
      return;
    }
    els.pageSelect.replaceChildren(...state.pages.map((page, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = page.title || page.pageId;
      return option;
    }));
  }

  function renderShellSize() {
    const preset = state.preset || devicePresets['iphone-portrait'];
    const stageRect = els.stage?.getBoundingClientRect();
    if (!stageRect || window.innerWidth <= 640) {
      els.shell?.style.removeProperty('width');
      els.shell?.style.removeProperty('height');
      return;
    }

    const scale = Math.min(
      stageRect.width / preset.width,
      stageRect.height / preset.height,
      1
    );
    const width = Math.max(240, Math.floor(preset.width * scale));
    const height = Math.max(240, Math.floor(preset.height * scale));
    if (els.shell) {
      els.shell.style.width = `${width}px`;
      els.shell.style.height = `${height}px`;
    }
  }

  function renderCurrentPage() {
    if (!state.pages.length) {
      showMessage('没有可预览页面', 'manifest 中没有找到 pages 或 canvas 节点。');
      if (els.pageCounter) {
        els.pageCounter.textContent = '0 / 0';
      }
      return;
    }

    state.index = Math.min(Math.max(state.index, 0), state.pages.length - 1);
    const page = state.pages[state.index];
    if (els.projectTitle) {
      els.projectTitle.textContent = state.manifest?.project?.name || 'ProtoDock 公开预览';
    }
    if (els.pageTitle) {
      const detail = page.kind ? `${page.title} · ${page.kind}` : page.title;
      els.pageTitle.textContent = detail;
    }
    if (els.pageCounter) {
      els.pageCounter.textContent = `${state.index + 1} / ${state.pages.length}`;
    }
    if (els.pageSelect) {
      els.pageSelect.value = String(state.index);
    }
    if (els.prev) {
      els.prev.disabled = state.index <= 0;
    }
    if (els.next) {
      els.next.disabled = state.index >= state.pages.length - 1;
    }
    if (els.frame) {
      els.frame.src = projectFileUrl(page.entry);
      els.frame.title = `${page.title || page.pageId} 预览`;
    }
    hideMessage();
    renderShellSize();
  }

  function goToPage(index) {
    const nextIndex = Number(index);
    if (!Number.isFinite(nextIndex)) {
      return;
    }
    state.index = Math.min(Math.max(nextIndex, 0), state.pages.length - 1);
    renderCurrentPage();
  }

  async function loadShare(shareId) {
    state.shareId = shareId;
    state.shareBaseUrl = appUrl(`/shares/${encodeURIComponent(shareId)}/`);
    if (els.canvasLink) {
      els.canvasLink.href = appUrl(`/s/${encodeURIComponent(shareId)}/canvas`);
    }
    if (els.downloadLink) {
      els.downloadLink.href = appUrl(`/api/shares/${encodeURIComponent(shareId)}/download`);
    }

    const response = await fetch(new URL(MANIFEST_FILE, state.shareBaseUrl), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('分享项目不存在或已被删除');
    }
    const manifest = await response.json();
    state.manifest = manifest;
    const presetId = manifest?.project?.devicePreset || 'iphone-portrait';
    state.preset = devicePresets[presetId] || devicePresets['iphone-portrait'];
    state.pages = orderedPages(manifest);
    state.index = 0;
    renderOptions();
    renderCurrentPage();
  }

  els.prev?.addEventListener('click', () => goToPage(state.index - 1));
  els.next?.addEventListener('click', () => goToPage(state.index + 1));
  els.pageSelect?.addEventListener('change', (event) => goToPage(event.target.value));
  window.addEventListener('resize', renderShellSize);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      goToPage(state.index - 1);
    } else if (event.key === 'ArrowRight') {
      goToPage(state.index + 1);
    }
  });

  const shareId = shareIdFromLocation();
  if (!shareId) {
    showMessage('分享链接无效', '请确认链接中包含有效的分享 ID。');
  } else {
    loadShare(shareId).catch((error) => {
      console.error(error);
      showMessage('无法加载公开预览', error.message || '分享项目不可用');
    });
  }

  window.lucide?.createIcons();
})();
