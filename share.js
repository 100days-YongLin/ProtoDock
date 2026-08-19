(() => {
  const els = {
    open: document.getElementById('openShareModal'),
    modal: document.getElementById('shareModal'),
    close: document.getElementById('closeShareModal'),
    product: document.getElementById('publishProductName'),
    version: document.getElementById('publishVersion'),
    versionHint: document.getElementById('publishVersionHint'),
    targetSummary: document.querySelector('.publish-target-summary'),
    branchPreview: document.getElementById('publishBranchPreview'),
    tagPreview: document.getElementById('publishTagPreview'),
    urlPreview: document.getElementById('publishUrlPreview'),
    latestUrlPreview: document.getElementById('publishLatestUrlPreview'),
    githubMode: document.getElementById('publishGithubMode'),
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
    workspaceSnapshot: document.getElementById('workspacePublishSnapshot'),
    workspaceProject: document.getElementById('workspacePublishProject'),
    workspaceDocs: document.getElementById('workspacePublishDocs'),
    manualUpload: document.getElementById('shareManualUpload'),
    dropzone: document.getElementById('shareDropZone'),
    dropHint: document.getElementById('shareDropHint'),
    input: document.getElementById('shareFileInput'),
    publish: document.getElementById('uploadShareFile'),
    status: document.getElementById('shareStatus'),
    progress: document.getElementById('shareProgress'),
    progressBar: document.getElementById('shareProgressBar'),
    progressText: document.getElementById('shareProgressText'),
    result: document.getElementById('shareResult'),
    copySummary: document.getElementById('copyPublishSummary'),
    sendFeishu: document.getElementById('sendPublishToFeishu'),
    openFeishuSettings: document.getElementById('openFeishuSettings'),
    feishuSettings: document.getElementById('feishuSettings'),
    feishuWebhook: document.getElementById('feishuWebhook'),
    feishuSettingsHint: document.getElementById('feishuSettingsHint'),
    saveFeishuSettings: document.getElementById('saveFeishuSettings'),
    shareUrl: document.getElementById('shareUrl'),
    latestShareUrl: document.getElementById('latestShareUrl'),
    tagUrl: document.getElementById('githubTagUrl'),
    branchUrl: document.getElementById('githubBranchUrl'),
    commitUrl: document.getElementById('githubCommitUrl'),
    diffResult: document.getElementById('githubDiffResult'),
    diffSummary: document.getElementById('githubDiffSummary'),
    diffFiles: document.getElementById('githubDiffFiles'),
    fileName: document.getElementById('shareFileName')
  };

  let selectedFile = null;
  let isPublishing = false;
  let isLoadingConfig = false;
  let githubConfig = null;
  let formProjectId;
  let syncPreferenceApplied = false;
  let latestPublishSummary = '';
  let latestPublishDetails = null;
  let feishuWebhook = '';
  let localSettingsText = '';
  let localSettingsAvailable = false;
  let isLoadingFeishuSettings = false;
  let isSavingFeishuSettings = false;
  let isSendingFeishu = false;
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
    return publishTargets().reference;
  }

  function publishTargets() {
    return window.ProtoDockPublishTargets?.build?.({
      product: els.product?.value,
      version: els.version?.value
    }) || {};
  }

  function syncGithubEnabled() {
    return !!els.syncGithub?.checked && !!githubConfig?.configured;
  }

  function canPublish() {
    if (!uploadSource() || !publishReference() || isPublishing || isLoadingConfig) {
      return false;
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
    const projectId = state.publishPreferenceId || state.projectId || null;
    if (formProjectId === projectId) {
      return;
    }
    formProjectId = projectId;
    syncPreferenceApplied = false;
    const target = window.ProtoDockGithubPreferences?.getPushTarget?.(projectId) || {};
    const previousVersion = window.ProtoDockPublishTargets?.previousVersion?.({
      lastPublishedVersion: state.workspaceVersion || state.lastPublishedVersion,
      savedVersion: target.version,
      inferredVersion: state.currentVersion
    }) || '';
    if (els.product) {
      els.product.value = target.productName || state.publishProductId || '';
    }
    if (els.version) {
      els.version.value = initialBranchValue(previousVersion, '');
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
    const previousVersion = window.ProtoDockPublishTargets?.previousVersion?.({
      lastPublishedVersion: state.workspaceVersion || state.lastPublishedVersion,
      inferredVersion: state.workspaceVersion || state.currentVersion
    }) || '';
    if (els.product && !els.product.value) {
      els.product.value = initialBranchValue(state.publishProductId || state.projectName || state.projectId, 'prototype');
    }
    if (els.version && !els.version.value) {
      els.version.value = initialBranchValue(previousVersion, 'v1');
    }
    if (els.versionHint) {
      els.versionHint.textContent = previousVersion
        ? `已带出上一发布版本 ${els.version.value}；发布新内容时请修改为新版本。`
        : '首次发布，请填写本次发布版本。';
    }
    if (els.commitMessage && state.pendingChangeCount && state.pendingChangeDescription) {
      els.commitMessage.value = state.pendingChangeDescription;
    } else if (els.commitMessage && !els.commitMessage.value) {
      els.commitMessage.value = state.pendingChangeDescription
        || state.currentChangeDescription
        || `publish ${els.product?.value || 'prototype'} ${els.version?.value || 'v1'}`;
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
      const dirtyText = state.dirty ? '发布前会先要求保存当前改动。' : '只读取清单、页面、文档和发布素材。';
      const pendingText = state.pendingChangeCount
        ? `已累计 ${state.pendingChangeCount} 条待发布变更。`
        : '当前没有待发布变更。';
      const workspaceText = state.workspaceProductName
        ? `${state.workspaceProductName} · ${state.workspaceProjectName || state.projectName}`
        : (state.projectDirectoryName || '本地项目');
      els.autoDescription.textContent = `${workspaceText}：${dirtyText}${pendingText}`;
    }
    const state = protoDockState();
    const hasWorkspace = !!state.workspaceProductName && !!state.publishProductId;
    if (els.workspaceSnapshot) {
      els.workspaceSnapshot.hidden = !hasWorkspace || !usingAuto;
    }
    if (els.workspaceProject) {
      els.workspaceProject.textContent = state.workspaceProjectName || state.projectName || '-';
    }
    if (els.workspaceDocs) {
      els.workspaceDocs.textContent = `${state.workspaceSharedDocumentCount || 0} 份`;
    }
    if (els.manualUpload && !autoAvailable) {
      els.manualUpload.open = true;
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
    const targets = publishTargets();
    if (els.branchPreview) {
      els.branchPreview.textContent = targets.branch || '-';
    }
    if (els.tagPreview) {
      els.tagPreview.textContent = targets.tag || '-';
    }
    if (els.urlPreview) {
      const url = targets.currentPath ? appUrl(targets.currentPath) : '';
      els.urlPreview.href = url || '#';
      els.urlPreview.textContent = url || '填写产品标识和发布版本后生成';
      els.urlPreview.setAttribute('aria-disabled', String(!url));
    }
    if (els.latestUrlPreview) {
      const url = targets.latestPath ? appUrl(targets.latestPath) : '';
      els.latestUrlPreview.href = url || '#';
      els.latestUrlPreview.textContent = url || '填写产品标识和发布版本后生成';
      els.latestUrlPreview.setAttribute('aria-disabled', String(!url));
    }
    if (els.syncGithub) {
      els.syncGithub.disabled = isPublishing || isLoadingConfig || !githubConfig?.configured;
      if (githubConfig && !githubConfig.configured) {
        els.syncGithub.checked = false;
      }
    }
    const githubEnabled = syncGithubEnabled();
    els.targetSummary?.classList.toggle('github-disabled', !githubEnabled);
    if (els.githubMode) {
      if (isLoadingConfig) {
        els.githubMode.textContent = '正在读取 GitHub 配置';
      } else if (!githubConfig?.configured) {
        els.githubMode.textContent = '仅发布公开预览';
      } else {
        els.githubMode.textContent = githubEnabled ? '将同步 GitHub' : '本次不推送 GitHub';
      }
      els.githubMode.classList.toggle('is-active', githubEnabled);
    }
    if (els.commitMessage) {
      els.commitMessage.disabled = isPublishing;
    }
    els.commitField?.classList.toggle('is-disabled', isPublishing);
    if (els.publish) {
      els.publish.disabled = !canPublish();
      const source = uploadSource() === 'auto' ? '发布当前项目' : '发布 ZIP';
      els.publish.textContent = githubEnabled ? `${source}并同步 GitHub` : source;
    }
    if (els.refreshGithub) {
      els.refreshGithub.disabled = isPublishing || isLoadingConfig;
    }
    if (els.dropzone) {
      els.dropzone.setAttribute('aria-disabled', String(isPublishing));
    }
    renderFeishuState();
  }

  function renderFeishuState() {
    if (els.sendFeishu) {
      els.sendFeishu.disabled = !latestPublishDetails || isSendingFeishu || isPublishing;
      const label = els.sendFeishu.querySelector('span');
      if (label) {
        label.textContent = isSendingFeishu ? '正在发送' : '发送到飞书机器人';
      }
    }
    if (els.openFeishuSettings) {
      els.openFeishuSettings.disabled = isLoadingFeishuSettings || isSavingFeishuSettings || isSendingFeishu;
    }
    if (els.feishuWebhook && document.activeElement !== els.feishuWebhook) {
      els.feishuWebhook.value = feishuWebhook;
    }
    if (els.saveFeishuSettings) {
      els.saveFeishuSettings.disabled = !localSettingsAvailable || isSavingFeishuSettings;
      els.saveFeishuSettings.textContent = isSavingFeishuSettings ? '保存中' : '保存设置';
    }
    if (els.feishuSettingsHint) {
      els.feishuSettingsHint.textContent = localSettingsAvailable
        ? '仅保存在当前项目的 protodock.local.json，不会发布或推送到 GitHub。'
        : '请先打开本地项目目录，才能保存跟随项目的 Webhook 配置。';
    }
  }

  async function loadFeishuSettings() {
    if (isLoadingFeishuSettings) {
      return;
    }
    isLoadingFeishuSettings = true;
    localSettingsText = '';
    localSettingsAvailable = false;
    feishuWebhook = '';
    renderFeishuState();
    try {
      const result = await window.ProtoDock?.readProjectLocalSettings?.();
      localSettingsAvailable = !!result?.available;
      localSettingsText = String(result?.text || '');
      feishuWebhook = window.ProtoDockProjectNotifications?.webhookFromText?.(localSettingsText) || '';
    } catch (error) {
      localSettingsText = '';
      feishuWebhook = '';
      setStatus(`飞书机器人配置读取失败：${error.message || '无法读取本地配置'}`);
    } finally {
      isLoadingFeishuSettings = false;
      renderFeishuState();
    }
  }

  function openFeishuSettings() {
    if (!els.feishuSettings) {
      return;
    }
    els.feishuSettings.hidden = !els.feishuSettings.hidden;
    if (!els.feishuSettings.hidden) {
      els.feishuWebhook?.focus();
    }
  }

  async function saveFeishuSettings() {
    if (!localSettingsAvailable || isSavingFeishuSettings) {
      setStatus('请先打开本地项目目录，再保存飞书机器人设置');
      return;
    }
    try {
      const value = window.ProtoDockProjectNotifications?.normalizeWebhook?.(els.feishuWebhook?.value) || '';
      const nextText = window.ProtoDockProjectNotifications?.withWebhook?.(localSettingsText, value) || '';
      isSavingFeishuSettings = true;
      renderFeishuState();
      await window.ProtoDock.writeProjectLocalSettings(nextText);
      localSettingsText = nextText;
      feishuWebhook = value;
      setStatus(value ? '飞书机器人 Webhook 已保存到当前项目' : '飞书机器人 Webhook 已移除');
      if (els.feishuSettings) {
        els.feishuSettings.hidden = true;
      }
    } catch (error) {
      setStatus(`飞书机器人设置保存失败：${error.message || '无法保存'}`);
    } finally {
      isSavingFeishuSettings = false;
      renderFeishuState();
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
        setStatus('发布将更新公开预览，并提交到产品稳定分支与版本 Tag');
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
    const latestShareUrl = payload.latestPath ? appUrl(payload.latestPath) : (payload.latestUrl || '');
    if (els.shareUrl) {
      els.shareUrl.href = shareUrl || '#';
      els.shareUrl.textContent = shareUrl ? `当前版本：${shareUrl}` : '当前版本地址生成失败';
    }
    if (els.latestShareUrl) {
      els.latestShareUrl.hidden = !latestShareUrl;
      els.latestShareUrl.href = latestShareUrl || '#';
      els.latestShareUrl.textContent = latestShareUrl ? `最新版入口：${latestShareUrl}` : '';
    }
    const github = payload.github || null;
    if (els.tagUrl) {
      els.tagUrl.hidden = !github?.tagUrl;
      els.tagUrl.href = github?.tagUrl || '#';
      els.tagUrl.textContent = github?.tagUrl ? `GitHub 当前版本：${github.tag}` : '';
    }
    if (els.branchUrl) {
      els.branchUrl.hidden = !github?.branchUrl;
      els.branchUrl.href = github?.branchUrl || '#';
      els.branchUrl.textContent = github?.branchUrl ? `GitHub 持续最新版：${github.branch}` : '';
    }
    if (els.commitUrl) {
      els.commitUrl.hidden = !github?.commitUrl;
      els.commitUrl.href = github?.commitUrl || '#';
      els.commitUrl.textContent = github?.commitUrl ? `Commit：${github.commit}` : '';
    }
    if (els.diffResult) {
      els.diffResult.hidden = !github;
    }
    if (els.diffSummary) {
      const changeCount = Array.isArray(github?.changes) ? github.changes.length : 0;
      els.diffSummary.textContent = github
        ? (changeCount ? `Git Diff：${changeCount} 个文件发生变化` : 'Git Diff：没有文件变化')
        : 'Git Diff';
    }
    if (els.diffFiles) {
      const changes = Array.isArray(github?.changes) ? github.changes : [];
      els.diffFiles.textContent = changes.length
        ? changes.join('\n')
        : '当前交付内容与稳定分支一致，复用已有提交。';
    }
    if (els.result) {
      els.result.hidden = false;
    }
    const state = protoDockState();
    latestPublishSummary = window.ProtoDockPublishSummary?.build?.({
      projectName: state.projectName || els.product?.value,
      version: els.version?.value,
      updateContent: els.commitMessage?.value || state.currentChangeDescription,
      shareUrl,
      latestShareUrl,
      branchUrl: github?.branchUrl || '',
      tagUrl: github?.tagUrl || ''
    }) || '';
    latestPublishDetails = {
      webhook: feishuWebhook,
      projectName: state.projectName || els.product?.value || '',
      version: els.version?.value || '',
      publishedAt: new Date().toISOString(),
      updateContent: els.commitMessage?.value || state.currentChangeDescription || '',
      shareUrl,
      latestShareUrl,
      branchUrl: github?.branchUrl || '',
      tagUrl: github?.tagUrl || ''
    };
    if (els.copySummary) {
      els.copySummary.disabled = !latestPublishSummary;
    }
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        // Fall through for HTTP and browsers that expose but deny Clipboard API writes.
      }
    }
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) {
      throw new Error('浏览器不支持复制');
    }
  }

  async function copyPublishSummary() {
    if (!latestPublishSummary) {
      return;
    }
    try {
      await copyText(latestPublishSummary);
      setStatus('更新文案已复制，可以直接发送');
    } catch (error) {
      setStatus('当前浏览器不能自动复制，请手动复制发布链接');
    }
  }

  async function sendPublishToFeishu() {
    if (!latestPublishDetails || isSendingFeishu) {
      return;
    }
    if (!feishuWebhook) {
      if (els.feishuSettings) {
        els.feishuSettings.hidden = false;
      }
      els.feishuWebhook?.focus();
      setStatus('请先填写并保存飞书机器人 Webhook');
      return;
    }
    isSendingFeishu = true;
    renderFeishuState();
    setStatus('正在发送发布卡片到飞书机器人...');
    try {
      const response = await fetch('/api/notifications/feishu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...latestPublishDetails, webhook: feishuWebhook })
      });
      const responseText = await response.text();
      const payload = parseJsonResponse(responseText);
      if (!response.ok) {
        throw new Error(responseError(payload, responseText, '飞书机器人发送失败'));
      }
      setStatus('发布卡片已发送到飞书机器人');
    } catch (error) {
      setStatus(`发送到飞书机器人失败：${error.message || '网络连接失败'}`);
    } finally {
      isSendingFeishu = false;
      renderFeishuState();
    }
  }

  function selectFile(file) {
    if (isPublishing) {
      return;
    }
    selectedFile = file && file.name.toLowerCase().endsWith('.zip') ? file : null;
    if (selectedFile && els.manualUpload) {
      els.manualUpload.open = true;
    }
    if (els.fileName) {
      els.fileName.textContent = selectedFile ? file.name : '拖入项目 zip，或点击选择';
    }
    if (els.result) {
      els.result.hidden = true;
    }
    latestPublishSummary = '';
    latestPublishDetails = null;
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
    const updateDescription = String(els.commitMessage?.value || '').trim();
    if (!updateDescription) {
      setStatus('每次发布都必须填写更新内容');
      return;
    }

    const release = {
      version: String(els.version.value || '').trim(),
      changedAt: new Date().toISOString(),
      description: updateDescription
    };

    isPublishing = true;
    updateState();
    resetProgress();
    if (els.result) {
      els.result.hidden = true;
    }
    latestPublishSummary = '';
    latestPublishDetails = null;
    setProgress(0);
    setStatus(source === 'auto' ? '准备打包当前项目...' : '准备上传项目包...');

    try {
      const archiveFile = source === 'auto'
        ? await window.ProtoDock.createShareArchive({ onProgress: setArchiveProgress, release })
        : selectedFile;
      const body = new FormData();
      body.append('archive', archiveFile, archiveFile.name || 'protodock-project.zip');
      body.append('productName', String(els.product.value || '').trim());
      body.append('version', release.version);
      body.append('syncGithub', String(syncGithubEnabled()));
      body.append('commitMessage', release.description);
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
      window.ProtoDockGithubPreferences?.setPushTarget?.(protoDockState().publishPreferenceId || protoDockState().projectId, {
        productName: els.product.value,
        version: els.version.value,
        syncGithub: githubConfig?.configured ? !!els.syncGithub?.checked : true
      });
      setProgress(100);
      renderResult(payload);
      let localFinalizeWarning = '';
      if (source === 'auto') {
        try {
          await window.ProtoDock.finalizePublishedVersion(release);
        } catch (error) {
          localFinalizeWarning = `；公开版本已成功，但本地版本记录未写回：${error.message || '无法写入项目清单'}`;
          console.warn('ProtoDock: published snapshot could not be finalized locally', error);
        }
      }
      const githubMessage = payload.github
        ? (payload.github.action === 'unchanged' ? '，GitHub 内容无变化' : '，并已同步 GitHub 分支与版本 Tag')
        : '';
      const successMessage = payload.action === 'updated'
        ? `公开预览已更新${githubMessage}`
        : `公开预览已发布${githubMessage}`;
      const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
      if (warnings.length) {
        console.warn('ProtoDock publish validation warnings:', warnings);
      }
      setStatus(validationStatus(`${successMessage}${localFinalizeWarning}`, warnings));
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
    latestPublishSummary = '';
    latestPublishDetails = null;
    preparePublishTarget();
    fillDefaults();
    resetProgress();
    if (els.manualUpload) {
      els.manualUpload.open = !canAutoPackage();
    }
    els.modal.hidden = false;
    setStatus('正在读取 GitHub 配置...');
    renderGithubConfig();
    updateState();
    loadGithubConfig();
    loadFeishuSettings();
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
    setStatus(syncGithubEnabled() ? '发布将同步到产品稳定分支并创建版本 Tag' : '本次只发布公开预览');
  });
  els.refreshGithub?.addEventListener('click', loadGithubConfig);
  els.copyKey?.addEventListener('click', copyDeployKey);
  els.copySummary?.addEventListener('click', copyPublishSummary);
  els.sendFeishu?.addEventListener('click', sendPublishToFeishu);
  els.openFeishuSettings?.addEventListener('click', openFeishuSettings);
  els.saveFeishuSettings?.addEventListener('click', saveFeishuSettings);
  els.close?.addEventListener('click', closeModal);
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
