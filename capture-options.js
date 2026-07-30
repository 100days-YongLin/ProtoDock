(() => {
  const STORAGE_KEY = 'protodock.captureMode';
  const VALID_MODES = new Set(['frame', 'screen']);
  const buttons = Array.from(document.querySelectorAll('[data-capture-mode]'));
  let mode = 'frame';

  try {
    const storedMode = localStorage.getItem(STORAGE_KEY);
    if (VALID_MODES.has(storedMode)) {
      mode = storedMode;
    }
  } catch (error) {
    // Private browsing can make localStorage unavailable.
  }

  function render() {
    buttons.forEach((button) => {
      const active = button.dataset.captureMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setMode(nextMode) {
    if (!VALID_MODES.has(nextMode)) {
      return;
    }
    mode = nextMode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      // The current session can still use the selected mode.
    }
    render();
  }

  function setDisabled(disabled) {
    buttons.forEach((button) => {
      button.disabled = !!disabled;
    });
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.captureMode));
  });

  render();
  window.ProtoDockCaptureOptions = {
    getMode: () => mode,
    setMode,
    setDisabled
  };
})();
