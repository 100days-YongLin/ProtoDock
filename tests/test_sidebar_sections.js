const assert = require('node:assert/strict');
const SidebarSections = require('../sidebar-sections.js');

function classList() {
  const values = new Set();
  return {
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
    contains(name) {
      return values.has(name);
    }
  };
}

function element(dataset = {}) {
  const attributes = new Map();
  return {
    dataset,
    hidden: false,
    title: '',
    classList: classList(),
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    getAttribute(name) {
      return attributes.get(name);
    }
  };
}

const body = element();
const icon = element();
const toggle = element({ sidebarSectionToggle: 'shared-docs' });
toggle.querySelector = () => icon;
const section = element({ sidebarSection: 'shared-docs', sidebarSectionLabel: '共享产品文档' });
section.querySelector = (selector) => selector.includes('body') ? body : toggle;

let clickHandler = null;
const root = {
  querySelectorAll() {
    return [section];
  },
  addEventListener(type, handler) {
    if (type === 'click') clickHandler = handler;
  },
  contains() {
    return true;
  }
};
const values = new Map([['sidebar', '["shared-docs"]']]);
const storage = {
  getItem(key) {
    return values.get(key) || null;
  },
  setItem(key, value) {
    values.set(key, value);
  }
};

const controller = SidebarSections.create({ rootElement: root, storage, storageKey: 'sidebar' });
assert.equal(controller.isCollapsed('shared-docs'), true);
assert.equal(section.classList.contains('is-collapsed'), true);
assert.equal(body.hidden, true);
assert.equal(toggle.getAttribute('aria-expanded'), 'false');
assert.equal(toggle.getAttribute('aria-label'), '展开共享产品文档');
assert.equal(icon.getAttribute('data-lucide'), 'chevron-right');

clickHandler({ target: { closest: () => toggle } });
assert.equal(controller.isCollapsed('shared-docs'), false);
assert.equal(body.hidden, false);
assert.equal(toggle.getAttribute('aria-expanded'), 'true');
assert.equal(icon.getAttribute('data-lucide'), 'chevron-down');
assert.equal(values.get('sidebar'), '[]');

console.log('sidebar section tests passed');
