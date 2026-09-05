(function initProtoDockWechatRuntime(global) {
  const config = global.__PROTODOCK_WECHAT__ || {};
  installPreviewClock(config.previewDate);
  const storage = new Map(Object.entries(config.storage || {}));
  const pageMap = config.pageMap || {};
  const fixtures = config.fixtures || {};
  const timers = new Set();
  const NATIVE_TAB_BAR_HEIGHT = 64;
  let appDefinition = null;
  let toastTimer = null;

  function installPreviewClock(value) {
    if (!value) return;
    const NativeDate = global.Date;
    const timestamp = NativeDate.parse(value);
    if (!Number.isFinite(timestamp)) {
      global.console.warn(`[ProtoDock WeChat] Invalid previewDate: ${value}`);
      return;
    }
    function PreviewDate(...args) {
      if (!new.target) return new NativeDate(timestamp).toString();
      return Reflect.construct(NativeDate, args.length ? args : [timestamp], new.target);
    }
    Object.setPrototypeOf(PreviewDate, NativeDate);
    Object.defineProperties(PreviewDate, {
      now: { configurable: true, value: () => timestamp },
      parse: { configurable: true, value: NativeDate.parse.bind(NativeDate) },
      UTC: { configurable: true, value: NativeDate.UTC.bind(NativeDate) },
      prototype: { value: NativeDate.prototype },
    });
    global.Date = PreviewDate;
  }

  function showVisibleToast(options = {}) {
    const title = String(options.title || '').trim();
    if (!title || !global.document?.documentElement) return;
    global.clearTimeout(toastTimer);
    global.document.querySelector('.protodock-wechat-toast')?.remove();
    const element = global.document.createElement('div');
    element.className = 'protodock-wechat-toast';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    element.textContent = title;
    global.document.documentElement.append(element);
    const duration = Math.min(10000, Math.max(800, Number(options.duration) || 1500));
    toastTimer = global.setTimeout(() => {
      element.remove();
      toastTimer = null;
    }, duration);
  }

  function later(callback, value) {
    const timer = global.setTimeout(() => {
      timers.delete(timer);
      callback?.(value);
    }, 0);
    timers.add(timer);
  }

  function result(options, value, failed = false) {
    later(failed ? options?.fail : options?.success, value);
    later(options?.complete, value);
  }

  function cleanRoute(url) {
    return String(url || '')
      .split('#')[0]
      .split('?')[0]
      .replace(/^\/+/, '')
      .replace(/\.(?:html?|wxml)$/i, '');
  }

  function pageIdForUrl(url) {
    const route = cleanRoute(url);
    return pageMap[route] || pageMap[`pages/${route}`] || null;
  }

  function isTabRoute() {
    const currentRoute = cleanRoute(config.route);
    return !!config.tabBar?.list?.some((item) => cleanRoute(item.pagePath) === currentRoute);
  }

  function tabBarInsetBottom() {
    if (!isTabRoute() || global.document?.documentElement?.dataset.protodockTabbarHidden === 'true') return 0;
    return NATIVE_TAB_BAR_HEIGHT;
  }

  function visibleViewportHeight(fullHeight = global.innerHeight) {
    return Math.max(0, Number(fullHeight || 0) - tabBarInsetBottom());
  }

  function windowMetrics() {
    const windowWidth = global.innerWidth;
    const windowHeight = visibleViewportHeight();
    return {
      windowWidth,
      windowHeight,
      screenWidth: windowWidth,
      screenHeight: global.innerHeight,
      pixelRatio: global.devicePixelRatio || 1,
      safeArea: { top: 0, left: 0, right: windowWidth, bottom: windowHeight, width: windowWidth, height: windowHeight },
    };
  }

  function navigate(url, replace = false) {
    const pageId = pageIdForUrl(url);
    if (pageId && global.ProtoDockPreview?.navigate) {
      global.ProtoDockPreview.navigate(pageId);
      return true;
    }
    if (pageId && global.parent !== global) {
      global.parent.postMessage({ type: 'protodock:navigate', pageId }, '*');
      return true;
    }
    if (pageId && config.entryUrls?.[pageId]) {
      global.location[replace ? 'replace' : 'assign'](config.entryUrls[pageId]);
      return true;
    }
    global.console.warn(`[ProtoDock WeChat] No page mapping for ${url}.`);
    return false;
  }

  function fixtureForRequest(options) {
    const method = String(options?.method || 'GET').toUpperCase();
    let pathname = String(options?.url || '');
    try {
      pathname = new URL(pathname, global.location.href).pathname;
    } catch (error) {
      pathname = pathname.split('?')[0];
    }
    return fixtures[`${method} ${pathname}`]
      ?? fixtures[pathname]
      ?? fixtures['*'];
  }

  function selectorQuery() {
    const requests = [];
    let scope = null;
    let selection = null;
    const enqueue = (fields, callback) => {
      requests.push({ ...selection, scope, fields, callback });
      return query;
    };
    const measure = (element, fields, virtualNode) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const value = {};
      if (fields.id) value.id = virtualNode?.id || element.id;
      if (fields.dataset) value.dataset = { ...(virtualNode?.dataset || element.dataset) };
      if (fields.size) Object.assign(value, { width: rect.width, height: rect.height });
      if (fields.rect) Object.assign(value, { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left });
      if (fields.scrollOffset) {
        const scroll = element.querySelector('.pd-scroll') || element;
        Object.assign(value, { scrollTop: scroll.scrollTop, scrollLeft: scroll.scrollLeft, scrollWidth: scroll.scrollWidth, scrollHeight: scroll.scrollHeight });
      }
      if (fields.node) value.node = element.matches('canvas') ? element : element.querySelector('canvas') || element;
      for (const name of fields.properties || []) value[name] = virtualNode?.data?.[name] ?? element[name];
      if (fields.computedStyle?.length) {
        const style = global.getComputedStyle(element);
        for (const name of fields.computedStyle) value[name] = style.getPropertyValue(name);
      }
      return value;
    };
    const execute = (request) => {
      if (request.viewport) {
        const value = {};
        if (request.fields.size) Object.assign(value, { width: global.innerWidth, height: visibleViewportHeight() });
        if (request.fields.rect) Object.assign(value, { top: 0, left: 0, right: global.innerWidth, bottom: visibleViewportHeight() });
        if (request.fields.scrollOffset) Object.assign(value, { scrollTop: global.scrollY, scrollLeft: global.scrollX });
        return value;
      }
      const virtualRoot = request.scope?._$?.getShadowRoot?.();
      const domRoot = request.scope?.querySelector ? request.scope : global.document;
      if (request.scope && !virtualRoot && domRoot === global.document) return request.all ? [] : null;
      const root = virtualRoot || domRoot;
      const nodes = request.all ? Array.from(root.querySelectorAll(request.selector)) : [root.querySelector(request.selector)];
      const results = nodes.map((node) => measure(virtualRoot ? node?.getBackendElement?.() : node, request.fields, virtualRoot ? node : null));
      return request.all ? results : results[0];
    };
    const query = {
      in(component) { scope = component; return query; },
      select(selector) { selection = { selector, all: false }; return query; },
      selectAll(selector) { selection = { selector, all: true }; return query; },
      selectViewport() { selection = { viewport: true }; return query; },
      boundingClientRect(callback) { return enqueue({ id: true, dataset: true, rect: true, size: true }, callback); },
      scrollOffset(callback) { return enqueue({ id: true, dataset: true, scrollOffset: true }, callback); },
      fields(fields, callback) { return enqueue(fields || {}, callback); },
      exec(callback) {
        const results = requests.splice(0).map((request) => {
          const value = execute(request);
          request.callback?.(value);
          return value;
        });
        callback?.(results);
        return query;
      },
    };
    return query;
  }

  const wxMock = {
    env: { USER_DATA_PATH: '/protodock-user-data' },
    nextTick(callback) { later(callback); },
    getWindowInfo() {
      return windowMetrics();
    },
    getSystemInfoSync() {
      return { ...windowMetrics(), platform: 'devtools', system: 'ProtoDock', model: 'ProtoDock Web Preview', statusBarHeight: 0 };
    },
    getMenuButtonBoundingClientRect() {
      return { top: 8, left: Math.max(0, global.innerWidth - 96), right: Math.max(0, global.innerWidth - 8), bottom: 40, width: 88, height: 32 };
    },
    getAccountInfoSync() { return { miniProgram: { appId: 'protodock-preview', envVersion: 'develop', version: 'preview' } }; },
    getStorageSync(key) { return storage.get(String(key)); },
    setStorageSync(key, value) { storage.set(String(key), value); },
    removeStorageSync(key) { storage.delete(String(key)); },
    clearStorageSync() { storage.clear(); },
    login(options) { result(options, { code: 'protodock-preview-code', errMsg: 'login:ok' }); },
    request(options) {
      const fixture = fixtureForRequest(options);
      if (fixture === undefined) {
        const failure = { errMsg: `request:fail no ProtoDock fixture for ${options?.method || 'GET'} ${options?.url || ''}` };
        global.console.warn(`[ProtoDock WeChat] ${failure.errMsg}`);
        result(options, failure, true);
        return { abort() {} };
      }
      const response = fixture && typeof fixture === 'object' && ('data' in fixture || 'statusCode' in fixture)
        ? { statusCode: 200, header: {}, ...fixture }
        : { statusCode: 200, header: {}, data: fixture };
      result(options, response);
      return { abort() {} };
    },
    uploadFile(options) {
      const fixture = fixtures['UPLOAD *'];
      if (fixture === undefined) {
        result(options, { errMsg: 'uploadFile:fail disabled in ProtoDock preview' }, true);
      } else {
        result(options, { statusCode: 200, data: JSON.stringify(fixture), errMsg: 'uploadFile:ok' });
      }
      return { abort() {}, onProgressUpdate() {} };
    },
    chooseMedia(options) { result(options, { tempFiles: [], type: 'image', errMsg: 'chooseMedia:ok' }); },
    scanCode(options) { result(options, { result: config.scanResult || '', scanType: 'QR_CODE', errMsg: 'scanCode:ok' }); },
    getSetting(options) { result(options, { authSetting: {}, subscriptionsSetting: {}, errMsg: 'getSetting:ok' }); },
    openSetting(options) { result(options, { authSetting: {}, subscriptionsSetting: {}, errMsg: 'openSetting:ok' }); },
    requestSubscribeMessage(options) {
      const response = Object.fromEntries((options?.tmplIds || []).map((id) => [id, 'accept']));
      result(options, { ...response, errMsg: 'requestSubscribeMessage:ok' });
    },
    showToast(options) {
      showVisibleToast(options);
      global.dispatchEvent(new CustomEvent('protodock:wechat-toast', { detail: options || {} }));
      result(options, { errMsg: 'showToast:ok' });
    },
    showModal(options) {
      const value = { confirm: true, cancel: false, content: '', errMsg: 'showModal:ok' };
      global.dispatchEvent(new CustomEvent('protodock:wechat-modal', { detail: options || {} }));
      result(options, value);
    },
    navigateTo(options) { const ok = navigate(options?.url); result(options, { errMsg: ok ? 'navigateTo:ok' : 'navigateTo:fail' }, !ok); },
    redirectTo(options) { const ok = navigate(options?.url, true); result(options, { errMsg: ok ? 'redirectTo:ok' : 'redirectTo:fail' }, !ok); },
    reLaunch(options) { const ok = navigate(options?.url, true); result(options, { errMsg: ok ? 'reLaunch:ok' : 'reLaunch:fail' }, !ok); },
    switchTab(options) { const ok = navigate(options?.url, true); result(options, { errMsg: ok ? 'switchTab:ok' : 'switchTab:fail' }, !ok); },
    navigateBack(options = {}) {
      if (global.ProtoDockPreview?.back) global.ProtoDockPreview.back(config.fallbackPageId || null);
      else if (global.parent !== global) global.parent.postMessage({ type: 'protodock:back', fallbackPageId: config.fallbackPageId || null }, '*');
      else global.history.back();
      result(options, { errMsg: 'navigateBack:ok' });
    },
    navigateToMiniProgram(options) { result(options, { errMsg: 'navigateToMiniProgram:fail unavailable in ProtoDock preview' }, true); },
    exitMiniProgram(options) { result(options, { errMsg: 'exitMiniProgram:ok' }); },
    previewMedia(options) { result(options, { errMsg: 'previewMedia:ok' }); },
    previewImage(options) { result(options, { errMsg: 'previewImage:ok' }); },
    getImageInfo(options) { result(options, { path: options?.src || '', width: 0, height: 0, errMsg: 'getImageInfo:ok' }); },
    createSelectorQuery: selectorQuery,
    pageScrollTo(options) { global.scrollTo({ top: Number(options?.scrollTop || 0), behavior: options?.duration ? 'smooth' : 'auto' }); result(options, { errMsg: 'pageScrollTo:ok' }); },
    stopPullDownRefresh(options) { result(options, { errMsg: 'stopPullDownRefresh:ok' }); },
    hideTabBar(options) { global.document.documentElement.dataset.protodockTabbarHidden = 'true'; result(options, { errMsg: 'hideTabBar:ok' }); },
    showTabBar(options) { delete global.document.documentElement.dataset.protodockTabbarHidden; result(options, { errMsg: 'showTabBar:ok' }); },
    getFileSystemManager() {
      return {
        readFile(options) { result(options, { errMsg: 'readFile:fail unavailable in ProtoDock preview' }, true); },
        writeFile(options) { result(options, { errMsg: 'writeFile:fail unavailable in ProtoDock preview' }, true); },
        unlink(options) { result(options, { errMsg: 'unlink:fail unavailable in ProtoDock preview' }, true); },
      };
    },
  };

  global.wx = Object.assign({}, global.wx || {}, wxMock, config.wxOverrides || {});
  global.App = global.App || ((definition = {}) => {
    appDefinition = definition;
    global.__PROTODOCK_WECHAT_APP__ = definition;
    return definition;
  });
  global.getApp = global.getApp || (() => appDefinition || global.__PROTODOCK_WECHAT_APP__ || { globalData: {} });
  global.getCurrentPages = global.getCurrentPages || (() => [{ route: config.route || '', options: config.query || {} }]);

  function mountTabBar() {
    const tabBar = config.tabBar;
    if (!isTabRoute() || global.document.querySelector('.protodock-wechat-tabbar')) return;
    const element = global.document.createElement('nav');
    element.className = 'protodock-wechat-tabbar';
    tabBar.list.forEach((item) => {
      const route = cleanRoute(item.pagePath);
      const active = route === cleanRoute(config.route);
      const button = global.document.createElement('button');
      button.type = 'button';
      button.className = active ? 'is-active' : '';
      button.dataset.route = route;
      const icon = global.document.createElement('img');
      icon.src = String(active ? item.selectedIconPath : item.iconPath).replace(/^\/+/, '');
      icon.alt = '';
      const label = global.document.createElement('span');
      label.textContent = item.text || '';
      button.append(icon, label);
      button.addEventListener('click', () => navigate(route, true));
      element.append(button);
    });
    global.setTimeout(() => {
      global.document.body.append(element);
      global.document.documentElement.dataset.protodockHasTabbar = 'true';
    }, 50);
  }

  function mountNativeNavBar() {
    const windowConfig = config.window || {};
    if (windowConfig.navigationStyle === 'custom' || global.document.querySelector('.protodock-wechat-navbar')) return;
    const currentRoute = cleanRoute(config.route);
    const isTabRoute = config.tabBar?.list?.some((item) => cleanRoute(item.pagePath) === currentRoute);
    const element = global.document.createElement('header');
    element.className = 'protodock-wechat-navbar';
    element.style.setProperty('--protodock-navbar-background', windowConfig.navigationBarBackgroundColor || '#000000');
    element.style.setProperty('--protodock-navbar-color', windowConfig.navigationBarTextStyle === 'black' ? '#111111' : '#ffffff');
    const status = global.document.createElement('div');
    status.className = 'protodock-wechat-navbar__status';
    const bar = global.document.createElement('div');
    bar.className = 'protodock-wechat-navbar__bar';
    if (!isTabRoute) {
      const back = global.document.createElement('button');
      back.type = 'button';
      back.className = 'protodock-wechat-navbar__back';
      back.setAttribute('aria-label', '返回');
      back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>返回</span>';
      back.addEventListener('click', () => wxMock.navigateBack({}));
      bar.append(back);
    }
    const title = global.document.createElement('strong');
    title.className = 'protodock-wechat-navbar__title';
    title.textContent = windowConfig.navigationBarTitleText || '';
    bar.append(title);
    element.append(status, bar);
    global.document.body.prepend(element);
    global.document.documentElement.dataset.protodockHasNavbar = 'true';
  }

  global.ProtoDockWechatRuntime = {
    cleanRoute,
    pageIdForUrl,
    navigate,
    mountNativeNavBar,
    mountTabBar,
    tabBarInsetBottom,
    visibleViewportHeight,
    startApp() {
      const app = global.getApp();
      if (!app || app.__protodockStarted) return;
      Object.defineProperty(app, '__protodockStarted', { value: true, configurable: true });
      app.onLaunch?.({ path: config.route || '', query: config.query || {}, scene: 1001 });
      app.onShow?.({ path: config.route || '', query: config.query || {}, scene: 1001 });
    },
    normalizeAsset(value) { return String(value || '').replace(/^\/+/, ''); },
  };
})(window);
