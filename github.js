(() => {
  const els = {
    open: document.getElementById('openGithubModal'),
    modal: document.getElementById('githubModal'),
    close: document.getElementById('closeGithubModal'),
    refresh: document.getElementById('refreshGithubConfig'),
    repo: document.getElementById('githubRepoText'),
    credentialTitle: document.getElementById('githubCredentialTitle'),
    credentialHelp: document.getElementById('githubCredentialHelp'),
    publicKey: document.getElementById('githubPublicKey'),
    copyKey: document.getElementById('copyGithubDeployKey'),
    product: document.getElementById('githubProductName'),
    version: document.getElementById('githubVersion'),
    message: document.getElementById('githubCommitMessage'),
    branchPreview: document.getElementById('githubBranchPreview'),
    push: document.getElementById('pushGithubProject'),
    status: document.getElementById('githubStatus'),
    progress: document.getElementById('githubProgress'),
    progressBar: document.getElementById('githubProgressBar'),
    progressText: document.getElementById('githubProgressText'),
    result: document.getElementById('githubResult'),
    branchUrl: document.getElementById('githubBranchUrl'),
    commitUrl: document.getElementById('githubCommitUrl')
  };

  let config = null;
  let isLoadingConfig = false;
  let isPushing = false;
  let formProjectId = null;

  function setStatus(message) {
    if (els.status) {
      els.status.textContent = message;
    }
  }

  function protoDockState() {
    try {
      return window.ProtoDock?.getState?.() || {};
    } catch (error) {
      return {};
    }
  }

  function canPackageProject() {
    return !!window.ProtoDock?.createShareArchive && !!protoDockState().canPackageProject;
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

  function branchComponent(value) {
    return String(value || '').trim();
  }

  function isValidBranchComponent(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
      && value.length <= 64
      && !value.endsWith('.')
      && !value.endsWith('.lock')
      && !value.includes('..');
  }

  function branchName() {
    const product = branchComponent(els.product?.value);
    const version = branchComponent(els.version?.value);
    return product && version ? `${product}/${version}` : '';
  }

  function initialBranchValue(value, fallback) {
    const text = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[._-]+|[._-]+$/g, '')
      .replace(/--+/g, '-')
      .slice(0, 48);
    return isValidBranchComponent(text) ? text : fallback;
  }

  function fillDefaults() {
    const state = protoDockState();
    if (els.product && !els.product.value) {
      els.product.value = initialBranchValue(state.projectName || state.projectId, 'prototype');
    }
    if (els.version && !els.version.value) {
      els.version.value = 'v1';
    }
    if (els.message && !els.message.value) {
      els.message.value = `update ${els.product?.value || 'prototype'} ${els.version?.value || 'v1'}`;
    }
  }

  function preparePushTarget() {
    const state = protoDockState();
    const projectId = state.projectId || null;
    if (formProjectId === projectId) {
      return;
    }
    formProjectId = projectId;
    const target = window.ProtoDockGithubPreferences?.getPushTarget?.(projectId) || {};
    if (els.product) {
      els.product.value = target.productName || '';
    }
    if (els.version) {
      els.version.value = target.version || '';
    }
    if (els.message) {
      els.message.value = '';
    }
  }

  function renderConfig() {
    if (els.repo) {
      if (isLoadingConfig) {
        els.repo.textContent = '正在读取服务器配置...';
      } else if (!config) {
        els.repo.textContent = '尚未读取配置';
      } else if (config.repo) {
        els.repo.textContent = config.repo || '已配置固定仓库';
      } else {
        els.repo.textContent = '服务器未配置 PROTODOCK_GITHUB_REPO';
      }
    }

    const mode = config?.authMode || 'deploy-key';
    if (els.credentialTitle) {
      els.credentialTitle.textContent = mode === 'app' ? 'GitHub App 凭据' : 'Deploy Key 公钥';
    }
    if (els.credentialHelp) {
      els.credentialHelp.textContent = mode === 'app'
        ? '服务端使用 GitHub App installation token 推送，不需要在前端复制 Deploy Key。'
        : '把这段公钥添加到固定 GitHub 私有仓库的 Deploy Keys，并勾选写权限。';
    }

    if (els.publicKey) {
      if (isLoadingConfig) {
        els.publicKey.textContent = '正在读取认证配置...';
      } else if (mode === 'app') {
        els.publicKey.textContent = [
          `App ID: ${config?.appId || '未配置'}`,
          `Installation ID: ${config?.installationId || '未配置'}`,
          `PEM 私钥: ${config?.privateKeyReady ? '已放到服务器' : '未配置'}`
        ].join('\n');
      } else if (config?.publicKey) {
        els.publicKey.textContent = config.publicKey;
      } else {
        els.publicKey.textContent = config?.keyError || '暂未生成 deploy key 公钥';
      }
    }
  }

  function configStatusMessage() {
    if (config?.authMode === 'app') {
      const missing = [];
      if (!config.repoConfigured) {
        missing.push('PROTODOCK_GITHUB_REPO');
      }
      if (!config.appId) {
        missing.push('PROTODOCK_GITHUB_APP_ID');
      }
      if (!config.installationId) {
        missing.push('PROTODOCK_GITHUB_INSTALLATION_ID');
      }
      if (!config.privateKeyReady) {
        missing.push('PEM 私钥');
      }
      return missing.length
        ? `服务器还没完成 GitHub App 配置：${missing.join(' / ')}`
        : '服务器 GitHub App 配置未完成';
    }
    return '服务器还没有配置固定 GitHub 仓库，请先设置 PROTODOCK_GITHUB_REPO';
  }

  function canPush() {
    const product = branchComponent(els.product?.value);
    const version = branchComponent(els.version?.value);
    const message = String(els.message?.value || '').trim();
    return !!config?.configured
      && canPackageProject()
      && isValidBranchComponent(product)
      && isValidBranchComponent(version)
      && !!message
      && !isPushing
      && !isLoadingConfig;
  }

  function updateState() {
    const branch = branchName();
    if (els.branchPreview) {
      els.branchPreview.textContent = branch || '-';
    }
    if (els.push) {
      els.push.disabled = !canPush();
    }
    if (els.copyKey) {
      els.copyKey.hidden = config?.authMode === 'app';
      els.copyKey.disabled = !config?.publicKey || config?.authMode === 'app';
    }
    if (els.refresh) {
      els.refresh.disabled = isLoadingConfig || isPushing;
    }
    if (els.open) {
      els.open.disabled = !window.ProtoDock?.getState;
    }
  }

  async function loadConfig() {
    if (isLoadingConfig) {
      return;
    }
    isLoadingConfig = true;
    renderConfig();
    updateState();
    try {
      const response = await fetch('/api/github/config', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || '无法读取 GitHub 配置');
      }
      config = payload;
      if (!config.configured) {
        setStatus(configStatusMessage());
      } else if (!canPackageProject()) {
        setStatus('请先打开一个本地项目目录，再推送到 GitHub');
      } else {
        setStatus('填写产品名、版本号和提交说明后即可推送');
      }
    } catch (error) {
      config = null;
      setStatus(`读取 GitHub 配置失败：${error.message || '无法连接服务器'}`);
    } finally {
      isLoadingConfig = false;
      renderConfig();
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
    if (progress.phase === 'zipping') {
      setProgress(98, { indeterminate: true, label: '压缩中' });
      setStatus('正在生成 zip...');
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

  function uploadGithubArchive(body) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', '/api/github/push');

      request.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) {
          setProgress(0, { indeterminate: true });
          setStatus('正在上传项目包...');
          return;
        }
        if (event.loaded >= event.total) {
          setProgress(100, { indeterminate: true, label: '推送中' });
          setStatus('上传完成，服务器正在推送到 GitHub...');
          return;
        }
        const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
        setProgress(percent);
        setStatus(`正在上传 ${formatPercent(percent)}`);
      });

      request.addEventListener('load', () => {
        const payload = parseJsonResponse(request.responseText);
        if (request.status < 200 || request.status >= 300) {
          reject(new Error(responseError(payload, request.responseText, 'GitHub 推送失败')));
          return;
        }
        resolve(payload);
      });
      request.addEventListener('error', () => reject(new Error('网络连接失败')));
      request.addEventListener('abort', () => reject(new Error('推送已取消')));
      request.send(body);
    });
  }

  function renderResult(payload) {
    if (els.branchUrl) {
      els.branchUrl.href = payload.branchUrl || '#';
      els.branchUrl.textContent = payload.branchUrl || `分支：${payload.branch || branchName()}`;
    }
    if (els.commitUrl) {
      els.commitUrl.hidden = !payload.commitUrl;
      els.commitUrl.href = payload.commitUrl || '#';
      els.commitUrl.textContent = payload.commitUrl ? `Commit：${payload.commit}` : '';
    }
    if (els.result) {
      els.result.hidden = false;
    }
  }

  async function pushProject() {
    if (!canPush()) {
      if (!canPackageProject()) {
        setStatus('请先打开一个本地项目目录');
      } else if (!config?.configured) {
        setStatus(configStatusMessage());
      } else {
        setStatus('请检查产品名、版本号和提交说明');
      }
      return;
    }

    isPushing = true;
    updateState();
    resetProgress();
    if (els.result) {
      els.result.hidden = true;
    }
    setProgress(0);
    setStatus('准备打包当前项目...');

    try {
      const archiveFile = await window.ProtoDock.createShareArchive({ onProgress: setArchiveProgress });
      const body = new FormData();
      body.append('archive', archiveFile, archiveFile.name || 'protodock-project.zip');
      body.append('productName', branchComponent(els.product.value));
      body.append('version', branchComponent(els.version.value));
      body.append('commitMessage', String(els.message.value || '').trim());
      setProgress(0);
      setStatus('正在上传项目包...');
      const payload = await uploadGithubArchive(body);
      window.ProtoDockGithubPreferences?.setPushTarget?.(protoDockState().projectId, {
        productName: els.product.value,
        version: els.version.value
      });
      setProgress(100);
      renderResult(payload);
      setStatus(payload.action === 'unchanged' ? 'GitHub 分支内容无变化' : '已推送到 GitHub');
    } catch (error) {
      setStatus(`推送失败：${error.message || '服务器无法完成 GitHub 推送'}`);
    } finally {
      isPushing = false;
      updateState();
    }
  }

  async function copyDeployKey() {
    if (!config?.publicKey) {
      return;
    }
    try {
      await navigator.clipboard.writeText(config.publicKey);
      setStatus('Deploy Key 公钥已复制');
    } catch (error) {
      setStatus('当前浏览器不能直接复制，请手动选择公钥');
    }
  }

  function openModal() {
    if (!els.modal) {
      return;
    }
    preparePushTarget();
    fillDefaults();
    resetProgress();
    if (els.result) {
      els.result.hidden = true;
    }
    els.modal.hidden = false;
    setStatus(canPackageProject() ? '正在读取 GitHub 配置...' : '请先打开一个本地项目目录');
    renderConfig();
    updateState();
    loadConfig();
    window.lucide?.createIcons();
  }

  function closeModal() {
    if (!isPushing && els.modal) {
      els.modal.hidden = true;
    }
  }

  [els.product, els.version, els.message].forEach((input) => {
    input?.addEventListener('input', updateState);
  });
  els.open?.addEventListener('click', openModal);
  els.close?.addEventListener('click', closeModal);
  els.refresh?.addEventListener('click', loadConfig);
  els.copyKey?.addEventListener('click', copyDeployKey);
  els.push?.addEventListener('click', pushProject);

  updateState();
})();
