(function initSidebarSections(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.ProtoDockSidebarSections = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function sidebarSectionsFactory() {
  function readCollapsedSections(storage, storageKey) {
    try {
      const value = JSON.parse(storage?.getItem(storageKey) || '[]');
      return new Set(Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function writeCollapsedSections(storage, storageKey, collapsedSections) {
    try {
      storage?.setItem(storageKey, JSON.stringify([...collapsedSections].sort()));
    } catch {
      // Sidebar preferences are optional and must never block the workspace.
    }
  }

  function create({ rootElement, storage, storageKey, renderIcons } = {}) {
    if (!rootElement || !storageKey) return null;

    const sections = [...rootElement.querySelectorAll('[data-sidebar-section]')];
    const collapsedSections = readCollapsedSections(storage, storageKey);

    function sectionById(sectionId) {
      return sections.find((section) => section.dataset.sidebarSection === sectionId) || null;
    }

    function apply(sectionId, collapsed, { persist = true } = {}) {
      const section = sectionById(sectionId);
      if (!section) return false;

      const body = section.querySelector('[data-sidebar-section-body]');
      const toggle = section.querySelector('[data-sidebar-section-toggle]');
      const icon = toggle?.querySelector('[data-lucide]');
      const label = section.dataset.sidebarSectionLabel || '区块';

      section.classList.toggle('is-collapsed', collapsed);
      if (body) body.hidden = collapsed;
      if (toggle) {
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.setAttribute('aria-label', `${collapsed ? '展开' : '收起'}${label}`);
        toggle.title = `${collapsed ? '展开' : '收起'}${label}`;
      }
      if (icon) icon.setAttribute('data-lucide', collapsed ? 'chevron-right' : 'chevron-down');

      if (collapsed) collapsedSections.add(sectionId);
      else collapsedSections.delete(sectionId);
      if (persist) writeCollapsedSections(storage, storageKey, collapsedSections);
      renderIcons?.();
      return true;
    }

    sections.forEach((section) => {
      apply(section.dataset.sidebarSection, collapsedSections.has(section.dataset.sidebarSection), { persist: false });
    });

    rootElement.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-sidebar-section-toggle]');
      if (!toggle || !rootElement.contains(toggle)) return;
      const sectionId = toggle.dataset.sidebarSectionToggle;
      apply(sectionId, !collapsedSections.has(sectionId));
    });

    return {
      apply,
      isCollapsed(sectionId) {
        return collapsedSections.has(sectionId);
      }
    };
  }

  return { create, readCollapsedSections, writeCollapsedSections };
});
