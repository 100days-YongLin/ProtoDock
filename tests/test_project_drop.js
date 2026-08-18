const assert = require('node:assert/strict');

require('../project-drop.js');

const {
  directoryHandleFromDataTransfer,
  ensureReadWritePermission,
  isFileDrag,
  validateProjectDirectory
} = globalThis.ProtoDockProjectDrop;

function directoryTree(tree) {
  return {
    kind: 'directory',
    async getDirectoryHandle(name) {
      const value = tree[name];
      if (!value || typeof value !== 'object') {
        const error = new Error('missing');
        error.name = 'NotFoundError';
        throw error;
      }
      return directoryTree(value);
    },
    async getFileHandle(name) {
      if (tree[name] !== 'file') {
        const error = new Error('missing');
        error.name = 'NotFoundError';
        throw error;
      }
      return { kind: 'file', name };
    }
  };
}

function transferFor(handles) {
  return {
    types: ['Files'],
    items: handles.map((handle) => ({
      kind: 'file',
      async getAsFileSystemHandle() {
        return handle;
      }
    }))
  };
}

(async () => {
  const directory = { kind: 'directory', name: 'prototype' };
  assert.equal(isFileDrag(transferFor([directory])), true);
  assert.equal(await directoryHandleFromDataTransfer(transferFor([directory])), directory);

  await assert.rejects(
    directoryHandleFromDataTransfer(transferFor([{ kind: 'file', name: 'protodock.project.json' }])),
    /项目文件夹/
  );
  await assert.rejects(
    directoryHandleFromDataTransfer(transferFor([directory, { kind: 'directory', name: 'another' }])),
    /只拖入一个/
  );

  let requested = false;
  assert.equal(await ensureReadWritePermission({
    async queryPermission() { return 'prompt'; },
    async requestPermission(options) {
      requested = options.mode === 'readwrite';
      return 'granted';
    }
  }), true);
  assert.equal(requested, true);
  assert.equal(await ensureReadWritePermission({
    async queryPermission() { return 'denied'; },
    async requestPermission() { return 'denied'; }
  }), false);

  const manifest = {
    pages: {
      login: { entry: 'pages/login/index.html', doc: 'docs/login.md' }
    }
  };
  const complete = await validateProjectDirectory(directoryTree({
    pages: { login: { 'index.html': 'file' } },
    docs: { 'login.md': 'file' }
  }), manifest);
  assert.deepEqual(complete, { checkedCount: 2, missingPaths: [] });

  const incomplete = await validateProjectDirectory(directoryTree({
    'protodock.project.json': 'file'
  }), manifest);
  assert.deepEqual(incomplete.missingPaths, ['pages/login/index.html', 'docs/login.md']);

  console.log('project folder drop tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
