(() => {
  const els = {
    modal: document.getElementById('changeLogModal'),
    userDescription: document.getElementById('changeLogUserDescription'),
    productDescription: document.getElementById('changeLogProductDescription'),
    technicalDescription: document.getElementById('changeLogTechnicalDescription'),
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
        const description = window.ProtoDockChangeLog.formatDescription(
          els.userDescription.value,
          els.productDescription.value,
          els.technicalDescription.value
        );
        const validation = window.ProtoDockChangeLog.validateDescription(description);
        if (!validation.ok) {
          els.message.textContent = validation.message;
          (els.userDescription.value.trim() ? els.productDescription : els.userDescription).focus();
          return;
        }
        close({ description, changedAt: new Date().toISOString() });
      };

      closeActive = () => close(null);
      els.userDescription.value = '';
      els.productDescription.value = '';
      els.technicalDescription.value = '';
      els.message.textContent = '';
      els.close.onclick = closeActive;
      els.cancel.onclick = closeActive;
      els.confirm.onclick = submit;
      [els.userDescription, els.productDescription, els.technicalDescription].forEach((textarea) => {
        textarea.oninput = () => { els.message.textContent = ''; };
        textarea.onkeydown = (event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        };
      });
      els.modal.onclick = (event) => {
        if (event.target === els.modal) {
          closeActive?.();
        }
      };
      els.modal.hidden = false;
      window.requestAnimationFrame(() => els.userDescription.focus());
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
