const assert = require('node:assert/strict');

require('../project-drop.js');

const { directoryHandleFromDataTransfer, ensureReadWritePermission, isFileDrag } = globalThis.ProtoDockProjectDrop;

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

  console.log('project folder drop tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
