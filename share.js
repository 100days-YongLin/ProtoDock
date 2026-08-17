(() => {
  const els = {
    open: document.getElementById('openShareModal'),
    modal: document.getElementById('shareModal'),
    close: document.getElementById('closeShareModal'),
    product: document.getElementById('publishProductName'),
    version: document.getElementById('publishVersion'),
    branchPreview: document.getElementById('publishBranchPreview'),
    urlPreview: document.getElementById('publishUrlPreview'),
    syncGithub: document.getElementById('publishSyncGithub'),
    commitField: document.getElementById('publishCommitField'),
    commitMessage: document.getElementById('publishCommitMessage'),
    refreshGithub: document.getElementById('refreshGithubConfig'),
    githubRepo: document.getElementById('githubRepoText'),
    credentialTitle: document.getElementById('githubCredentialTitle'),
    credentialHelp: document.getElementById('githubCredentialHelp'),
    publicKey: document.getElementById('githubPublicKey'),
    copyKey: document.getElementById('copyGithubDeployKey'),
    autoPanel: document.getElementById('shareAutoPanel'),
    autoTitle: document.getElementById('shareAutoTitle'),
    autoDescription: document.getElementById('shareAutoDescription'),
    dropzone: document.getElementById('shareDropZone'),
    dropHint: document.getElementById('shareDropHint'),
    input: document.getElementById('shareFileInput'),
    choose: document.getElementById('chooseShareFile'),
    publish: document.getElementById('uploadShareFile'),
    status: document.getElementById('shareStatus'),
    progress: document.getElementById('shareProgress'),
    progressBar: document.getElementById('shareProgressBar'),
    progressText: document.getElementById('shareProgressText'),
    result: document.getElementById('shareResult'),
    shareUrl: document.getElementById('shareUrl'),
    branchUrl: document.getElementById('githubBranchUrl'),
    commitUrl: document.getElementById('githubCommitUrl'),
    fileName: document.getElementById('shareFileName')
  };

  let selectedFile = null;
  let isPublishing = false;
  let isLoadingConfig = false;
  let githubConfig = null;
  let formProjectId;
  let syncPreferenceApplied = false;
  let uploadEndpointPromise = null;
  const activeShareReference = window.ProtoDockShareReference?.fromLocation?.() || '';

  function appBaseUrl() {
    if (window.location.origin && window.location.origin !== 'null') {
      return `${window.location.origin}/`;
    }
    return new URL('./', window.location.href).toString();
  }

  function appUrl(path = '/') {
    const value = String(path || '/');
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      return value;
    }
    return new URL(value.replace(/^\/+/, ''), appBaseUrl()).toString();
  }

  function setStatus(message) {
    if (els.status) {
      els.status.textContent = message;
    }
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

  function publishReference() {
    return window.ProtoDockShareReference?.branch?.(els.product?.value, els.version?.value) || '';
  }

  function syncGithubEnabled() {
    return !!els.syncGithub?.checked && !!githubConfig?.configured;
  }

  function canPublish() {
    if (!uploadSource() || !publishReference() || isPublishing || isLoadingConfig) {
      return false;
    }
    if (!syncGithubEnabled()) {
      return true;
    }
    return !!String(els.commitMessage?.value || '').trim();
  }

  function initialBranchValue(value, fallback) {
    const text = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[._-]+|[._-]+$/g, '')
      .replace(/--+/g, '-')
      .slice(0, 48);
    return window.ProtoDockShareReference?.isValidBranchComponent?.(text) ? text : fallback;
  }

  function preparePublishTarget() {
    const state = protoDockState();
    const projectId = state.projectId || null;
    if (formProjectId === projectId) {
      return;
    }
    formProjectId = projectId;
    syncPreferenceApplied = false;
    const target = window.ProtoDockGithubPreferences?.getPushTarget?.(projectId) || {};
    if (els.product) {
      els.product.value = target.productName || '';
    }
    if (els.version) {
      els.version.value = target.version || '';
    }
    if (els.commitMessage) {
      els.commitMessage.value = '';
    }
    if (els.syncGithub) {
      els.syncGithub.checked = target.syncGithub !== false;
    }
  }

  function fillDefaults() {
    const state = protoDockState();
    if (els.product && !els.product.value) {
      els.product.value = initialBranchValue(state.projectName || state.projectId, 'prototype');
    }
    if (els.version && !els.version.value) {
      els.version.value = initialBranchValue(state.currentVersion, 'v1');
    }
    if (els.commitMessage && !els.commitMessage.value) {
      els.commitMessage.value = state.currentChangeDescription || `publish ${els.product?.value || 'prototype'} ${els.version?.value || 'v1'}`;
    }
  }

  function configStatusMessage() {
    if (githubConfig?.authMode === 'app') {
      const missing = [];
      if (!githubConfig.repoConfigured) missing.push('PROTODOCK_GITHUB_REPO');
      if (!githubConfig.appId) missing.push('PROTODOCK_GITHUB_APP_ID');
      if (!githubConfig.installationId) missing.push('PROTODOCK_GITHUB_INSTALLATION_ID');
      if (!githubConfig.privateKeyReady) missing.push('PEM 私钥');
      return missing.length ? `GitHub 尚未配置：${missing.join(' / ')}` : 'GitHub App 配置未完成';
    }
    return 'GitHub 尚未配置，当前只发布公开预览';
  }

  function renderGithubConfig() {
    if (els.githubRepo) {
      if (isLoadingConfig) {
        els.githubRepo.textContent = '正在读取服务器配置...';
      } else if (githubConfig?.repo) {
        els.githubRepo.textContent = githubConfig.repo;
      } else {
        els.githubRepo.textContent = '未配置固定仓库，仅发布公开预览';
      }
    }
    const mode = githubConfig?.authMode || 'deploy-key';
    if (els.credentialTitle) {
      els.credentialTitle.textContent = mode === 'app' ? 'GitHub App 凭据' : 'Deploy Key 公钥';
    }
    if (els.credentialHelp) {
      els.credentialHelp.textContent = mode === 'app'
        ? '服务端使用 GitHub App installation token 推送。'
        : '把公钥添加到固定仓库的 Deploy Keys，并开启写权限。';
    }
    if (els.publicKey) {
      if (isLoadingConfig) {
        els.publicKey.textContent = '正在读取认证配置...';
      } else if (mode === 'app') {
        els.publicKey.textContent = [
          `App ID: ${githubConfig?.appId || '未配置'}`,
          `Installation ID: ${githubConfig?.installationId || '未配置'}`,
          `PEM 私钥: ${githubConfig?.privateKeyReady ? '已配置' : '未配置'}`
        ].join('\n');
      } else {
        els.publicKey.textContent = githubConfig?.publicKey || githubConfig?.keyError || '暂未生成 Deploy Key 公钥';
      }
    }
    if (els.copyKey) {
      els.copyKey.hidden = mode === 'app';
      els.copyKey.disabled = !githubConfig?.publicKey || mode === 'app';
    }
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
      const dirtyText = state.dirty ? '发布前会先要求保存当前改动。' : '将读取页面、文档和素材。';
      els.autoDescription.textContent = `${state.projectDirectoryName || '本地项目'}：${dirtyText}`;
    }
    if (els.fileName && !selectedFile) {
      els.fileName.textContent = autoAvailable ? '也可以拖入项目 zip，改用手动上传' : '拖入项目 zip，或点击选择';
    }
    if (els.dropHint) {
      els.dropHint.textContent = autoAvailable
        ? '自动打包失败或想发布其他版本时，可以在这里选择 zip。'
        : 'ZIP 根目录必须直接包含 protodock.project.json、pages/ 和 docs/。';
    }
  }

  function updateState() {
    updatePackageSourceUi();
    const reference = publishReference();
    const sharePath = window.ProtoDockShareReference?.sharePath?.(reference) || '';
    if (els.branchPreview) {
      els.branchPreview.textContent = reference || '-';
    }
    if (els.urlPreview) {
      const url = sharePath ? appUrl(sharePath) : '';
      els.urlPreview.href = url || '#';
      els.urlPreview.textContent = url || '填写产品名和版本号后生成';
    }
    if (els.syncGithub) {
      els.syncGithub.disabled = isPublishing || isLoadingConfig || !githubConfig?.configured;
      if (githubConfig && !githubConfig.configured) {
        els.syncGithub.checked = false;
      }
    }
    if (els.commitMessage) {
      els.commitMessage.disabled = !syncGithubEnabled() || isPublishing;
    }
    els.commitField?.classList.toggle('is-disabled', !syncGithubEnabled());
    if (els.publish) {
      els.publish.disabled = !canPublish();
      const source = uploadSource() === 'auto' ? '打包并发布' : '上传并发布';
      els.publish.textContent = syncGithubEnabled() ? `${source}，同步 GitHub` : source;
    }
    if (els.choose) {
      els.choose.disabled = isPublishing;
    }
    if (els.refreshGithub) {
      els.refreshGithub.disabled = isPublishing || isLoadingConfig;
    }
    if (els.dropzone) {
      els.dropzone.setAttribute('aria-disabled', String(isPublishing));
    }
  }

  async function loadGithubConfig() {
    if (isLoadingConfig) {
      return;
    }
    isLoadingConfig = true;
    renderGithubConfig();
    updateState();
    try {
      const response = await fetch('/api/github/config', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || '无法读取 GitHub 配置');
      }
      githubConfig = payload;
      if (!syncPreferenceApplied && els.syncGithub) {
        els.syncGithub.checked = !!githubConfig.configured && els.syncGithub.checked;
        syncPreferenceApplied = true;
      }
      if (!githubConfig.configured) {
        setStatus(configStatusMessage());
      } else {
        setStatus('发布将更新公开预览，并同步到 GitHub 同名分支');
      }
    } catch (error) {
      githubConfig = null;
      if (els.syncGithub) {
        els.syncGithub.checked = false;
      }
      setStatus(`GitHub 配置读取失败，将只发布公开预览：${error.message || '无法连接服务器'}`);
    } finally {
      isLoadingConfig = false;
      renderGithubConfig();
      updateState();
    }
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
    if (progress.phase === 'zipping' || progress.phase === 'compressing') {
      setProgress(98, { indeterminate: true, label: '压缩中' });
      setStatus('正在生成发布包...');
    }
  }

  function parseJsonResponse(text) {
    try {
      return JSON.parse(text || '{}');
    } catch (error) {
      return {};
    }
  }

  function responseError(payload, responseText, fallback) {
    const details = Array.isArray(payload.details) ? payload.details.filter(Boolean).map(String) : [];
    const rawText = String(responseText || '').trim();
    const htmlText = rawText.startsWith('<')
      ? new DOMParser().parseFromString(rawText, 'text/html').body.textContent.replace(/\s+/g, ' ').trim()
      : '';
    const responseMessage = rawText && !rawText.startsWith('<') ? rawText : htmlText;
    const message = payload.error || responseMessage.slice(0, 1000) || fallback;
    const visibleDetails = details.filter((detail) => !message.includes(detail));
    return visibleDetails.length ? `${message} ${visibleDetails.join('；')}` : message;
  }

  function currentUploadEndpoint() {
    return appUrl('/api/publish');
  }

  function loadUploadEndpoint() {
    if (!uploadEndpointPromise) {
      uploadEndpointPromise = fetch('/api/upload/config', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : {})
        .then((payload) => {
          const candidate = String(payload.uploadUrl || '').trim();
          return /^https?:\/\//i.test(candidate) ? new URL(candidate).toString() : currentUploadEndpoint();
        })
        .catch(() => currentUploadEndpoint());
    }
    return uploadEndpointPromise;
  }

  function uploadArchive(body, endpoint) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', endpoint);
      request.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) {
          setProgress(0, { indeterminate: true });
          setStatus('正在上传发布包...');
          return;
        }
        if (event.loaded >= event.total) {
          setProgress(100, { indeterminate: true, label: syncGithubEnabled() ? '发布并推送中' : '发布中' });
          setStatus(syncGithubEnabled() ? '上传完成，正在更新预览并推送 GitHub...' : '上传完成，正在更新公开预览...');
          return;
        }
        const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
        setProgress(percent);
        setStatus(`正在上传 ${formatPercent(percent)}`);
      });
      request.addEventListener('load', () => {
        const payload = parseJsonResponse(request.responseText);
        if (request.status < 200 || request.status >= 300) {
          reject(new Error(responseError(payload, request.responseText, '发布失败')));
          return;
        }
        resolve(payload);
      });
      request.addEventListener('error', () => {
        const error = new Error('网络连接失败');
        error.isNetworkFailure = true;
        reject(error);
      });
      request.addEventListener('abort', () => reject(new Error('发布已取消')));
      request.send(body);
    });
  }

  function validationStatus(successMessage, warnings) {
    if (!warnings.length) {
      return successMessage;
    }
    const preview = warnings.slice(0, 3).map((warning) => String(warning || '').replace(/\s+/g, ' ').trim().slice(0, 120));
    const remaining = warnings.length - preview.length;
    const suffix = remaining > 0 ? `；另有 ${remaining} 项，请运行交付校验器查看完整结果` : '';
    return `${successMessage}；校验警告 ${warnings.length} 项：${preview.join('；')}${suffix}`;
  }

  function renderResult(payload) {
    const sharePath = payload.path || window.ProtoDockShareReference?.sharePath?.(payload.id);
    const shareUrl = sharePath ? appUrl(sharePath) : '';
    if (els.shareUrl) {
      els.shareUrl.href = shareUrl || '#';
      els.shareUrl.textContent = shareUrl ? `公开预览：${shareUrl}` : '公开预览地址生成失败';
    }
    const github = payload.github || null;
    if (els.branchUrl) {
      els.branchUrl.hidden = !github?.branchUrl;
      els.branchUrl.href = github?.branchUrl || '#';
      els.branchUrl.textContent = github?.branchUrl ? `GitHub 分支：${github.branch}` : '';
    }
    if (els.commitUrl) {
      els.commitUrl.hidden = !github?.commitUrl;
      els.commitUrl.href = github?.commitUrl || '#';
      els.commitUrl.textContent = github?.commitUrl ? `Commit：${github.commit}` : '';
    }
    if (els.result) {
      els.result.hidden = false;
    }
  }

  function selectFile(file) {
    if (isPublishing) {
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
    updateState();
    setStatus(selectedFile ? '已选择项目包，可以发布' : '请选择 .zip 项目压缩包');
  }

  async function publishProject() {
    const source = uploadSource();
    const reference = publishReference();
    if (!source || !reference || isPublishing) {
      setStatus(!source ? '请先打开本地项目或选择 zip' : '请检查产品名和版本号');
      return;
    }
    if (syncGithubEnabled() && !String(els.commitMessage?.value || '').trim()) {
      setStatus('同步到 GitHub 时必须填写提交说明');
      return;
    }

    isPublishing = true;
    updateState();
    resetProgress();
    if (els.result) {
      els.result.hidden = true;
    }
    setProgress(0);
    setStatus(source === 'auto' ? '准备打包当前项目...' : '准备上传项目包...');

    try {
      const archiveFile = source === 'auto'
        ? await window.ProtoDock.createShareArchive({ onProgress: setArchiveProgress })
        : selectedFile;
      const body = new FormData();
      body.append('archive', archiveFile, archiveFile.name || 'protodock-project.zip');
      body.append('productName', String(els.product.value || '').trim());
      body.append('version', String(els.version.value || '').trim());
      body.append('syncGithub', String(syncGithubEnabled()));
      body.append('commitMessage', String(els.commitMessage.value || '').trim());
      setProgress(0);
      setStatus('正在上传发布包...');
      const uploadEndpoint = await loadUploadEndpoint();
      let payload;
      try {
        payload = await uploadArchive(body, uploadEndpoint);
      } catch (error) {
        if (!error.isNetworkFailure || uploadEndpoint === currentUploadEndpoint()) {
          throw error;
        }
        setProgress(0);
        setStatus('高速通道不可用，正在切换普通通道...');
        payload = await uploadArchive(body, currentUploadEndpoint());
      }
      window.ProtoDockGithubPreferences?.setPushTarget?.(protoDockState().projectId, {
        productName: els.product.value,
        version: els.version.value,
        syncGithub: githubConfig?.configured ? !!els.syncGithub?.checked : true
      });
      setProgress(100);
      renderResult(payload);
      const githubMessage = payload.github
        ? (payload.github.action === 'unchanged' ? '，GitHub 分支内容无变化' : '，并已同步 GitHub')
        : '';
      const successMessage = payload.action === 'updated'
        ? `公开预览已更新${githubMessage}`
        : `公开预览已发布${githubMessage}`;
      const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
      if (warnings.length) {
        console.warn('ProtoDock publish validation warnings:', warnings);
      }
      setStatus(validationStatus(successMessage, warnings));
    } catch (error) {
      setStatus(`发布失败：${error.message || '服务器无法处理发布包'}`);
    } finally {
      isPublishing = false;
      updateState();
    }
  }

  async function copyDeployKey() {
    if (!githubConfig?.publicKey) {
      return;
    }
    try {
      await navigator.clipboard.writeText(githubConfig.publicKey);
      setStatus('Deploy Key 公钥已复制');
    } catch (error) {
      setStatus('当前浏览器不能直接复制，请手动选择公钥');
    }
  }

  function downloadActiveShare() {
    const path = window.ProtoDockShareReference?.downloadPath?.(activeShareReference);
    if (path) {
      window.location.href = appUrl(path);
    }
  }

  function configureDownloadMode() {
    if (!activeShareReference || !els.open) {
      return false;
    }
    els.open.querySelector('i')?.setAttribute('data-lucide', 'download');
    const label = els.open.querySelector('span');
    if (label) {
      label.textContent = '下载';
    }
    els.open.title = '下载项目包';
    els.open.setAttribute('aria-label', '下载项目包');
    els.open.addEventListener('click', downloadActiveShare);
    window.lucide?.createIcons();
    return true;
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
    preparePublishTarget();
    fillDefaults();
    resetProgress();
    els.modal.hidden = false;
    setStatus('正在读取 GitHub 配置...');
    renderGithubConfig();
    updateState();
    loadGithubConfig();
    window.lucide?.createIcons();
  }

  function closeModal() {
    if (!isPublishing && els.modal) {
      els.modal.hidden = true;
    }
  }

  if (!configureDownloadMode()) {
    els.open?.addEventListener('click', openModal);
  }
  [els.product, els.version, els.commitMessage].forEach((input) => input?.addEventListener('input', updateState));
  els.syncGithub?.addEventListener('change', () => {
    syncPreferenceApplied = true;
    updateState();
    setStatus(syncGithubEnabled() ? '发布将同步到 GitHub 同名分支' : '本次只发布公开预览');
  });
  els.refreshGithub?.addEventListener('click', loadGithubConfig);
  els.copyKey?.addEventListener('click', copyDeployKey);
  els.close?.addEventListener('click', closeModal);
  els.choose?.addEventListener('click', () => els.input?.click());
  els.input?.addEventListener('change', () => selectFile(els.input.files?.[0] || null));
  els.publish?.addEventListener('click', publishProject);
  els.modal?.addEventListener('click', (event) => {
    if (event.target === els.modal) {
      closeModal();
    }
  });
  els.dropzone?.addEventListener('click', () => {
    if (!isPublishing) {
      els.input?.click();
    }
  });
  els.dropzone?.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && !isPublishing) {
      event.preventDefault();
      els.input?.click();
    }
  });
  ['dragenter', 'dragover'].forEach((type) => {
    els.dropzone?.addEventListener(type, (event) => {
      event.preventDefault();
      if (!isPublishing) {
        els.dropzone.classList.add('drag-over');
      }
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    els.dropzone?.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove('drag-over');
    });
  });
  els.dropzone?.addEventListener('drop', (event) => {
    if (!isPublishing) {
      selectFile(event.dataTransfer?.files?.[0] || null);
    }
  });

  updateState();
})();
