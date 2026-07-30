(() => {
  const els = {
    open: document.getElementById('productSelect'),
    modal: document.getElementById('renameProjectModal'),
    close: document.getElementById('closeRenameProjectModal'),
    cancel: document.getElementById('cancelProjectRename'),
    apply: document.getElementById('applyProjectRename'),
    input: document.getElementById('renameProjectName'),
    message: document.getElementById('renameProjectMessage')
  };

  function projectState() {
    return window.ProtoDock?.getState?.() || {};
  }

  function setMessage(message = '') {
    if (els.message) {
      els.message.textContent = message;
    }
  }

  function openModal() {
    const state = projectState();
    if (!state.projectName || state.readOnly || !els.modal) {
      return;
    }
    els.input.value = state.projectName;
    setMessage();
    els.modal.hidden = false;
    window.requestAnimationFrame(() => {
      els.input.focus();
      els.input.select();
    });
  }

  function closeModal() {
    if (els.modal) {
      els.modal.hidden = true;
    }
    setMessage();
  }

  function applyRename() {
    const result = window.ProtoDock?.renameProject?.(els.input?.value);
    if (!result?.ok) {
      setMessage(result?.message || '无法修改项目名称');
      els.input?.focus();
      return;
    }
    closeModal();
  }

  els.open?.addEventListener('click', openModal);
  els.close?.addEventListener('click', closeModal);
  els.cancel?.addEventListener('click', closeModal);
  els.apply?.addEventListener('click', applyRename);
  els.input?.addEventListener('input', () => setMessage());
  els.input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyRename();
    }
  });
  els.modal?.addEventListener('click', (event) => {
    if (event.target === els.modal) {
      closeModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.modal?.hidden) {
      closeModal();
    }
  });
})();
