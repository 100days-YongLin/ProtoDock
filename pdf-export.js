(function initProtoDockPdfExport(global) {
  function delay(milliseconds) {
    return new Promise((resolve) => global.setTimeout(resolve, milliseconds));
  }

  async function waitForReady(options = {}) {
    const fetchImpl = options.fetch || global.fetch?.bind(global);
    if (!fetchImpl || !options.statusUrl) {
      return { status: 'unavailable', payload: null };
    }
    const sleep = options.sleep || delay;
    const pollInterval = Math.max(250, Number(options.pollInterval || 1500));
    const maxWait = Math.max(pollInterval, Number(options.maxWait || 10 * 60 * 1000));
    const startedAt = Date.now();

    while (Date.now() - startedAt <= maxWait) {
      let response;
      try {
        response = await fetchImpl(options.statusUrl, { cache: 'no-store' });
      } catch (error) {
        return { status: 'unavailable', payload: null, error };
      }
      if (!response.ok) {
        return { status: 'unavailable', payload: null };
      }
      const payload = await response.json();
      const status = String(payload?.status || 'unavailable');
      options.onStatus?.(status, payload);
      if (status === 'ready') {
        return { status, payload };
      }
      if (status === 'failed' || status === 'unavailable') {
        return { status, payload };
      }
      await sleep(pollInterval);
    }
    return { status: 'timeout', payload: null };
  }

  global.ProtoDockPdfExport = Object.freeze({ waitForReady });
})(typeof window !== 'undefined' ? window : globalThis);
