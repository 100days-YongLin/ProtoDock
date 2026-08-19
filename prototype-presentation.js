(function initProtoDockPresentation(global) {
  const PRESETS = {
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

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function presetFor(value) {
    return PRESETS[String(value || '').trim()] || PRESETS['iphone-portrait'];
  }

  function configuredSafeArea(project, preset) {
    const enabled = project?.safeAreaEnabled !== false;
    return {
      enabled,
      top: enabled ? Number(project?.safeAreaTop ?? preset.safeTop ?? 0) : 0,
      bottom: enabled ? Number(project?.safeAreaBottom ?? preset.safeBottom ?? 0) : 0
    };
  }

  function sourceWithSuffix(source = {}, suffix = '', baseUrl = global.location?.href || 'http://localhost/') {
    if (!source.src || !suffix) {
      return { ...source };
    }
    try {
      const target = new URL(source.src, baseUrl);
      const routed = new URL(suffix, target);
      target.search = routed.search;
      target.hash = routed.hash;
      return { ...source, src: target.toString() };
    } catch (error) {
      return { ...source };
    }
  }

  function firstAvailablePageId(pages, sourceForPage) {
    return (pages || []).find((page) => {
      const source = sourceForPage?.(page.id, page) || {};
      return !source.error && !!(source.src || source.srcdoc);
    })?.id || '';
  }

  function deviceMarkup(preset, safeArea) {
    return `
      <div class="presentation-device-viewport">
        <div class="presentation-device device ${escapeHtml(preset.deviceClass)}${safeArea.enabled ? ' safe-area-on' : ''}">
          <div class="device-frame"><div class="device-screen"><div class="presentation-frame-host"></div></div></div>
          <div class="device-stripe"></div><div class="device-header"></div>
          <div class="device-sensors"></div><div class="device-btns"></div>
          <div class="device-power"></div><div class="device-home"></div>
        </div>
      </div>
    `;
  }

  function browserMarkup() {
    return `
      <div class="presentation-browser-viewport">
        <div class="presentation-browser">
          <div class="presentation-browser-bar"><i></i><i></i><i></i></div>
          <div class="presentation-frame-host"></div>
        </div>
      </div>
    `;
  }

  function create(options = {}) {
    const trigger = options.trigger;
    const pages = Array.isArray(options.pages) ? options.pages : [];
    const pageById = new Map(pages.map((page) => [page.id, page]));
    const project = options.project || {};
    const manifest = options.manifest || { pages: {}, canvas: { nodes: [], edges: [] } };
    const preset = presetFor(project.devicePreset);
    const safeArea = configuredSafeArea(project, preset);
    const history = global.ProtoDockNavigation?.createPageHistory?.() || null;
    const frames = new Map();
    let activePageId = '';
    let resizeObserver = null;

    const root = document.createElement('section');
    root.className = 'prototype-presentation';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '全屏演示');
    root.innerHTML = `
      <button class="presentation-close" type="button" title="退出全屏演示" aria-label="退出全屏演示">
        <i data-lucide="x"></i>
      </button>
      <div class="presentation-stage">
        ${preset.deviceClass ? deviceMarkup(preset, safeArea) : browserMarkup()}
      </div>
      <div class="presentation-error" hidden><strong>原型不可用</strong><span></span></div>
    `;
    document.body.append(root);
    global.lucide?.createIcons();

    const stage = root.querySelector('.presentation-stage');
    const frameHost = root.querySelector('.presentation-frame-host');
    const error = root.querySelector('.presentation-error');
    const closeButton = root.querySelector('.presentation-close');

    function fit() {
      if (root.hidden || !stage) {
        return;
      }
      const availableWidth = Math.max(240, stage.clientWidth - 32);
      const availableHeight = Math.max(320, stage.clientHeight - 32);
      if (preset.deviceClass) {
        const viewport = root.querySelector('.presentation-device-viewport');
        const device = root.querySelector('.presentation-device');
        const scale = Math.min(1, availableWidth / preset.frameWidth, availableHeight / preset.frameHeight);
        viewport.style.setProperty('--presentation-scaled-width', `${preset.frameWidth * scale}px`);
        viewport.style.setProperty('--presentation-scaled-height', `${preset.frameHeight * scale}px`);
        device.style.setProperty('--presentation-scale', scale.toFixed(5));
        device.style.setProperty('--presentation-frame-width', `${preset.frameWidth}px`);
        device.style.setProperty('--presentation-frame-height', `${preset.frameHeight}px`);
        device.style.setProperty('--presentation-width', `${preset.width}px`);
        device.style.setProperty('--presentation-height', `${preset.height}px`);
        device.style.setProperty('--safe-top', `${safeArea.top}px`);
        device.style.setProperty('--safe-bottom', `${safeArea.bottom}px`);
        return;
      }
      const viewport = root.querySelector('.presentation-browser-viewport');
      const browser = root.querySelector('.presentation-browser');
      const chromeHeight = 34;
      const scale = Math.min(1, availableWidth / preset.width, availableHeight / (preset.height + chromeHeight));
      viewport.style.setProperty('--presentation-browser-scaled-width', `${preset.width * scale}px`);
      viewport.style.setProperty('--presentation-browser-scaled-height', `${(preset.height + chromeHeight) * scale}px`);
      browser.style.setProperty('--presentation-browser-scale', scale.toFixed(5));
      browser.style.setProperty('--presentation-browser-width', `${preset.width}px`);
      browser.style.setProperty('--presentation-browser-height', `${preset.height + chromeHeight}px`);
      browser.style.setProperty('--presentation-width', `${preset.width}px`);
      browser.style.setProperty('--presentation-height', `${preset.height}px`);
    }

    function sourceFor(pageId, suffix = '') {
      const page = pageById.get(pageId);
      const source = page ? options.sourceForPage?.(pageId, page) || {} : {};
      return sourceWithSuffix(source, suffix);
    }

    function setError(message = '') {
      error.hidden = !message;
      stage.hidden = !!message;
      error.querySelector('span').textContent = message;
    }

    function navigate(pageId, navigationOptions = {}) {
      const page = pageById.get(pageId);
      if (!page) {
        return false;
      }
      const source = sourceFor(pageId, navigationOptions.suffix || '');
      if (source.error || (!source.src && !source.srcdoc)) {
        setError(source.error || '该页面没有可操作入口。');
        return false;
      }
      if (activePageId && activePageId !== pageId && navigationOptions.remember !== false) {
        history?.push(activePageId);
      }
      setError('');
      frames.forEach((frame, framePageId) => {
        frame.hidden = framePageId !== pageId;
      });
      let frame = frames.get(pageId);
      if (!frame) {
        frame = document.createElement('iframe');
        frame.className = 'presentation-frame';
        frame.title = `${page.title || pageId}可操作原型`;
        frame.allow = 'clipboard-read; clipboard-write';
        frame.hidden = false;
        frameHost.append(frame);
        frames.set(pageId, frame);
        global.ProtoDockNavigation?.bindFrame?.(frame, {
          manifest,
          pageId,
          onNavigate(targetPageId, sourceType, navigation) {
            navigate(targetPageId, { suffix: navigation?.suffix || '' });
          },
          onBack(fallbackPageId) {
            const previous = history?.pop();
            navigate(previous?.index || fallbackPageId, {
              suffix: previous?.suffix || '',
              remember: false
            });
          }
        });
        if (source.srcdoc) {
          frame.srcdoc = source.srcdoc;
        } else {
          frame.src = source.src;
        }
      } else if (navigationOptions.suffix && source.src && frame.src !== source.src) {
        frame.src = source.src;
      }
      activePageId = pageId;
      options.onPageChange?.(pageId);
      return true;
    }

    function open(pageId = '') {
      const requestedSource = sourceFor(pageId);
      const targetPageId = pageById.has(pageId) && !requestedSource.error
        && (requestedSource.src || requestedSource.srcdoc)
        ? pageId
        : firstAvailablePageId(pages, options.sourceForPage);
      root.hidden = false;
      document.body.classList.add('is-presenting-prototype');
      fit();
      if (!navigate(targetPageId, { remember: false })) {
        setError('当前没有可操作的原型页面。');
      }
      closeButton.focus({ preventScroll: true });
    }

    function close() {
      root.hidden = true;
      document.body.classList.remove('is-presenting-prototype');
      trigger?.focus?.({ preventScroll: true });
    }

    function refresh() {
      const availablePageId = firstAvailablePageId(pages, options.sourceForPage);
      if (trigger) {
        trigger.disabled = !availablePageId;
        trigger.title = availablePageId ? '全屏演示可操作原型' : '正在准备可操作原型';
      }
      return availablePageId;
    }

    function handleMessage(event) {
      const frame = frames.get(activePageId);
      if (root.hidden || !frame) {
        return;
      }
      const messageType = String(event.data?.type || '');
      const directPageId = String(event.data?.pageId || '').trim();
      if (messageType === 'protodock:navigate' && pageById.has(directPageId)) {
        navigate(directPageId);
        return;
      }
      if (messageType === 'protodock:back') {
        const fallbackPageId = pageById.has(event.data?.fallbackPageId)
          ? event.data.fallbackPageId
          : null;
        const previous = history?.pop();
        navigate(previous?.index || fallbackPageId, {
          suffix: previous?.suffix || '',
          remember: false
        });
        return;
      }
      if (event.data?.type === 'protodock:frame-control') {
        const targetPageId = pageById.has(directPageId)
          ? directPageId
          : global.ProtoDockNavigation?.pageIdForHref?.(manifest, activePageId, event.data.href || '')
            || global.ProtoDockNavigation?.routeForLabel?.(
              global.ProtoDockNavigation.routesForPage(manifest, activePageId),
              event.data.label || ''
            );
        if (targetPageId) {
          navigate(targetPageId);
        }
        return;
      }
      if (event.source !== frame.contentWindow) {
        return;
      }
      const targetPageId = global.ProtoDockNavigation?.pageIdFromMessage?.(event, frame, manifest);
      if (targetPageId) {
        navigate(targetPageId);
        return;
      }
      const back = global.ProtoDockNavigation?.backActionFromMessage?.(event, frame, manifest);
      if (back) {
        const previous = history?.pop();
        navigate(previous?.index || back.fallbackPageId, {
          suffix: previous?.suffix || '',
          remember: false
        });
      }
    }

    function handleKeydown(event) {
      if (!root.hidden && event.key === 'Escape') {
        close();
      }
    }

    const handleTrigger = () => open(options.initialPageId?.() || activePageId);
    trigger?.addEventListener('click', handleTrigger);
    closeButton.addEventListener('click', close);
    global.addEventListener('message', handleMessage);
    document.addEventListener('keydown', handleKeydown);
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(fit);
      resizeObserver.observe(stage);
    }
    refresh();

    return {
      open,
      close,
      navigate,
      refresh,
      destroy() {
        close();
        resizeObserver?.disconnect();
        trigger?.removeEventListener('click', handleTrigger);
        global.removeEventListener('message', handleMessage);
        document.removeEventListener('keydown', handleKeydown);
        root.remove();
      }
    };
  }

  global.ProtoDockPresentation = Object.freeze({
    create,
    firstAvailablePageId,
    presetFor,
    sourceWithSuffix
  });
})(typeof window !== 'undefined' ? window : globalThis);
