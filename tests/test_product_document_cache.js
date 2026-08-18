const assert = require('node:assert/strict');

global.window = global;
require('../product-document-cache.js');

function fileHandle(size, lastModified) {
  return {
    kind: 'file',
    async getFile() {
      return { size, lastModified };
    }
  };
}

function directoryHandle(entries) {
  return {
    kind: 'directory',
    async getDirectoryHandle(name) {
      const handle = entries[name];
      if (!handle || handle.kind !== 'directory') {
        const error = new Error('missing');
        error.name = 'NotFoundError';
        throw error;
      }
      return handle;
    },
    async *entries() {
      for (const entry of Object.entries(entries)) {
        yield entry;
      }
    }
  };
}

(async () => {
  const cache = ProtoDockProductDocumentCache.createScreenshotCache({ indexedDB: null });
  const screenshot = { type: 'image/png' };
  assert.equal(await cache.get('missing'), null);
  await cache.set('page-key', screenshot);
  assert.equal(await cache.get('page-key'), screenshot);

  const projectHandle = directoryHandle({
    assets: directoryHandle({ 'logo.png': fileHandle(120, 10) }),
    pages: directoryHandle({
      home: directoryHandle({ 'index.html': fileHandle(800, 20) })
    })
  });
  const session = ProtoDockProductDocumentCache.createProjectRevisionSession({
    projectId: 'demo',
    projectDirectoryName: 'demo-project',
    projectHandle
  });
  const page = { id: 'home', entry: 'pages/home/index.html' };
  const profile = { preset: 'iphone-portrait', safeTop: 59, safeBottom: 34 };
  const firstKey = await session.keyForPage(page, profile);
  const secondKey = await session.keyForPage(page, profile);
  assert.equal(firstKey, secondKey);

  const changedProject = directoryHandle({
    assets: directoryHandle({ 'logo.png': fileHandle(120, 11) }),
    pages: directoryHandle({
      home: directoryHandle({ 'index.html': fileHandle(800, 20) })
    })
  });
  const changedSession = ProtoDockProductDocumentCache.createProjectRevisionSession({
    projectId: 'demo',
    projectDirectoryName: 'demo-project',
    projectHandle: changedProject
  });
  assert.notEqual(await changedSession.keyForPage(page, profile), firstKey);

  let fetched = false;
  const shareSession = ProtoDockProductDocumentCache.createProjectRevisionSession({
    projectId: 'demo',
    shareId: 'immutable-share',
    manifestHash: 'revision-a',
    fetch: async () => {
      fetched = true;
      throw new Error('share cache should not fetch');
    }
  });
  assert.match(await shareSession.keyForPage(page, profile), /^prd-shot-v2:/);
  assert.equal(fetched, false);

  const updatedShareSession = ProtoDockProductDocumentCache.createProjectRevisionSession({
    projectId: 'demo',
    shareId: 'immutable-share',
    manifestHash: 'revision-b'
  });
  assert.notEqual(
    await updatedShareSession.keyForPage(page, profile),
    await shareSession.keyForPage(page, profile)
  );

  console.log('product document screenshot cache tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
