(() => {
  const MANIFEST_FILE = 'protodock.project.json';
  const MOBILE_QUERY = '(max-width: 640px)';
  const els = {
    app: document.querySelector('.preview-app'),
    projectTitle: document.getElementById('projectTitle'),
    pageTitle: document.getElementById('pageTitle'),
    canvasLink: document.getElementById('canvasLink'),
    downloadLink: document.getElementById('downloadLink'),
    stage: document.getElementById('previewStage'),
    shell: document.getElementById('previewShell'),
    prev: document.getElementById('prevPage'),
    next: document.getElementById('nextPage'),
    pageSelect: document.getElementById('pageSelect'),
    pageCounter: document.getElementById('pageCounter')
  };

  const devicePresets = {
    'web-landscape': {
      label: 'Web 横版',
      shellClass: 'web web-landscape',
      width: 1440,
      height: 900
    },
    'web-portrait': {
      label: 'Web 竖版',
      shellClass: 'web web-portrait',
      width: 900,
      height: 1440
    },
    'iphone-portrait': {
      label: 'iPhone 14 Pro',
      shellClass: 'iphone iphone-portrait',
      deviceClass: 'device-iphone-14-pro device-black',
      width: 390,
      height: 830,
      frameWidth: 428,
      frameHeight: 868,
      safeTop: 59,
      safeBottom: 34
    },
    'iphone-landscape': {
      label: 'iPhone 横版',
      shellClass: 'iphone iphone-landscape',
      width: 844,
      height: 390
    },
    'ipad-portrait': {
      label: 'iPad Pro',
      shellClass: 'ipad ipad-portrait',
      deviceClass: 'device-ipad-pro device-spacegray',
      width: 506,
      height: 724,
      frameWidth: 560,
      frameHeight: 778,
      safeTop: 24,
      safeBottom: 20
    },
    'ipad-landscape': {
      label: 'iPad 横版',
      shellClass: 'ipad ipad-landscape',
      width: 1180,
      height: 820
    }
  };

  const state = {
    shareId: null,
    manifest: null,
    shareBaseUrl: null,
    pages: [],
    index: 0,
    preset: devicePresets['iphone-portrait'],
    shellKey: ''
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

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function clampSafeAreaInset(value, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.max(0, Math.min(240, number));
  }

  function safeAreaEnabled() {
    return state.manifest?.project?.safeAreaEnabled !== false;
  }

  function safeAreaDefaultsFor(preset = state.preset) {
    return {
      top: preset?.safeTop || 0,
      bottom: preset?.safeBottom || 0
    };
  }

  function configuredSafeAreaInsets(preset = state.preset) {
    const defaults = safeAreaDefaultsFor(preset);
    const project = state.manifest?.project || {};
    return {
      top: clampSafeAreaInset(project.safeAreaTop, defaults.top),
      bottom: clampSafeAreaInset(project.safeAreaBottom, defaults.bottom)
    };
  }

  function effectiveSafeAreaInsets(preset = state.preset) {
    if (!safeAreaEnabled()) {
      return { top: 0, bottom: 0 };
    }
    return configuredSafeAreaInsets(preset);
  }

  function safeAreaClassFor(preset = state.preset) {
    const safeArea = effectiveSafeAreaInsets(preset);
    return safeArea.top > 0 || safeArea.bottom > 0 ? ' safe-area-on' : '';
  }

  function previewStyleFor(preset, previewWidth) {
    const width = preset.width || 390;
    const height = preset.height || 830;
    const frameWidth = preset.frameWidth || width;
    const frameHeight = preset.frameHeight || height;
    const safeArea = effectiveSafeAreaInsets(preset);
    const scale = previewWidth / frameWidth;
    const viewportWidth = frameWidth * scale;
    const viewportHeight = frameHeight * scale;
    return [
      `--preview-width:${width}px`,
      `--preview-height:${height}px`,
      `--device-frame-width:${frameWidth}px`,
      `--device-frame-height:${frameHeight}px`,
      `--safe-top:${safeArea.top}px`,
      `--safe-bottom:${safeArea.bottom}px`,
      `--preview-scale:${scale.toFixed(5)}`,
      `--viewport-width:${viewportWidth.toFixed(2)}px`,
      `--viewport-height:${viewportHeight.toFixed(2)}px`
    ].join(';');
  }

  function desktopPreviewStyleFor(preset) {
    const frameWidth = preset.frameWidth || preset.width || 390;
    const frameHeight = preset.frameHeight || preset.height || 830;
    const stageRect = els.stage?.getBoundingClientRect();
    const availableWidth = Math.max(240, (stageRect?.width || frameWidth) - 48);
    const availableHeight = Math.max(240, (stageRect?.height || frameHeight) - 48);
    const scale = Math.min(1, availableWidth / frameWidth, availableHeight / frameHeight);
    return previewStyleFor(preset, Math.round(frameWidth * scale));
  }

  function isMobileLayout() {
    return window.matchMedia(MOBILE_QUERY).matches;
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

  function frameMarkup() {
    return `
      <iframe class="preview-frame" id="prototypeFrame" title="原型预览"></iframe>
      <div class="preview-message" id="previewMessage" hidden>
        <strong id="messageTitle">无法加载</strong>
        <span id="messageText">分享项目不可用</span>
      </div>
    `;
  }

  function deviceChromeMarkup(preset) {
    return `
      <div class="preview-device-viewport">
        <div class="preview-device device ${escapeHtml(preset.deviceClass)}">
          <div class="device-frame">
            <div class="device-screen">
              ${frameMarkup()}
            </div>
          </div>
          <div class="device-stripe"></div>
          <div class="device-header"></div>
          <div class="device-sensors"></div>
          <div class="device-btns"></div>
          <div class="device-power"></div>
          <div class="device-home"></div>
        </div>
      </div>
    `;
  }

  function webChromeMarkup(preset, page) {
    return `
      <div class="shell-bar">
        <span>${escapeHtml(preset.label)}</span>
        <span>${escapeHtml(page?.entry || '未设置入口')}</span>
      </div>
      <div class="shell-viewport">
        <div class="preview-frame-stage">
          ${frameMarkup()}
        </div>
      </div>
    `;
  }

  function renderShell(page = null) {
    if (!els.shell) {
      return;
    }
    const preset = state.preset || devicePresets['iphone-portrait'];
    const mobile = isMobileLayout();
    const mode = mobile ? 'mobile' : (preset.deviceClass ? 'device' : 'web');
    const safeAreaClass = safeAreaClassFor(preset);
    const shellKey = [
      mode,
      state.manifest?.project?.devicePreset || '',
      safeAreaClass,
      mode === 'web' ? page?.entry || '' : ''
    ].join(':');

    els.app?.classList.toggle('is-mobile', mobile);
    els.app?.classList.toggle('is-desktop', !mobile);

    if (state.shellKey !== shellKey) {
      state.shellKey = shellKey;
      if (mode === 'mobile') {
        els.shell.className = 'preview-shell is-plain';
        els.shell.innerHTML = frameMarkup();
      } else if (mode === 'device') {
        els.shell.className = `preview-shell is-device-backed${safeAreaClass}`;
        els.shell.innerHTML = deviceChromeMarkup(preset);
      } else {
        els.shell.className = `preview-shell is-web-backed ${preset.shellClass || ''}`;
        els.shell.innerHTML = webChromeMarkup(preset, page);
      }
    }

    if (mode === 'mobile') {
      els.shell.removeAttribute('style');
    } else {
      els.shell.style.cssText = desktopPreviewStyleFor(preset);
    }
  }

  function frameElement() {
    return document.getElementById('prototypeFrame');
  }

  function messageElement() {
    return document.getElementById('previewMessage');
  }

  function showMessage(title, text) {
    renderShell(state.pages[state.index] || null);
    const titleElement = document.getElementById('messageTitle');
    const textElement = document.getElementById('messageText');
    const frame = frameElement();
    if (titleElement) {
      titleElement.textContent = title;
    }
    if (textElement) {
      textElement.textContent = text;
    }
    if (messageElement()) {
      messageElement().hidden = false;
    }
    if (frame) {
      frame.removeAttribute('src');
    }
  }

  function hideMessage() {
    if (messageElement()) {
      messageElement().hidden = true;
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
    renderShell(page);

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

    const frame = frameElement();
    if (frame) {
      const nextSrc = projectFileUrl(page.entry);
      if (frame.getAttribute('src') !== nextSrc) {
        frame.src = nextSrc;
      }
      frame.title = `${page.title || page.pageId} 预览`;
    }
    hideMessage();
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
    state.shellKey = '';
    renderOptions();
    renderCurrentPage();
  }

  els.prev?.addEventListener('click', () => goToPage(state.index - 1));
  els.next?.addEventListener('click', () => goToPage(state.index + 1));
  els.pageSelect?.addEventListener('change', (event) => goToPage(event.target.value));
  window.addEventListener('resize', () => renderCurrentPage());
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      goToPage(state.index - 1);
    } else if (event.key === 'ArrowRight') {
      goToPage(state.index + 1);
    }
  });

  renderShell(null);
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
