(function installProtoDockBackBridge(global) {
  const documentRef = global.document;
  if (!documentRef || documentRef.__protoDockBackBridgeInstalled) {
    return;
  }
  documentRef.__protoDockBackBridgeInstalled = true;

  function backControlForEvent(event) {
    const pathControl = event.composedPath?.().find((item) => item?.matches?.('[data-protodock-back]'));
    if (pathControl) {
      return pathControl;
    }
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    return target?.closest?.('[data-protodock-back]') || null;
  }

  function requestBack(fallbackPageId = null) {
    const fallback = String(fallbackPageId || '').trim() || null;
    if (typeof global.ProtoDockPreview?.back === 'function') {
      global.ProtoDockPreview.back(fallback);
      return;
    }
    if (global.parent && global.parent !== global) {
      global.parent.postMessage({ type: 'protodock:back', fallbackPageId: fallback }, '*');
    }
  }

  documentRef.addEventListener('click', (event) => {
    const control = backControlForEvent(event);
    if (!control) {
      return;
    }
    event.preventDefault();
    requestBack(control.getAttribute('data-protodock-back'));
  });

  global.ProtoDockBackBridge = { back: requestBack };
})(window);
