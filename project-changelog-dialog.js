(() => {
  const els = {
    modal: document.getElementById('changeLogModal'),
    version: document.getElementById('changeLogVersion'),
    description: document.getElementById('changeLogDescription'),
    message: document.getElementById('changeLogMessage'),
    close: document.getElementById('closeChangeLogModal'),
    cancel: document.getElementById('cancelChangeLog'),
    confirm: document.getElementById('confirmChangeLog')
  };
  let closeActive = null;

  function open(manifest) {
    if (!els.modal || !window.ProtoDockChangeLog) {
      return Promise.reject(new Error('变更记录模块未加载'));
    }
    if (closeActive) {
      return Promise.reject(new Error('变更记录窗口已经打开'));
    }
    return new Promise((resolve) => {
      const close = (entry = null) => {
        els.modal.hidden = true;
        closeActive = null;
        resolve(entry);
      };
      const submit = () => {
        const version = els.version.value.trim();
        const description = els.description.value.trim();
        if (!version || !description) {
          els.message.textContent = '请填写版本号和变更内容';
          (!version ? els.version : els.description).focus();
          return;
        }
        close({ version, description, changedAt: new Date().toISOString() });
      };

      closeActive = () => close(null);
      els.version.value = window.ProtoDockChangeLog.suggestedVersion(manifest);
      els.description.value = '';
      els.message.textContent = '';
      els.close.onclick = closeActive;
      els.cancel.onclick = closeActive;
      els.confirm.onclick = submit;
      els.version.oninput = () => { els.message.textContent = ''; };
      els.description.oninput = () => { els.message.textContent = ''; };
      els.description.onkeydown = (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      };
      els.modal.onclick = (event) => {
        if (event.target === els.modal) {
          closeActive?.();
        }
      };
      els.modal.hidden = false;
      window.requestAnimationFrame(() => els.description.focus());
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !closeActive) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    closeActive();
  });

  window.ProtoDockChangeLogDialog = { open };
})();
