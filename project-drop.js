(function (global) {
  function fileItems(dataTransfer) {
    return Array.from(dataTransfer?.items || []).filter((item) => item.kind === 'file');
  }

  function isFileDrag(dataTransfer) {
    return Array.from(dataTransfer?.types || []).includes('Files') || fileItems(dataTransfer).length > 0;
  }

  async function directoryHandleFromDataTransfer(dataTransfer) {
    const items = fileItems(dataTransfer);
    if (!items.length) {
      throw new Error('请拖入一个 ProtoDock 项目文件夹');
    }

    const handles = [];
    let legacyDirectoryDetected = false;
    for (const item of items) {
      if (typeof item.getAsFileSystemHandle === 'function') {
        const handle = await item.getAsFileSystemHandle();
        if (handle) {
          handles.push(handle);
        }
        continue;
      }
      const entry = item.webkitGetAsEntry?.();
      legacyDirectoryDetected ||= !!entry?.isDirectory;
    }

    if (!handles.length && legacyDirectoryDetected) {
      throw new Error('当前浏览器不能直接读取拖入的文件夹，请点击“打开本地项目”选择目录');
    }
    if (handles.length !== 1 || handles[0].kind !== 'directory') {
      throw new Error('请只拖入一个项目文件夹，不要拖入文件或多个目录');
    }
    return handles[0];
  }

  async function ensureReadWritePermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') {
      return true;
    }
    const options = { mode: 'readwrite' };
    if (await handle.queryPermission(options) === 'granted') {
      return true;
    }
    if (typeof handle.requestPermission !== 'function') {
      return false;
    }
    return await handle.requestPermission(options) === 'granted';
  }

  function bindDirectoryDropTarget(target, options = {}) {
    if (!target) {
      return () => {};
    }
    let dragDepth = 0;

    function resetDragState() {
      dragDepth = 0;
      target.classList.remove('is-drag-over');
    }

    function onDragEnter(event) {
      if (!isFileDrag(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      dragDepth += 1;
      target.classList.add('is-drag-over');
      options.onState?.('dragging');
    }

    function onDragOver(event) {
      if (!isFileDrag(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }

    function onDragLeave(event) {
      if (!dragDepth) {
        return;
      }
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) {
        target.classList.remove('is-drag-over');
        options.onState?.('idle');
      }
    }

    async function onDrop(event) {
      if (!isFileDrag(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      resetDragState();
      options.onState?.('loading');
      try {
        const handle = await directoryHandleFromDataTransfer(event.dataTransfer);
        await options.onDirectory?.(handle);
        options.onState?.('success', handle.name || '项目文件夹');
      } catch (error) {
        options.onState?.('error', error?.message || '无法读取拖入的项目文件夹');
      }
    }

    target.addEventListener('dragenter', onDragEnter);
    target.addEventListener('dragover', onDragOver);
    target.addEventListener('dragleave', onDragLeave);
    target.addEventListener('drop', onDrop);

    return () => {
      target.removeEventListener('dragenter', onDragEnter);
      target.removeEventListener('dragover', onDragOver);
      target.removeEventListener('dragleave', onDragLeave);
      target.removeEventListener('drop', onDrop);
    };
  }

  global.ProtoDockProjectDrop = {
    bindDirectoryDropTarget,
    directoryHandleFromDataTransfer,
    ensureReadWritePermission,
    isFileDrag
  };
})(typeof window !== 'undefined' ? window : globalThis);
