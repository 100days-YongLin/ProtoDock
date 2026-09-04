(function bootstrapProtoDockWechat() {
  const bundle = window.ProtoDockWechatBundle;
  const config = window.__PROTODOCK_WECHAT__ || {};
  const glassEasel = window.glassEasel;
  if (!bundle?.codeSpace || !bundle?.initWithBackend || !glassEasel) {
    throw new Error('ProtoDock WeChat runtime did not initialize.');
  }

  const backendContext = new glassEasel.CurrentWindowBackendContext();
  bundle.registerGlobalEventListener(backendContext);
  const backend = bundle.initWithBackend(backendContext);
  const root = backend.createRoot('glass-easel-root', bundle.codeSpace, config.route);
  const placeholder = document.createElement('span');
  document.body.appendChild(placeholder);
  root.attach(document.body, placeholder);
  window.ProtoDockWechatRuntime?.startApp();
  window.ProtoDockWechatRuntime?.mountTabBar();
  window.__PROTODOCK_WECHAT_ROOT__ = root;
})();
