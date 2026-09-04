(function bootstrapProtoDockWechat() {
  const bundle = window.ProtoDockWechatBundle;
  const config = window.__PROTODOCK_WECHAT__ || {};
  const glassEasel = window.glassEasel;
  if (!bundle?.codeSpace || !bundle?.initWithBackend || !glassEasel) {
    throw new Error('ProtoDock WeChat runtime did not initialize.');
  }

  const acceptedAccessibilityWarnings = new Set(['ariaLabel', 'ariaBusy', 'ariaLive']);
  glassEasel.addGlobalWarningListener?.((message) => {
    const property = String(message || '').match(/^"([^"]+)" is not a valid property$/)?.[1];
    return property && acceptedAccessibilityWarnings.has(property) ? false : true;
  });

  const backendContext = new glassEasel.CurrentWindowBackendContext();
  bundle.registerGlobalEventListener(backendContext);
  const backend = bundle.initWithBackend(backendContext);
  const root = backend.createRoot('glass-easel-root', bundle.codeSpace, config.route);
  const placeholder = document.createElement('span');
  document.body.appendChild(placeholder);
  root.attach(document.body, placeholder);
  const bridgedControls = new WeakSet();
  const observedRoots = new WeakSet();
  const findWechatFormHost = (element) => {
    let current = element;
    while (current) {
      if (current.matches?.('wx-input, wx-textarea, wx-picker')) return current;
      const rootNode = current.getRootNode?.();
      current = current.parentElement || (rootNode instanceof ShadowRoot ? rootNode.host : null);
    }
    return null;
  };
  const bridgeFormControls = (rootNode = document) => {
    rootNode.querySelectorAll?.('input, textarea, select').forEach((element) => {
      if (bridgedControls.has(element)) return;
      bridgedControls.add(element);
      for (const eventName of ['input', 'change']) {
        element.addEventListener(eventName, (event) => {
          const value = element.value;
          window.setTimeout(() => {
            if (event.__protodockWechatHandled) return;
            const host = findWechatFormHost(element);
            (host?.__wxElement || element.__wxElement)?.triggerEvent?.(eventName, { value });
          }, 0);
        });
      }
    });
    rootNode.querySelectorAll?.('*').forEach((element) => {
      if (element.shadowRoot) bridgeFormControls(element.shadowRoot);
    });
    if (!observedRoots.has(rootNode)) {
      observedRoots.add(rootNode);
      new MutationObserver(() => bridgeFormControls(rootNode)).observe(rootNode, { childList: true, subtree: true });
    }
  };
  bridgeFormControls();
  for (const delay of [0, 50, 150, 300, 600]) {
    window.setTimeout(() => bridgeFormControls(), delay);
  }
  window.ProtoDockWechatRuntime?.startApp();
  const page = root.get();
  const runtimeCollections = config.runtimeCollections || Object.entries(config.runtimeFields || {}).map(([field, type]) => ({ path: [field], type }));
  runtimeCollections.forEach(({ path, type }) => {
    if (!Array.isArray(path) || !path.length) return;
    let owner = page;
    for (const segment of path.slice(0, -1)) {
      if (!owner[segment] || typeof owner[segment] !== 'object') owner[segment] = {};
      owner = owner[segment];
    }
    owner[path.at(-1)] = type === 'Set' ? new Set() : new Map();
  });
  page?.onLoad?.(config.query || {});
  root.getComponent()?.triggerPageLifetime?.('show', [{ path: config.route || '', query: config.query || {} }]);
  page?.onShow?.();
  page?.onReady?.();
  window.ProtoDockWechatRuntime?.mountTabBar();
  window.__PROTODOCK_WECHAT_ROOT__ = root;
})();
