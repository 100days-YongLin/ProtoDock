(() => {
  const els = {
    open: document.getElementById('openShareModal'),
    modal: document.getElementById('shareModal'),
    close: document.getElementById('closeShareModal'),
    modeButtons: Array.from(document.querySelectorAll('[data-share-mode]')),
    updatePanel: document.getElementById('shareUpdatePanel'),
    updateList: document.getElementById('shareTargetList'),
    refreshTargets: document.getElementById('refreshShareTargets'),
    autoPanel: document.getElementById('shareAutoPanel'),
    autoTitle: document.getElementById('shareAutoTitle'),
    autoDescription: document.getElementById('shareAutoDescription'),
    dropzone: document.getElementById('shareDropZone'),
    dropHint: document.getElementById('shareDropHint'),
    input: document.getElementById('shareFileInput'),
    choose: document.getElementById('chooseShareFile'),
    upload: document.getElementById('uploadShareFile'),
    status: document.getElementById('shareStatus'),
    progress: document.getElementById('shareProgress'),
    progressBar: document.getElementById('shareProgressBar'),
    progressText: document.getElementById('shareProgressText'),
    result: document.getElementById('shareResult'),
    url: document.getElementById('shareUrl'),
    fileName: document.getElementById('shareFileName')
  };

  let selectedFile = null;
  let isUploading = false;
  let shareMode = 'create';
  let shareTargets = [];
  let selectedShareId = null;
  let isLoadingTargets = false;
  const activeShareId = shareIdFromLocation();

  function setStatus(message) {
    if (els.status) {
      els.status.textContent = message;
    }
  }

  function isValidShareId(value) {
    return /^[a-zA-Z0-9_-]{6,80}$/.test(value || '');
  }

  function shareIdFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const queryShareId = params.get('share');
    if (isValidShareId(queryShareId)) {
      return queryShareId;
    }
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 's' && isValidShareId(pathParts[1])) {
      return pathParts[1];
    }
    return null;
  }

  function downloadActiveShare() {
    if (!activeShareId) {
      return;
    }
    window.location.href = new URL(`/api/shares/${encodeURIComponent(activeShareId)}/download`, window.location.origin).toString();
  }

  function configureDownloadMode() {
    if (!activeShareId || !els.open) {
      return false;
    }
    const icon = els.open.querySelector('i');
    const label = els.open.querySelector('span');
    if (icon) {
      icon.setAttribute('data-lucide', 'download');
    }
    if (label) {
      label.textContent = '下载';
    }
    els.open.title = '下载项目包';
    els.open.setAttribute('aria-label', '下载项目包');
    els.open.addEventListener('click', downloadActiveShare);
    window.lucide?.createIcons();
    return true;
  }

  function formatPercent(value) {
    return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
  }

  function setProgress(value, options = {}) {
    if (!els.progress) {
      return;
    }
    const isIndeterminate = !!options.indeterminate;
    els.progress.hidden = false;
    els.progress.classList.toggle('is-indeterminate', isIndeterminate);
    if (els.progressBar) {
      els.progressBar.style.width = isIndeterminate ? '' : formatPercent(value);
    }
    if (els.progressText) {
      els.progressText.textContent = options.label || (isIndeterminate ? '处理中' : formatPercent(value));
    }
  }

  function resetProgress() {
    if (els.progress) {
      els.progress.hidden = true;
      els.progress.classList.remove('is-indeterminate');
    }
    if (els.progressBar) {
      els.progressBar.style.width = '0%';
    }
    if (els.progressText) {
      els.progressText.textContent = '0%';
    }
  }

  function protoDockState() {
    try {
      return window.ProtoDock?.getState?.() || {};
    } catch (error) {
      return {};
    }
  }

  function canAutoPackage() {
    return !!window.ProtoDock?.createShareArchive && !!protoDockState().canPackageProject;
  }

  function uploadSource() {
    if (selectedFile) {
      return 'manual';
    }
    return canAutoPackage() ? 'auto' : null;
  }

  function canUpload() {
    return !!uploadSource() && !isUploading && (shareMode !== 'update' || !!selectedShareId);
  }

  function updatePackageSourceUi() {
    const autoAvailable = canAutoPackage();
    const usingAuto = !selectedFile && autoAvailable;
    if (els.autoPanel) {
      els.autoPanel.hidden = !usingAuto;
    }
    if (els.autoTitle && usingAuto) {
      els.autoTitle.textContent = '自动打包当前项目';
    }
    if (els.autoDescription && usingAuto) {
      const state = protoDockState();
      const dirtyText = state.dirty ? '当前未保存的画布和文档改动也会进入分享包。' : '会读取当前本地项目目录里的页面、文档和素材。';
      els.autoDescription.textContent = `${state.projectDirectoryName || '本地项目'}：${dirtyText}`;
    }
    if (els.fileName && !selectedFile) {
      els.fileName.textContent = autoAvailable ? '也可以拖入项目 zip，改用手动上传' : '拖入项目 zip，或点击选择';
    }
    if (els.dropHint) {
      els.dropHint.textContent = autoAvailable
        ? '自动打包失败或想上传其他版本时，可以在这里选择 zip。'
        : '支持根目录直接包含 protodock.project.json，或外层包一层项目文件夹。';
    }
  }

  function updateUploadState() {
    updatePackageSourceUi();
    if (els.upload) {
      els.upload.disabled = !canUpload();
      const source = uploadSource();
      const verb = source === 'auto' ? '打包' : '上传';
      els.upload.textContent = shareMode === 'update' ? `${verb}并更新链接` : `${verb}并生成链接`;
    }
    if (els.choose) {
      els.choose.disabled = isUploading;
    }
    if (els.refreshTargets) {
      els.refreshTargets.disabled = isUploading || isLoadingTargets;
    }
    els.modeButtons.forEach((button) => {
      button.disabled = isUploading;
    });
    if (els.dropzone) {
      els.dropzone.setAttribute('aria-disabled', String(isUploading));
    }
  }

  function setUploading(uploading) {
    isUploading = uploading;
    updateUploadState();
  }

  function parseJsonResponse(text) {
    try {
      return JSON.parse(text || '{}');
    } catch (error) {
      return {};
    }
  }

  function uploadArchive(body) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', '/api/shares');

      request.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) {
          setProgress(0, { indeterminate: true });
          setStatus(shareMode === 'update' ? '正在上传更新包...' : '正在上传...');
          return;
        }
        if (event.loaded >= event.total) {
          setProgress(100, { indeterminate: true });
          setStatus(shareMode === 'update' ? '上传完成，服务器正在替换...' : '上传完成，服务器正在解压...');
          return;
        }
        const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
        setProgress(percent);
        setStatus(`正在上传 ${formatPercent(percent)}`);
      });

      request.addEventListener('load', () => {
        const payload = parseJsonResponse(request.responseText);
        if (request.status < 200 || request.status >= 300) {
          reject(new Error(payload.error || '上传失败'));
          return;
        }
        resolve(payload);
      });

      request.addEventListener('error', () => {
        reject(new Error('网络连接失败'));
      });

      request.addEventListener('abort', () => {
        reject(new Error('上传已取消'));
      });

      request.addEventListener('loadend', () => {
        if (request.status >= 200 && request.status < 300) {
          setProgress(100);
        }
      });

      request.send(body);
    });
  }

  function setArchiveProgress(progress = {}) {
    if (progress.phase === 'collecting') {
      setProgress(0, { indeterminate: true, label: '扫描中' });
      setStatus(progress.current ? `正在扫描项目文件：${progress.current} 个` : '正在扫描项目目录...');
      return;
    }
    if (progress.phase === 'reading') {
      const total = progress.total || 1;
      const percent = Math.min(95, Math.round((progress.current / total) * 95));
      setProgress(percent, { label: `${progress.current}/${progress.total}` });
      setStatus(`正在打包 ${progress.current}/${progress.total}`);
      return;
    }
    if (progress.phase === 'zipping') {
      setProgress(98, { indeterminate: true, label: '压缩中' });
      setStatus('正在生成 zip...');
    }
  }

  function shareUrlFromPayload(payload) {
    const path = payload.path || (payload.id ? `/s/${encodeURIComponent(payload.id)}` : payload.url || '');
    if (!path) {
      return '';
    }
    return new URL(path, window.location.href).toString();
  }

  function shareUrlForItem(item) {
    const path = item.path || (item.id ? `/s/${encodeURIComponent(item.id)}` : item.url || '');
    if (!path) {
      return '';
    }
    return new URL(path, window.location.href).toString();
  }

  function renderShareTargets() {
    if (!els.updateList) {
      return;
    }
    els.updateList.textContent = '';
    if (isLoadingTargets) {
      const empty = document.createElement('div');
      empty.className = 'share-target-empty';
      empty.textContent = '正在读取公开预览...';
      els.updateList.append(empty);
      return;
    }
    if (!shareTargets.length) {
      const empty = document.createElement('div');
      empty.className = 'share-target-empty';
      empty.textContent = '暂无可更新的公开预览';
      els.updateList.append(empty);
      return;
    }

    shareTargets.forEach((item) => {
      const button = document.createElement('button');
      button.className = 'share-target-item';
      button.type = 'button';
      button.dataset.shareId = item.id || '';
      button.setAttribute('aria-pressed', String(item.id === selectedShareId));
      if (item.id === selectedShareId) {
        button.classList.add('is-selected');
      }

      const name = document.createElement('strong');
      name.textContent = item.name || '未命名项目';
      const url = document.createElement('span');
      url.textContent = shareUrlForItem(item);
      button.append(name, url);
      els.updateList.append(button);
    });
  }

  async function loadShareTargets(options = {}) {
    if (!els.updateList) {
      return;
    }
    isLoadingTargets = true;
    updateUploadState();
    renderShareTargets();
    try {
      const response = await fetch('/api/shares', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || '无法读取公开预览');
      }
      shareTargets = Array.isArray(payload.items) ? payload.items : [];
      const preferredId = options.preferredId || selectedShareId;
      selectedShareId = shareTargets.some((item) => item.id === preferredId) ? preferredId : null;
    } catch (error) {
      console.warn('ProtoDock: unable to load share targets', error);
      shareTargets = [];
      selectedShareId = null;
      setStatus(`读取公开预览失败：${error.message || '无法连接服务器'}`);
    } finally {
      isLoadingTargets = false;
      renderShareTargets();
      updateUploadState();
    }
  }

  function setMode(mode) {
    if (isUploading) {
      return;
    }
    shareMode = mode === 'update' ? 'update' : 'create';
    els.modeButtons.forEach((button) => {
      const active = button.dataset.shareMode === shareMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (els.updatePanel) {
      els.updatePanel.hidden = shareMode !== 'update';
    }
    if (els.result) {
      els.result.hidden = true;
    }
    resetProgress();
    updateUploadState();
    if (shareMode === 'update') {
      setStatus(selectedShareId ? '已选择公开预览，可上传 zip 更新原链接' : '请选择要更新的公开预览');
      if (!shareTargets.length && !isLoadingTargets) {
        loadShareTargets();
      }
      return;
    }
    if (selectedFile) {
      setStatus('新建模式：点击上传生成新链接');
      return;
    }
    setStatus(canAutoPackage() ? '将自动打包当前项目，点击即可生成分享链接' : '等待上传项目压缩包');
  }

  function selectShareTarget(shareId) {
    if (isUploading || !isValidShareId(shareId)) {
      return;
    }
    selectedShareId = shareId;
    renderShareTargets();
    updateUploadState();
    const item = shareTargets.find((target) => target.id === selectedShareId);
    setStatus(item ? `将更新：${item.name || selectedShareId}` : '已选择公开预览');
  }

  function openModal() {
    if (!els.modal) {
      return;
    }
    selectedFile = null;
    if (els.input) {
      els.input.value = '';
    }
    if (els.result) {
      els.result.hidden = true;
    }
    resetProgress();
    els.modal.hidden = false;
    setMode('create');
    window.lucide?.createIcons();
  }

  function closeModal() {
    if (els.modal) {
      els.modal.hidden = true;
    }
  }

  function selectFile(file) {
    if (isUploading) {
      return;
    }
    selectedFile = file && file.name.toLowerCase().endsWith('.zip') ? file : null;
    if (els.fileName) {
      els.fileName.textContent = selectedFile ? file.name : '拖入项目 zip，或点击选择';
    }
    if (els.result) {
      els.result.hidden = true;
    }
    resetProgress();
    updateUploadState();
    if (!selectedFile) {
      setStatus('请选择 .zip 项目压缩包');
      return;
    }
    setStatus(shareMode === 'update'
      ? (selectedShareId ? '已选择压缩包，点击上传更新链接' : '已选择压缩包，请选择要更新的公开预览')
      : '已选择压缩包，点击上传生成链接');
  }

  async function uploadFile() {
    const source = uploadSource();
    if (!source || !els.upload || isUploading) {
      return;
    }
    if (shareMode === 'update' && !selectedShareId) {
      setStatus('请选择要更新的公开预览');
      return;
    }

    setUploading(true);
    setProgress(0);
    setStatus(source === 'auto' ? '准备打包当前项目...' : (shareMode === 'update' ? '准备更新...' : '准备上传...'));
    const body = new FormData();
    try {
      const archiveFile = source === 'auto'
        ? await window.ProtoDock.createShareArchive({ onProgress: setArchiveProgress })
        : selectedFile;
      body.append('archive', archiveFile, archiveFile.name || 'protodock-project.zip');
      if (shareMode === 'update') {
        body.append('shareId', selectedShareId);
      }
      setProgress(0);
      setStatus(shareMode === 'update' ? '正在上传更新包...' : '正在上传...');
      const payload = await uploadArchive(body);
      setProgress(100);
      const shareUrl = shareUrlFromPayload(payload);
      if (els.url) {
        els.url.href = shareUrl;
        els.url.textContent = shareUrl;
      }
      if (els.result) {
        els.result.hidden = false;
      }
      setStatus(payload.action === 'updated' ? '公开预览已更新，原链接继续有效' : '分享链接已生成');
      if (payload.action === 'updated') {
        await loadShareTargets({ preferredId: payload.id });
      }
    } catch (error) {
      setStatus(`上传失败：${error.message || '服务器无法处理压缩包'}`);
    } finally {
      setUploading(false);
    }
  }

  if (!configureDownloadMode()) {
    els.open?.addEventListener('click', openModal);
  }
  els.close?.addEventListener('click', closeModal);
  els.modeButtons.forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.shareMode));
  });
  els.refreshTargets?.addEventListener('click', () => loadShareTargets());
  els.updateList?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-share-id]');
    if (item?.dataset.shareId) {
      selectShareTarget(item.dataset.shareId);
    }
  });
  els.choose?.addEventListener('click', () => els.input?.click());
  els.dropzone?.addEventListener('click', () => {
    if (!isUploading) {
      els.input?.click();
    }
  });
  els.dropzone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isUploading) {
        els.input?.click();
      }
    }
  });
  els.input?.addEventListener('change', () => selectFile(els.input.files?.[0] || null));
  els.upload?.addEventListener('click', uploadFile);
  els.modal?.addEventListener('click', (event) => {
    if (event.target === els.modal) {
      closeModal();
    }
  });
  ['dragenter', 'dragover'].forEach((type) => {
    els.dropzone?.addEventListener(type, (event) => {
      event.preventDefault();
      if (isUploading) {
        return;
      }
      els.dropzone.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    els.dropzone?.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove('drag-over');
    });
  });
  els.dropzone?.addEventListener('drop', (event) => {
    if (isUploading) {
      return;
    }
    selectFile(event.dataTransfer?.files?.[0] || null);
  });

  setMode('create');
})();
