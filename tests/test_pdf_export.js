const assert = require('node:assert/strict');

global.window = global;
require('../pdf-export.js');

function response(payload, ok = true) {
  return {
    ok,
    async json() {
      return payload;
    }
  };
}

(async () => {
  const statuses = ['queued', 'generating', 'ready'];
  const observed = [];
  const result = await ProtoDockPdfExport.waitForReady({
    statusUrl: '/api/shares/pictale/v1/pdf/status',
    fetch: async () => response({ status: statuses.shift() }),
    sleep: async () => {},
    pollInterval: 250,
    maxWait: 5000,
    onStatus(status) {
      observed.push(status);
    }
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(observed, ['queued', 'generating', 'ready']);

  const failed = await ProtoDockPdfExport.waitForReady({
    statusUrl: '/api/shares/pictale/v1/pdf/status',
    fetch: async () => response({ status: 'failed', error: 'render failed' }),
    sleep: async () => {}
  });
  assert.equal(failed.status, 'failed');

  const unavailable = await ProtoDockPdfExport.waitForReady({
    statusUrl: '/api/shares/pictale/v1/pdf/status',
    fetch: async () => response({}, false)
  });
  assert.equal(unavailable.status, 'unavailable');

  console.log('pdf export tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
