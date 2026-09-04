(function initProtoDockWechatRuntime(global) {
  const config = global.__PROTODOCK_WECHAT__ || {};
  const storage = new Map(Object.entries(config.storage || {}));
  const pageMap = config.pageMap || {};
  const fixtures = config.fixtures || {};
  const timers = new Set();
  let appDefinition = null;

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
    const callbacks = [];
    const query = {
      in() { return query; },
      select() { return query; },
      selectAll() { return query; },
      boundingClientRect(callback) { callbacks.push(callback); return query; },
      scrollOffset(callback) { callbacks.push(callback); return query; },
      fields(_fields, callback) { callbacks.push(callback); return query; },
      exec(callback) {
        const empty = { width: 0, height: 0, top: 0, left: 0, scrollTop: 0, scrollLeft: 0 };
        callbacks.forEach((item) => item(empty));
        callback?.(callbacks.map(() => empty));
      },
    };
    return query;
  }

  const wxMock = {
    env: { USER_DATA_PATH: '/protodock-user-data' },
    nextTick(callback) { later(callback); },
    getWindowInfo() {
      return { windowWidth: global.innerWidth, windowHeight: global.innerHeight, pixelRatio: global.devicePixelRatio || 1, safeArea: { top: 0, left: 0, right: global.innerWidth, bottom: global.innerHeight, width: global.innerWidth, height: global.innerHeight } };
    },
    getSystemInfoSync() {
      return { windowWidth: global.innerWidth, windowHeight: global.innerHeight, pixelRatio: global.devicePixelRatio || 1, platform: 'devtools', system: 'ProtoDock', model: 'ProtoDock Web Preview', statusBarHeight: 0, safeArea: { top: 0, left: 0, right: global.innerWidth, bottom: global.innerHeight, width: global.innerWidth, height: global.innerHeight } };
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
    if (!tabBar?.list?.length || global.document.querySelector('.protodock-wechat-tabbar')) return;
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
    global.document.body.append(element);
    global.document.documentElement.dataset.protodockHasTabbar = 'true';
  }

  global.ProtoDockWechatRuntime = {
    cleanRoute,
    pageIdForUrl,
    navigate,
    mountTabBar,
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
