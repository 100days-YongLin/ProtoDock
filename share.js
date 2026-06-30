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
    result: document.getElementById('shareResult'),
    url: document.getElementById('shareUrl'),
    fileName: document.getElementById('shareFileName')
  };

  let selectedFile = null;

  function setStatus(message) {
    if (els.status) {
      els.status.textContent = message;
    }
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
    setStatus(selectedFile ? '已选择压缩包，点击上传生成链接' : '请选择 .zip 项目压缩包');
  }

  async function uploadFile() {
    if (!selectedFile || !els.upload) {
      return;
    }
    els.upload.disabled = true;
    setStatus('正在上传并生成分享链接...');
    const body = new FormData();
    body.append('archive', selectedFile);
    try {
      const response = await fetch('/api/shares', {
        method: 'POST',
        body
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || '上传失败');
      }
      if (els.url) {
        els.url.href = payload.url;
        els.url.textContent = payload.url;
      }
      if (els.result) {
        els.result.hidden = false;
      }
      setStatus('分享链接已生成');
    } catch (error) {
      setStatus(`上传失败：${error.message || '服务器无法处理压缩包'}`);
      els.upload.disabled = false;
    }
  }

  els.open?.addEventListener('click', openModal);
  els.close?.addEventListener('click', closeModal);
  els.choose?.addEventListener('click', () => els.input?.click());
  els.dropzone?.addEventListener('click', () => els.input?.click());
  els.dropzone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      els.input?.click();
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
    selectFile(event.dataTransfer?.files?.[0] || null);
  });
})();
