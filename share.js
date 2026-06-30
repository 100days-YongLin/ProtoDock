(() => {
  const els = {
    open: document.getElementById('openShareModal'),
    modal: document.getElementById('shareModal'),
    close: document.getElementById('closeShareModal'),
    dropzone: document.getElementById('shareDropZone'),
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

  function setUploading(uploading) {
    isUploading = uploading;
    if (els.upload) {
      els.upload.disabled = uploading || !selectedFile;
    }
    if (els.choose) {
      els.choose.disabled = uploading;
    }
    if (els.dropzone) {
      els.dropzone.setAttribute('aria-disabled', String(uploading));
    }
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
          setStatus('正在上传...');
          return;
        }
        if (event.loaded >= event.total) {
          setProgress(100, { indeterminate: true });
          setStatus('上传完成，服务器正在解压...');
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

  function shareUrlFromPayload(payload) {
    const path = payload.path || (payload.id ? `/s/${encodeURIComponent(payload.id)}` : payload.url || '');
    if (!path) {
      return '';
    }
    return new URL(path, window.location.href).toString();
  }

  function openModal() {
    if (!els.modal) {
      return;
    }
    els.modal.hidden = false;
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
      els.fileName.textContent = selectedFile ? selectedFile.name : '拖入项目 zip，或点击选择';
    }
    if (els.upload) {
      els.upload.disabled = !selectedFile;
    }
    if (els.result) {
      els.result.hidden = true;
    }
    resetProgress();
    setStatus(selectedFile ? '已选择压缩包，点击上传生成链接' : '请选择 .zip 项目压缩包');
  }

  async function uploadFile() {
    if (!selectedFile || !els.upload || isUploading) {
      return;
    }
    setUploading(true);
    setProgress(0);
    setStatus('准备上传...');
    const body = new FormData();
    body.append('archive', selectedFile);
    try {
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
      setStatus('分享链接已生成');
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
})();
