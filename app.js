const MANIFEST_FILE = 'protodock.project.json';
const INSPECTOR_WIDTH_STORAGE_KEY = 'protodock.inspectorWidth';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.8;
const VIRTUAL_CANVAS_LIMIT = 100000;
const MIN_INSPECTOR_WIDTH = 320;
const MAX_INSPECTOR_WIDTH = 760;
const ALIGN_SNAP_THRESHOLD = 10;
const MAX_SAFE_AREA_INSET = 240;

const els = {
  workspace: document.querySelector('.workspace'),
  inspector: document.querySelector('.inspector'),
  canvasShell: document.getElementById('canvasShell'),
  canvasTransform: document.getElementById('canvasTransform'),
  edgeLayer: document.getElementById('edgeLayer'),
  alignmentGuides: document.getElementById('alignmentGuides'),
  edgeLabelEditorMount: document.getElementById('edgeLabelEditorMount'),
  nodeMount: document.getElementById('nodeMount'),
  noteMount: document.getElementById('noteMount'),
  zoomValue: document.getElementById('zoomValue'),
  productSelect: document.getElementById('productSelect'),
  pageList: document.getElementById('pageList'),
  canvasPresetName: document.getElementById('canvasPresetName'),
  canvasPresetDesc: document.getElementById('canvasPresetDesc'),
  safeAreaToggle: document.getElementById('safeAreaToggle'),
  safeAreaSettingsButton: document.getElementById('safeAreaSettingsButton'),
  safeAreaPanel: document.getElementById('safeAreaPanel'),
  safeAreaTopInput: document.getElementById('safeAreaTopInput'),
  safeAreaBottomInput: document.getElementById('safeAreaBottomInput'),
  saveSafeAreaSettings: document.getElementById('saveSafeAreaSettings'),
  canvasProductName: document.getElementById('canvasProductName'),
  canvasProductDesc: document.getElementById('canvasProductDesc'),
  startScreen: document.getElementById('startScreen'),
  inspectorName: document.getElementById('inspectorName'),
  inspectorType: document.getElementById('inspectorType'),
  sourceMeta: document.getElementById('sourceMeta'),
  sourcePath: document.getElementById('sourcePath'),
  entryPath: document.getElementById('entryPath'),
  docPath: document.getElementById('docPath'),
  nodeInspectorPanel: document.getElementById('nodeInspectorPanel'),
  markdownMount: document.getElementById('pageMarkdown'),
  markdownFallback: document.getElementById('pageMarkdownFallback'),
  inspectorResizer: document.getElementById('inspectorResizer'),
  playbackPanel: document.getElementById('playbackPanel'),
  playbackTitle: document.getElementById('playbackTitle'),
  playbackMeta: document.getElementById('playbackMeta'),
  playbackStage: document.getElementById('playbackStage'),
  playbackMount: document.getElementById('playbackMount'),
  playbackCounter: document.getElementById('playbackCounter'),
  statusLabel: document.querySelector('.status span:last-child'),
  projectModal: document.getElementById('projectModal'),
  projectName: document.getElementById('projectName'),
  projectDirectory: document.getElementById('projectDirectory'),
  projectDirectoryPreview: document.getElementById('projectDirectoryPreview'),
  projectPresetGrid: document.getElementById('projectPresetGrid'),
  conflictModal: document.getElementById('conflictModal')
};

const buttons = {
  newProject: document.getElementById('newProject'),
  openProject: document.getElementById('openProject'),
  saveProject: document.getElementById('saveProject'),
  reloadProject: document.getElementById('reloadProject'),
  startNewProject: document.getElementById('startNewProject'),
  startOpenProject: document.getElementById('startOpenProject'),
  closeProjectModal: document.getElementById('closeProjectModal'),
  chooseProjectDirectory: document.getElementById('chooseProjectDirectory'),
  createProject: document.getElementById('createProject'),
  cancelProject: document.getElementById('cancelProject'),
  modeSelect: document.getElementById('modeSelect'),
  addNode: document.getElementById('addNode'),
  addEdge: document.getElementById('addEdge'),
  addText: document.getElementById('addText'),
  playFlow: document.getElementById('playFlow'),
  resetView: document.getElementById('resetView'),
  zoomIn: document.getElementById('zoomIn'),
  zoomOut: document.getElementById('zoomOut'),
  closePlayback: document.getElementById('closePlayback'),
  playbackPrev: document.getElementById('playbackPrev'),
  playbackNext: document.getElementById('playbackNext'),
  conflictReload: document.getElementById('conflictReload'),
  conflictOverwrite: document.getElementById('conflictOverwrite'),
  conflictCancel: document.getElementById('conflictCancel')
};

const canvasPresets = {
  'web-landscape': {
    label: 'Web 横版',
    desc: '1440 x 900，后台和桌面 Web',
    shellClass: 'web web-landscape',
    width: 1440,
    height: 900,
    thumbnailWidth: 236
  },
  'web-portrait': {
    label: 'Web 竖版',
    desc: '900 x 1440，竖向 Web 或长页面',
    shellClass: 'web web-portrait',
    width: 900,
    height: 1440,
    thumbnailWidth: 158
  },
  'iphone-portrait': {
    label: 'iPhone 14 Pro',
    desc: '390 x 830，移动端小程序',
    shellClass: 'iphone iphone-portrait',
    deviceClass: 'device-iphone-14-pro device-black',
    width: 390,
    height: 830,
    frameWidth: 428,
    frameHeight: 868,
    safeTop: 59,
    safeBottom: 34,
    thumbnailWidth: 188
  },
  'iphone-landscape': {
    label: 'iPhone 横版',
    desc: '844 x 390，横屏移动场景',
    shellClass: 'iphone iphone-landscape',
    width: 844,
    height: 390,
    thumbnailWidth: 236
  },
  'ipad-portrait': {
    label: 'iPad Pro',
    desc: '506 x 724，平板竖屏业务',
    shellClass: 'ipad ipad-portrait',
    deviceClass: 'device-ipad-pro device-spacegray',
    width: 506,
    height: 724,
    frameWidth: 560,
    frameHeight: 778,
    safeTop: 24,
    safeBottom: 20,
    thumbnailWidth: 174
  },
  'ipad-landscape': {
    label: 'iPad 横版',
    desc: '1180 x 820，平板横屏工作台',
    shellClass: 'ipad ipad-landscape',
    width: 1180,
    height: 820,
    thumbnailWidth: 236
  }
};

const state = {
  manifest: null,
  projectHandle: null,
  manifestHandle: null,
  projectBaseUrl: null,
  projectDirectoryName: null,
  readOnly: true,
  manifestHash: null,
  dirty: false,
  docCache: new Map(),
  docDirty: new Set(),
  previewUrls: new Map(),
  previewJobs: new Map(),
  previewResetNodeIds: new Set(),
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedNoteId: null,
  editingEdgeLabelId: null,
  edgeClickCandidate: null,
  activePreviewNodeId: null,
  safeAreaSettingsOpen: false,
  selectedPresetId: 'iphone-portrait',
  selectedProjectDirectoryHandle: null,
  toolMode: 'select',
  zoom: window.innerWidth < 760 ? 0.78 : 1,
  panX: 0,
  panY: 0,
  activeDrag: null,
  activePan: null,
  activeInspectorResize: null,
  activeNoteDrag: null,
  activeEdgeDraft: null,
  playbackTimer: null,
  playbackIndex: 0,
  playbackActive: false,
  playbackJobId: null,
  edgeFrameId: null,
  isSettingEditorValue: false,
  markdownEditor: null
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function clampCanvasCoord(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-VIRTUAL_CANVAS_LIMIT, Math.min(VIRTUAL_CANVAS_LIMIT, value));
}

async function hashText(text) {
  if (window.crypto?.subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return String(hash);
}

function setStatus(message) {
  els.statusLabel.textContent = message;
}

function clampInspectorWidth(width) {
  const workspaceWidth = els.workspace.getBoundingClientRect().width || window.innerWidth;
  const sidebarWidth = window.matchMedia('(max-width: 760px)').matches ? 0 : 248;
  const resizerWidth = window.matchMedia('(max-width: 760px)').matches ? 0 : 8;
  const canvasMinimum = window.matchMedia('(max-width: 1180px)').matches ? 360 : 480;
  const maxByViewport = Math.max(MIN_INSPECTOR_WIDTH, workspaceWidth - sidebarWidth - resizerWidth - canvasMinimum);
  const maxWidth = Math.min(MAX_INSPECTOR_WIDTH, maxByViewport);
  return Math.round(Math.max(MIN_INSPECTOR_WIDTH, Math.min(maxWidth, width)));
}

function setInspectorWidth(width, persist = false) {
  if (!els.workspace || window.matchMedia('(max-width: 760px)').matches) {
    return;
  }
  const nextWidth = clampInspectorWidth(width);
  els.workspace.style.setProperty('--inspector-width', `${nextWidth}px`);
  els.inspectorResizer?.setAttribute('aria-valuenow', String(nextWidth));
  if (persist) {
    localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(nextWidth));
  }
}

function restoreInspectorWidth() {
  const stored = Number.parseFloat(localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY));
  if (Number.isFinite(stored)) {
    setInspectorWidth(stored);
  }
}

function markDirty(message = '未保存') {
  state.dirty = true;
  setStatus(message);
  renderProjectActions();
}

function presetFor() {
  const id = state.manifest?.project?.devicePreset || 'iphone-portrait';
  return canvasPresets[id] || canvasPresets['iphone-portrait'];
}

function safeAreaEnabled() {
  return state.manifest?.project?.safeAreaEnabled !== false;
}

function safeAreaDefaultsFor(presetOrId = presetFor()) {
  const preset = typeof presetOrId === 'string' ? canvasPresets[presetOrId] : presetOrId;
  return {
    top: preset?.safeTop || 0,
    bottom: preset?.safeBottom || 0
  };
}

function clampSafeAreaInset(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.round(Math.max(0, Math.min(MAX_SAFE_AREA_INSET, parsed)));
}

function configuredSafeAreaInsets(preset = presetFor()) {
  const defaults = safeAreaDefaultsFor(preset);
  const project = state.manifest?.project || {};
  return {
    top: clampSafeAreaInset(project.safeAreaTop, defaults.top),
    bottom: clampSafeAreaInset(project.safeAreaBottom, defaults.bottom)
  };
}

function effectiveSafeAreaInsets(preset = presetFor()) {
  if (!safeAreaEnabled()) {
    return { top: 0, bottom: 0 };
  }
  return configuredSafeAreaInsets(preset);
}

function safeAreaClassFor(preset) {
  const safeArea = effectiveSafeAreaInsets(preset);
  return safeArea.top > 0 || safeArea.bottom > 0 ? ' safe-area-on' : '';
}

function previewStyleFor(preset, previewWidth = preset.thumbnailWidth || 124) {
  const width = preset.width || 390;
  const height = preset.height || 844;
  const frameWidth = preset.frameWidth || width;
  const frameHeight = preset.frameHeight || height;
  const safeArea = effectiveSafeAreaInsets(preset);
  const scale = previewWidth / frameWidth;
  const viewportWidth = frameWidth * scale;
  const viewportHeight = frameHeight * scale;
  return [
    `--preview-width:${width}px`,
    `--preview-height:${height}px`,
    `--device-frame-width:${frameWidth}px`,
    `--device-frame-height:${frameHeight}px`,
    `--safe-top:${safeArea.top}px`,
    `--safe-bottom:${safeArea.bottom}px`,
    `--preview-scale:${scale.toFixed(5)}`,
    `--viewport-width:${viewportWidth.toFixed(2)}px`,
    `--viewport-height:${viewportHeight.toFixed(2)}px`
  ].join(';');
}

function playbackStyleFor(preset) {
  const width = preset.width || 390;
  const height = preset.height || 844;
  const frameWidth = preset.frameWidth || width;
  const frameHeight = preset.frameHeight || height;
  const stageRect = els.playbackStage?.getBoundingClientRect();
  const widthScale = stageRect?.width ? (stageRect.width - 24) / frameWidth : 0.82;
  const heightScale = stageRect?.height ? (stageRect.height - 20) / frameHeight : 0.82;
  const scale = Math.min(1, Math.max(0.46, widthScale), Math.max(0.46, heightScale));
  return previewStyleFor(preset, Math.round(frameWidth * scale));
}

function nodeStyleFor(node) {
  const preset = presetFor();
  const previewStyle = previewStyleFor(preset);
  return `left:${node.x}px;top:${node.y}px;${previewStyle}`;
}

function manifestText(manifest = state.manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function normalizeManifest(input) {
  const manifest = structuredClone(input || {});
  const devicePreset = manifest.project?.devicePreset || manifest.canvasType || 'iphone-portrait';
  const safeAreaDefaults = safeAreaDefaultsFor(devicePreset);
  manifest.schemaVersion = manifest.schemaVersion || 1;
  manifest.project = {
    id: manifest.project?.id || `project-${Date.now()}`,
    name: manifest.project?.name || '未命名 ProtoDock 项目',
    description: manifest.project?.description || '本地原型工作台',
    devicePreset,
    safeAreaEnabled: manifest.project?.safeAreaEnabled ?? true,
    safeAreaTop: clampSafeAreaInset(manifest.project?.safeAreaTop, safeAreaDefaults.top),
    safeAreaBottom: clampSafeAreaInset(manifest.project?.safeAreaBottom, safeAreaDefaults.bottom)
  };
  manifest.pages = manifest.pages || {};
  manifest.canvas = manifest.canvas || {};
  manifest.canvas.nodes = Array.isArray(manifest.canvas.nodes) ? manifest.canvas.nodes : [];
  manifest.canvas.edges = Array.isArray(manifest.canvas.edges) ? manifest.canvas.edges : [];
  manifest.canvas.notes = Array.isArray(manifest.canvas.notes) ? manifest.canvas.notes : [];

  manifest.canvas.nodes.forEach((node, index) => {
    node.id ||= `node-${index + 1}`;
    node.pageId ||= node.id.replace(/^node-/, '');
    node.x = clampCanvasCoord(Number(node.x ?? 120 + index * 280));
    node.y = clampCanvasCoord(Number(node.y ?? 120));
    if (!manifest.pages[node.pageId]) {
      manifest.pages[node.pageId] = buildPageRecord(node.pageId, node.title || `页面 ${index + 1}`);
    }
  });
  manifest.canvas.edges.forEach((edge, index) => {
    edge.id ||= `edge-${index + 1}`;
  });
  manifest.canvas.notes.forEach((note, index) => {
    note.id ||= `note-${index + 1}`;
  });
  return manifest;
}

function buildPageRecord(pageId, title) {
  return {
    title,
    kind: '原型页面',
    tag: '页面',
    sourceDir: `pages/${pageId}`,
    entry: `pages/${pageId}/index.html`,
    doc: `docs/${pageId}.md`
  };
}

function buildDefaultDoc(pageId, page) {
  return `# ${page.title || pageId}

## 页面目标

说明这个页面解决什么问题，以及用户从哪里进入。

## 原型入口

- 源码目录：${page.sourceDir || '-'}
- 预览入口：${page.entry || '-'}

## 验收点

- 页面能在 ProtoDock 设备壳中稳定预览。
- 页面状态、标题和入口路径与 manifest 保持一致。
`;
}

function activeNode() {
  return state.manifest?.canvas.nodes.find((node) => node.id === state.selectedNodeId) || null;
}

function activePage() {
  const node = activeNode();
  return node ? state.manifest.pages[node.pageId] : null;
}

function pageForNode(node) {
  return state.manifest?.pages[node.pageId] || buildPageRecord(node.pageId, node.pageId);
}

function splitPath(path) {
  return String(path || '').replace(/^\/+/, '').split('/').filter(Boolean);
}

function dirname(path) {
  const parts = splitPath(path);
  parts.pop();
  return parts.join('/');
}

function resolvePath(baseDir, target) {
  if (!target || /^[a-z]+:/i.test(target) || target.startsWith('#') || target.startsWith('data:') || target.startsWith('blob:')) {
    return target;
  }
  const targetParts = target.startsWith('/') ? splitPath(target) : splitPath(`${baseDir}/${target}`);
  const stack = [];
  targetParts.forEach((part) => {
    if (part === '.') {
      return;
    }
    if (part === '..') {
      stack.pop();
      return;
    }
    stack.push(part);
  });
  return stack.join('/');
}

async function getFileHandleByPath(rootHandle, path) {
  const parts = splitPath(path);
  if (!parts.length) {
    throw new Error('路径为空');
  }
  let handle = rootHandle;
  for (let index = 0; index < parts.length - 1; index += 1) {
    handle = await handle.getDirectoryHandle(parts[index]);
  }
  return handle.getFileHandle(parts[parts.length - 1]);
}

async function getDirectoryHandleByPath(rootHandle, path, options = {}) {
  const parts = splitPath(path);
  let handle = rootHandle;
  for (const part of parts) {
    handle = await handle.getDirectoryHandle(part, options);
  }
  return handle;
}

async function readTextFile(path) {
  if (state.projectHandle) {
    const handle = await getFileHandleByPath(state.projectHandle, path);
    return (await handle.getFile()).text();
  }
  const response = await fetch(new URL(path, state.projectBaseUrl), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`无法读取 ${path}`);
  }
  return response.text();
}

async function writeTextFile(path, text) {
  if (!state.projectHandle) {
    throw new Error('当前项目没有本地目录写入权限');
  }
  const parts = splitPath(path);
  const fileName = parts.pop();
  const directory = await getDirectoryHandleByPath(state.projectHandle, parts.join('/'), { create: true });
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function createBlobUrlFromFile(path, baseDir = '') {
  const resolvedPath = resolvePath(baseDir, path);
  const fileHandle = await getFileHandleByPath(state.projectHandle, resolvedPath);
  const file = await fileHandle.getFile();
  const url = URL.createObjectURL(file);
  return { url, path: resolvedPath };
}

function revokePreviewUrls(nodeId) {
  const urls = state.previewUrls.get(nodeId) || [];
  urls.forEach((url) => URL.revokeObjectURL(url));
  state.previewUrls.delete(nodeId);
}

function rememberPreviewUrl(nodeId, url) {
  const urls = state.previewUrls.get(nodeId) || [];
  urls.push(url);
  state.previewUrls.set(nodeId, urls);
}

async function rewriteCssUrls(cssText, cssDir, nodeId) {
  const matches = Array.from(cssText.matchAll(/url\((["']?)([^"')]+)\1\)/g));
  let rewritten = cssText;
  for (const match of matches) {
    const raw = match[2].trim();
    if (!raw || /^[a-z]+:/i.test(raw) || raw.startsWith('data:') || raw.startsWith('#')) {
      continue;
    }
    try {
      const { url } = await createBlobUrlFromFile(raw, cssDir);
      rememberPreviewUrl(nodeId, url);
      rewritten = rewritten.replace(match[0], `url("${url}")`);
    } catch (error) {
      console.warn(`ProtoDock: CSS asset missing ${raw}`, error);
    }
  }
  return rewritten;
}

async function rewriteHtmlForLocalPreview(html, entryPath, nodeId) {
  const entryDir = dirname(entryPath);
  const documentForPreview = new DOMParser().parseFromString(html, 'text/html');
  const head = documentForPreview.head || documentForPreview.documentElement;
  const guardStyle = documentForPreview.createElement('style');
  guardStyle.textContent = 'html,body{margin:0;}a{cursor:default;}';
  head.prepend(guardStyle);

  const linkNodes = Array.from(documentForPreview.querySelectorAll('link[href]'));
  for (const link of linkNodes) {
    const href = link.getAttribute('href');
    if (!href || /^[a-z]+:/i.test(href) || href.startsWith('data:') || href.startsWith('#')) {
      continue;
    }
    try {
      const resolved = resolvePath(entryDir, href);
      if ((link.getAttribute('rel') || '').toLowerCase().includes('stylesheet')) {
        const cssText = await readTextFile(resolved);
        const rewritten = await rewriteCssUrls(cssText, dirname(resolved), nodeId);
        const blobUrl = URL.createObjectURL(new Blob([rewritten], { type: 'text/css' }));
        rememberPreviewUrl(nodeId, blobUrl);
        link.setAttribute('href', blobUrl);
      } else {
        const { url } = await createBlobUrlFromFile(href, entryDir);
        rememberPreviewUrl(nodeId, url);
        link.setAttribute('href', url);
      }
    } catch (error) {
      console.warn(`ProtoDock: link asset missing ${href}`, error);
    }
  }

  const styleNodes = Array.from(documentForPreview.querySelectorAll('style'));
  for (const style of styleNodes) {
    style.textContent = await rewriteCssUrls(style.textContent || '', entryDir, nodeId);
  }

  const attrMap = [
    ['img[src]', 'src'],
    ['script[src]', 'src'],
    ['source[src]', 'src'],
    ['video[src]', 'src'],
    ['video[poster]', 'poster'],
    ['iframe[src]', 'src']
  ];

  for (const [selector, attr] of attrMap) {
    const nodes = Array.from(documentForPreview.querySelectorAll(selector));
    for (const node of nodes) {
      const value = node.getAttribute(attr);
      if (!value || /^[a-z]+:/i.test(value) || value.startsWith('data:') || value.startsWith('#')) {
        continue;
      }
      try {
        const resolved = resolvePath(entryDir, value);
        if (node.tagName.toLowerCase() === 'script') {
          const jsText = await readTextFile(resolved);
          const blobUrl = URL.createObjectURL(new Blob([jsText], { type: 'text/javascript' }));
          rememberPreviewUrl(nodeId, blobUrl);
          node.setAttribute(attr, blobUrl);
        } else {
          const { url } = await createBlobUrlFromFile(value, entryDir);
          rememberPreviewUrl(nodeId, url);
          node.setAttribute(attr, url);
        }
      } catch (error) {
        console.warn(`ProtoDock: preview asset missing ${value}`, error);
      }
    }
  }

  return `<!doctype html>\n${documentForPreview.documentElement.outerHTML}`;
}

async function buildPreviewIframe(node, className = 'prototype-frame') {
  const page = pageForNode(node);
  const iframe = document.createElement('iframe');
  iframe.className = className;
  iframe.title = `${page.title || node.pageId} preview`;
  iframe.loading = 'lazy';

  if (state.projectBaseUrl) {
    iframe.src = new URL(page.entry, state.projectBaseUrl).toString();
  } else {
    const html = await readTextFile(page.entry);
    iframe.srcdoc = await rewriteHtmlForLocalPreview(html, page.entry, node.id);
  }

  return iframe;
}

async function hydratePreview(node) {
  const page = pageForNode(node);
  const mount = document.querySelector(`[data-preview-node="${CSS.escape(node.id)}"]`);
  if (!mount) {
    return;
  }
  const jobId = `${node.id}-${Date.now()}-${Math.random()}`;
  state.previewJobs.set(node.id, jobId);
  revokePreviewUrls(node.id);
  mount.innerHTML = '<div class="preview-loading">加载中</div>';

  try {
    const iframe = await buildPreviewIframe(node);

    if (state.previewJobs.get(node.id) !== jobId) {
      return;
    }
    mount.replaceChildren(iframe);
  } catch (error) {
    if (state.previewJobs.get(node.id) !== jobId) {
      return;
    }
    mount.innerHTML = `
      <div class="preview-error">
        <strong>无法预览</strong>
        <span>${escapeHtml(page.entry || '缺少入口')}</span>
      </div>
    `;
    console.error(error);
  }
}

function renderPreviewShell(node, page) {
  const preset = presetFor();
  const safeAreaClass = safeAreaClassFor(preset);
  if (preset.deviceClass) {
    return `
      <div class="prototype-shell device-backed${safeAreaClass}">
        <div class="prototype-device-viewport">
          <div class="prototype-device device ${escapeHtml(preset.deviceClass)}">
            <div class="device-frame">
              <div class="device-screen" data-preview-node="${escapeHtml(node.id)}">
                <div class="preview-loading">等待预览</div>
              </div>
            </div>
            <div class="device-stripe"></div>
            <div class="device-header"></div>
            <div class="device-sensors"></div>
            <div class="device-btns"></div>
            <div class="device-power"></div>
            <div class="device-home"></div>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="prototype-shell ${escapeHtml(preset.shellClass)}">
      <div class="shell-bar">
        <span>${escapeHtml(preset.label)}</span>
        <span>${escapeHtml(page.entry || '未设置入口')}</span>
      </div>
      <div class="shell-viewport">
        <div class="prototype-frame-stage" data-preview-node="${escapeHtml(node.id)}">
          <div class="preview-loading">等待预览</div>
        </div>
      </div>
    </div>
  `;
}

function renderPlaybackShell(node, page) {
  const preset = presetFor();
  const safeAreaClass = safeAreaClassFor(preset);
  if (preset.deviceClass) {
    return `
      <div class="prototype-shell playback-shell device-backed${safeAreaClass}">
        <div class="prototype-device-viewport">
          <div class="prototype-device device ${escapeHtml(preset.deviceClass)}">
            <div class="device-frame">
              <div class="device-screen" data-playback-preview="${escapeHtml(node.id)}">
                <div class="preview-loading">加载中</div>
              </div>
            </div>
            <div class="device-stripe"></div>
            <div class="device-header"></div>
            <div class="device-sensors"></div>
            <div class="device-btns"></div>
            <div class="device-power"></div>
            <div class="device-home"></div>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="prototype-shell playback-shell ${escapeHtml(preset.shellClass)}">
      <div class="shell-bar">
        <span>${escapeHtml(preset.label)}</span>
        <span>${escapeHtml(page.entry || '未设置入口')}</span>
      </div>
      <div class="shell-viewport">
        <div class="prototype-frame-stage" data-playback-preview="${escapeHtml(node.id)}">
          <div class="preview-loading">加载中</div>
        </div>
      </div>
    </div>
  `;
}

async function hydratePlaybackPreview(node) {
  const mount = els.playbackMount?.querySelector('[data-playback-preview]');
  if (!mount) {
    return;
  }
  const page = pageForNode(node);
  const jobId = `${node.id}-${Date.now()}-${Math.random()}`;
  state.playbackJobId = jobId;
  mount.innerHTML = '<div class="preview-loading">加载中</div>';

  try {
    const iframe = await buildPreviewIframe(node, 'playback-frame');
    if (state.playbackJobId !== jobId) {
      return;
    }
    mount.replaceChildren(iframe);
  } catch (error) {
    if (state.playbackJobId !== jobId) {
      return;
    }
    mount.innerHTML = `
      <div class="preview-error">
        <strong>无法预览</strong>
        <span>${escapeHtml(page.entry || '缺少入口')}</span>
      </div>
    `;
    console.error(error);
  }
}

function reloadNodePreview(nodeId) {
  const node = state.manifest?.canvas.nodes.find((item) => item.id === nodeId);
  if (!node) {
    return;
  }
  if (state.activePreviewNodeId === nodeId) {
    state.activePreviewNodeId = null;
  }
  state.previewResetNodeIds.delete(nodeId);
  syncPreviewInteractionUi();
  hydratePreview(node);
  setStatus('已重置页面预览');
}

function previewActionFor(nodeId) {
  if (state.activePreviewNodeId === nodeId) {
    return {
      mode: 'active',
      icon: 'mouse-pointer-2',
      label: '退出原型交互',
      title: '正在操作原型，点击手机外退出'
    };
  }
  if (state.previewResetNodeIds.has(nodeId)) {
    return {
      mode: 'reset',
      icon: 'rotate-cw',
      label: '重置页面预览',
      title: '重置页面预览'
    };
  }
  return {
    mode: 'ready',
    icon: 'mouse-pointer-2',
    label: '启用原型交互',
    title: '启用原型交互'
  };
}

function syncPreviewInteractionUi() {
  document.querySelectorAll('.page-node').forEach((element) => {
    const nodeId = element.dataset.id;
    const action = previewActionFor(nodeId);
    const button = element.querySelector('[data-preview-action-node]');
    element.classList.toggle('is-preview-active', action.mode === 'active');
    element.classList.toggle('needs-preview-reset', action.mode === 'reset');
    if (!button) {
      return;
    }
    button.dataset.previewAction = action.mode;
    button.title = action.title;
    button.setAttribute('aria-label', action.label);
    button.setAttribute('aria-pressed', action.mode === 'active' ? 'true' : 'false');
    button.innerHTML = `<i data-lucide="${action.icon}"></i>`;
  });
  window.lucide?.createIcons();
}

function activatePreviewInteraction(nodeId) {
  if (state.activePreviewNodeId && state.activePreviewNodeId !== nodeId) {
    state.previewResetNodeIds.add(state.activePreviewNodeId);
  }
  state.activePreviewNodeId = nodeId;
  state.previewResetNodeIds.delete(nodeId);
  selectNode(nodeId);
  syncPreviewInteractionUi();
  setStatus('已启用原型交互，点击手机外退出');
}

function exitPreviewInteraction(nodeId = state.activePreviewNodeId, options = {}) {
  if (!nodeId || state.activePreviewNodeId !== nodeId) {
    return;
  }
  state.activePreviewNodeId = null;
  state.previewResetNodeIds.add(nodeId);
  syncPreviewInteractionUi();
  if (!options.silent) {
    setStatus('已退出原型交互，可刷新重置页面');
  }
}

function handlePreviewActionClick(event) {
  event.stopPropagation();
  const nodeId = event.currentTarget.dataset.previewActionNode;
  const action = previewActionFor(nodeId);
  if (action.mode === 'reset') {
    reloadNodePreview(nodeId);
    return;
  }
  if (action.mode === 'active') {
    exitPreviewInteraction(nodeId);
    return;
  }
  activatePreviewInteraction(nodeId);
}

function renderNode(node, index) {
  const page = pageForNode(node);
  const selected = node.id === state.selectedNodeId;
  const previewAction = previewActionFor(node.id);
  const previewStateClass = previewAction.mode === 'active' ? 'is-preview-active' : previewAction.mode === 'reset' ? 'needs-preview-reset' : '';
  return `
    <article class="page-node ${selected ? 'selected' : ''} ${previewStateClass}" data-id="${escapeHtml(node.id)}" style="${nodeStyleFor(node)}">
      <header class="node-head">
        <div class="node-title">
          <strong>${escapeHtml(page.title || node.pageId)}</strong>
          <span>${escapeHtml(page.sourceDir || dirname(page.entry || ''))}</span>
        </div>
        <div class="node-actions">
          <button class="node-preview-action" type="button" data-preview-action-node="${escapeHtml(node.id)}" data-preview-action="${previewAction.mode}" title="${escapeHtml(previewAction.title)}" aria-label="${escapeHtml(previewAction.label)}" aria-pressed="${previewAction.mode === 'active' ? 'true' : 'false'}">
            <i data-lucide="${escapeHtml(previewAction.icon)}"></i>
          </button>
          <span class="node-index">${index + 1}</span>
        </div>
      </header>
      <div class="screen">
        ${renderPreviewShell(node, page)}
        <div class="node-anchors" aria-hidden="true">
          <button class="node-anchor top" data-anchor="top" tabindex="-1"></button>
          <button class="node-anchor right" data-anchor="right" tabindex="-1"></button>
          <button class="node-anchor bottom" data-anchor="bottom" tabindex="-1"></button>
          <button class="node-anchor left" data-anchor="left" tabindex="-1"></button>
        </div>
      </div>
    </article>
  `;
}

function renderNote(note) {
  return `
    <article class="text-note ${note.id === state.selectedNoteId ? 'selected' : ''}" data-note-id="${escapeHtml(note.id)}" style="left:${note.x}px;top:${note.y}px;">
      <button class="note-grip" title="移动文本" aria-label="移动文本" tabindex="-1"></button>
      <div class="note-content" contenteditable="true" spellcheck="false">${escapeHtml(note.text)}</div>
    </article>
  `;
}

function renderPageList() {
  if (!state.manifest) {
    els.pageList.innerHTML = '';
    return;
  }
  els.pageList.innerHTML = state.manifest.canvas.nodes.map((node, index) => {
    const page = pageForNode(node);
    return `
      <li class="doc-item ${node.id === state.selectedNodeId ? 'active' : ''}" data-page-node="${escapeHtml(node.id)}">
        <strong>${index + 1}. ${escapeHtml(page.title || node.pageId)}</strong>
        <span>${escapeHtml(page.entry || '未设置入口')}</span>
      </li>
    `;
  }).join('');
}

function renderProjectActions() {
  const hasProject = !!state.manifest;
  document.querySelectorAll('[data-requires-project]').forEach((button) => {
    button.disabled = !hasProject;
  });
  buttons.saveProject?.toggleAttribute('disabled', !hasProject || state.readOnly);
  buttons.reloadProject?.toggleAttribute('disabled', !hasProject || (!state.projectHandle && !state.projectBaseUrl));
  els.safeAreaToggle?.toggleAttribute('disabled', !hasProject);
  els.productSelect.disabled = !hasProject;
}

function syncSafeAreaInputs() {
  if (!state.manifest) {
    return;
  }
  const safeArea = configuredSafeAreaInsets();
  if (els.safeAreaTopInput) {
    els.safeAreaTopInput.value = safeArea.top;
  }
  if (els.safeAreaBottomInput) {
    els.safeAreaBottomInput.value = safeArea.bottom;
  }
}

function renderSafeAreaSettingsControls() {
  const hasProject = !!state.manifest;
  if (!hasProject) {
    state.safeAreaSettingsOpen = false;
  }
  if (els.safeAreaPanel) {
    els.safeAreaPanel.hidden = !hasProject || !state.safeAreaSettingsOpen;
  }
  if (els.safeAreaSettingsButton) {
    els.safeAreaSettingsButton.classList.toggle('active', state.safeAreaSettingsOpen);
    els.safeAreaSettingsButton.setAttribute('aria-expanded', String(state.safeAreaSettingsOpen));
  }
  els.safeAreaTopInput?.toggleAttribute('disabled', !hasProject);
  els.safeAreaBottomInput?.toggleAttribute('disabled', !hasProject);
  els.saveSafeAreaSettings?.toggleAttribute('disabled', !hasProject);
  if (!state.safeAreaSettingsOpen) {
    syncSafeAreaInputs();
  }
}

function renderChrome() {
  const hasProject = !!state.manifest;
  els.workspace.classList.toggle('is-empty', !hasProject);
  els.startScreen.hidden = hasProject;
  renderProjectActions();

  if (!hasProject) {
    els.canvasProductName.textContent = '未打开项目';
    els.canvasProductDesc.textContent = '选择工作目录开始';
    els.canvasPresetName.textContent = '未选择';
    els.canvasPresetDesc.textContent = '打开项目后显示设备壳';
    els.productSelect.innerHTML = '';
    renderSafeAreaSettingsControls();
    return;
  }

  const preset = presetFor();
  els.canvasProductName.textContent = state.manifest.project.name;
  els.canvasProductDesc.textContent = state.manifest.project.description || '本地原型工作台';
  els.canvasPresetName.textContent = preset.label;
  els.canvasPresetDesc.textContent = preset.desc;
  if (els.safeAreaToggle) {
    els.safeAreaToggle.checked = safeAreaEnabled();
  }
  renderSafeAreaSettingsControls();
  els.productSelect.innerHTML = `<option>${escapeHtml(state.manifest.project.name)}</option>`;
  renderPageList();
}

function renderCanvas() {
  if (!state.manifest) {
    state.editingEdgeLabelId = null;
    els.nodeMount.innerHTML = '';
    els.noteMount.innerHTML = '';
    els.edgeLayer.innerHTML = markerDefs();
    renderEdgeLabelEditor();
    renderChrome();
    return;
  }
  els.nodeMount.innerHTML = state.manifest.canvas.nodes.map(renderNode).join('');
  els.noteMount.innerHTML = state.manifest.canvas.notes.map(renderNote).join('');
  renderEdges();
  bindRenderedCanvas();
  renderChrome();
  updateInspector();
  updateZoom();
  window.lucide?.createIcons();
  syncPreviewInteractionUi();
  state.manifest.canvas.nodes.forEach(hydratePreview);
}

function markerDefs() {
  return `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#667085"></path>
      </marker>
    </defs>
  `;
}

function getRectForNodeId(id) {
  const element = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!element) {
    return null;
  }
  const screen = element.querySelector('.screen') || element;
  return {
    x: Number.parseFloat(element.style.left) + screen.offsetLeft,
    y: Number.parseFloat(element.style.top) + screen.offsetTop,
    w: screen.offsetWidth,
    h: screen.offsetHeight
  };
}

function connectorPoint(rect, side) {
  if (side === 'left') {
    return { x: rect.x, y: rect.y + rect.h / 2 };
  }
  if (side === 'top') {
    return { x: rect.x + rect.w / 2, y: rect.y };
  }
  if (side === 'bottom') {
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h };
  }
  return { x: rect.x + rect.w, y: rect.y + rect.h / 2 };
}

function preferredSides(fromRect, toRect) {
  const fromCenter = { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 };
  const toCenter = { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  }
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

function edgePath(from, to, fromSide, toSide) {
  const verticalPair = (fromSide === 'top' || fromSide === 'bottom') && (toSide === 'top' || toSide === 'bottom');
  const horizontalPair = (fromSide === 'left' || fromSide === 'right') && (toSide === 'left' || toSide === 'right');
  if (verticalPair) {
    if (Math.abs(from.x - to.x) <= 4) {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }
    const midY = (from.y + to.y) / 2;
    return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
  }
  if (horizontalPair && Math.abs(from.y - to.y) <= 4) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
  const dx = Math.max(80, Math.abs(to.x - from.x) * 0.42);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

function edgeGeometry(edge) {
  const fromRect = getRectForNodeId(edge.from);
  const toRect = getRectForNodeId(edge.to);
  if (!fromRect || !toRect) {
    return null;
  }
  const [autoFromSide, autoToSide] = preferredSides(fromRect, toRect);
  const fromSide = edge.fromSide || autoFromSide;
  const toSide = edge.toSide || autoToSide;
  const from = connectorPoint(fromRect, fromSide);
  const to = connectorPoint(toRect, toSide);
  return {
    from,
    to,
    path: edgePath(from, to, fromSide, toSide),
    labelX: (from.x + to.x) / 2,
    labelY: (from.y + to.y) / 2 - 8
  };
}

function scheduleRenderEdges() {
  if (state.edgeFrameId) {
    return;
  }
  state.edgeFrameId = window.requestAnimationFrame(() => {
    state.edgeFrameId = null;
    renderEdges();
  });
}

function renderEdgeLabelEditor() {
  if (!els.edgeLabelEditorMount) {
    return;
  }
  const edgeId = state.editingEdgeLabelId;
  if (!state.manifest || !edgeId) {
    els.edgeLabelEditorMount.innerHTML = '';
    return;
  }
  const edge = state.manifest.canvas.edges.find((item) => item.id === edgeId);
  const geometry = edge ? edgeGeometry(edge) : null;
  if (!edge || !geometry) {
    state.editingEdgeLabelId = null;
    els.edgeLabelEditorMount.innerHTML = '';
    return;
  }
  els.edgeLabelEditorMount.innerHTML = `
    <div class="edge-label-editor" style="left:${geometry.labelX}px;top:${geometry.labelY}px;">
      <input id="edgeLabelInput" value="${escapeHtml(edge.label || '')}" aria-label="连线文本">
    </div>
  `;
  const input = els.edgeLabelEditorMount.querySelector('input');
  input?.addEventListener('pointerdown', (event) => event.stopPropagation());
  input?.addEventListener('click', (event) => event.stopPropagation());
  input?.addEventListener('dblclick', (event) => event.stopPropagation());
  input?.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdgeLabelEdit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdgeLabelEdit();
    }
  });
  input?.addEventListener('blur', () => commitEdgeLabelEdit());
  window.setTimeout(() => {
    input?.focus();
    input?.select();
  });
}

function beginEdgeLabelEdit(edgeId) {
  if (!state.manifest) {
    return;
  }
  const edge = state.manifest.canvas.edges.find((item) => item.id === edgeId);
  if (!edge) {
    return;
  }
  if (state.editingEdgeLabelId && state.editingEdgeLabelId !== edgeId) {
    commitEdgeLabelEdit();
  }
  exitPreviewInteraction(state.activePreviewNodeId, { silent: true });
  state.editingEdgeLabelId = edgeId;
  state.selectedEdgeId = edgeId;
  state.selectedNodeId = null;
  state.selectedNoteId = null;
  document.querySelectorAll('.page-node').forEach((node) => node.classList.remove('selected'));
  document.querySelectorAll('.text-note').forEach((note) => note.classList.remove('selected'));
  renderEdges();
  updateInspector();
  setStatus('正在编辑连线文本');
}

function commitEdgeLabelEdit() {
  const edgeId = state.editingEdgeLabelId;
  const input = els.edgeLabelEditorMount?.querySelector('input');
  if (!state.manifest || !edgeId) {
    return;
  }
  const edge = state.manifest.canvas.edges.find((item) => item.id === edgeId);
  const nextLabel = (input?.value || '').trim();
  state.editingEdgeLabelId = null;
  if (edge && edge.label !== nextLabel) {
    edge.label = nextLabel;
    markDirty('连线文本已修改');
  }
  renderEdges();
}

function cancelEdgeLabelEdit() {
  if (!state.editingEdgeLabelId) {
    return;
  }
  state.editingEdgeLabelId = null;
  renderEdges();
  setStatus('已取消编辑连线文本');
}

function renderEdges() {
  if (!state.manifest) {
    return;
  }
  const edgeSvg = state.manifest.canvas.edges.map((edge) => {
    const geometry = edgeGeometry(edge);
    if (!geometry) {
      return '';
    }
    const selected = edge.id === state.selectedEdgeId;
    return `
      <g data-edge-id="${escapeHtml(edge.id)}">
        <path class="edge-path ${selected ? 'selected' : ''}" marker-end="url(#arrow)" d="${geometry.path}"></path>
        <path class="edge-hit" d="${geometry.path}"></path>
        <text class="edge-label" x="${geometry.labelX}" y="${geometry.labelY}">${escapeHtml(edge.label || '')}</text>
      </g>
    `;
  }).join('');
  els.edgeLayer.innerHTML = markerDefs() + edgeSvg;
  els.edgeLayer.querySelectorAll('[data-edge-id]').forEach((edgeGroup) => {
    edgeGroup.addEventListener('click', (event) => {
      event.stopPropagation();
      const edgeId = edgeGroup.dataset.edgeId;
      const previousClick = state.edgeClickCandidate;
      const repeatedClick = previousClick
        && previousClick.id === edgeId
        && Date.now() - previousClick.time < 420
        && Math.abs(previousClick.x - event.clientX) < 10
        && Math.abs(previousClick.y - event.clientY) < 10;
      state.edgeClickCandidate = {
        id: edgeId,
        time: Date.now(),
        x: event.clientX,
        y: event.clientY
      };
      if (event.detail >= 2 || repeatedClick) {
        beginEdgeLabelEdit(edgeId);
        return;
      }
      selectEdge(edgeId);
    });
    edgeGroup.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      beginEdgeLabelEdit(edgeGroup.dataset.edgeId);
    });
  });
  renderEdgeLabelEditor();
}

function bindRenderedCanvas() {
  document.querySelectorAll('.page-node').forEach((element) => {
    element.addEventListener('pointerdown', handleNodePointerDown);
    element.querySelector('[data-preview-action-node]')?.addEventListener('click', handlePreviewActionClick);
    element.querySelector('[data-preview-action-node]')?.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });
    element.querySelectorAll('.node-anchor').forEach((anchor) => {
      anchor.addEventListener('click', handleAnchorClick);
      anchor.addEventListener('pointerdown', (event) => event.stopPropagation());
    });
  });
  document.querySelectorAll('.text-note').forEach((noteElement) => {
    noteElement.addEventListener('pointerdown', () => selectNote(noteElement.dataset.noteId));
    noteElement.querySelector('.note-grip')?.addEventListener('pointerdown', handleNotePointerDown);
    noteElement.querySelector('.note-content')?.addEventListener('input', () => {
      const note = state.manifest.canvas.notes.find((item) => item.id === noteElement.dataset.noteId);
      if (note) {
        note.text = noteElement.querySelector('.note-content').textContent;
        markDirty('文本已修改');
      }
    });
  });
}

function selectNode(id) {
  if (state.editingEdgeLabelId) {
    commitEdgeLabelEdit();
  }
  if (state.activePreviewNodeId && state.activePreviewNodeId !== id) {
    exitPreviewInteraction(state.activePreviewNodeId, { silent: true });
  }
  state.selectedNodeId = id;
  state.selectedEdgeId = null;
  state.selectedNoteId = null;
  document.querySelectorAll('.page-node').forEach((node) => {
    node.classList.toggle('selected', node.dataset.id === id);
  });
  document.querySelectorAll('.text-note').forEach((note) => note.classList.remove('selected'));
  renderEdges();
  renderPageList();
  updateInspector();
}

function selectEdge(id) {
  if (state.editingEdgeLabelId && state.editingEdgeLabelId !== id) {
    commitEdgeLabelEdit();
  }
  exitPreviewInteraction(state.activePreviewNodeId, { silent: true });
  state.selectedEdgeId = id;
  state.selectedNodeId = null;
  state.selectedNoteId = null;
  document.querySelectorAll('.page-node').forEach((node) => node.classList.remove('selected'));
  document.querySelectorAll('.text-note').forEach((note) => note.classList.remove('selected'));
  renderEdges();
  updateInspector();
}

function selectNote(id) {
  if (state.editingEdgeLabelId) {
    commitEdgeLabelEdit();
  }
  exitPreviewInteraction(state.activePreviewNodeId, { silent: true });
  state.selectedNoteId = id;
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  document.querySelectorAll('.page-node').forEach((node) => node.classList.remove('selected'));
  document.querySelectorAll('.text-note').forEach((note) => {
    note.classList.toggle('selected', note.dataset.noteId === id);
  });
  renderEdges();
  updateInspector();
}

function clearSelection(options = {}) {
  if (state.editingEdgeLabelId) {
    commitEdgeLabelEdit();
  }
  if (state.activePreviewNodeId) {
    exitPreviewInteraction(state.activePreviewNodeId, { silent: true });
  }
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.selectedNoteId = null;
  document.querySelectorAll('.page-node').forEach((node) => node.classList.remove('selected'));
  document.querySelectorAll('.text-note').forEach((note) => note.classList.remove('selected'));
  renderEdges();
  renderPageList();
  updateInspector();
  if (!options.silent) {
    setStatus('已取消选中');
  }
}

async function updateInspector() {
  const node = activeNode();
  const page = activePage();
  if (!node || !page) {
    els.inspectorName.textContent = state.selectedEdgeId ? '流程连线' : '未选择页面';
    els.inspectorType.textContent = state.selectedEdgeId ? '按 Backspace 删除连线' : '选择一个页面节点查看文档';
    els.sourcePath.textContent = '-';
    els.entryPath.textContent = '-';
    els.docPath.textContent = '-';
    setEditorValue('');
    return;
  }

  els.inspectorName.textContent = page.title || node.pageId;
  els.inspectorType.textContent = page.kind || '原型页面';
  els.sourcePath.textContent = page.sourceDir || dirname(page.entry || '') || '-';
  els.entryPath.textContent = page.entry || '-';
  els.docPath.textContent = page.doc || '-';

  const content = await loadDocForPage(node.pageId, page);
  if (state.selectedNodeId === node.id) {
    setEditorValue(content);
  }
}

async function loadDocForPage(pageId, page) {
  if (state.docCache.has(pageId)) {
    return state.docCache.get(pageId);
  }
  let content = buildDefaultDoc(pageId, page);
  if (page.doc) {
    try {
      content = await readTextFile(page.doc);
    } catch (error) {
      console.warn(`ProtoDock: document missing ${page.doc}`, error);
    }
  }
  state.docCache.set(pageId, content);
  return content;
}

function initMarkdownEditor() {
  if (window.toastui?.Editor && els.markdownMount) {
    state.markdownEditor = new toastui.Editor({
      el: els.markdownMount,
      height: '100%',
      initialEditType: 'wysiwyg',
      hideModeSwitch: true,
      initialValue: ''
    });
    state.markdownEditor.on('change', handleEditorChange);
    return;
  }
  els.markdownMount.hidden = true;
  els.markdownFallback.hidden = false;
  els.markdownFallback.addEventListener('input', handleEditorChange);
}

function getEditorValue() {
  if (state.markdownEditor) {
    return state.markdownEditor.getMarkdown();
  }
  return els.markdownFallback.value;
}

function setEditorValue(value) {
  state.isSettingEditorValue = true;
  if (state.markdownEditor) {
    state.markdownEditor.setMarkdown(value || '', false);
  } else {
    els.markdownFallback.value = value || '';
  }
  state.isSettingEditorValue = false;
}

function handleEditorChange() {
  if (state.isSettingEditorValue) {
    return;
  }
  const node = activeNode();
  if (!node) {
    return;
  }
  state.docCache.set(node.pageId, getEditorValue());
  state.docDirty.add(node.pageId);
  markDirty('文档已修改');
}

function updateZoom() {
  els.canvasTransform.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  els.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
}

function zoomFromCenter(delta) {
  const rect = els.canvasShell.getBoundingClientRect();
  zoomAt(delta, rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function zoomAt(delta, clientX, clientY) {
  const oldZoom = state.zoom;
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom + delta));
  if (nextZoom === oldZoom) {
    return;
  }
  const rect = els.canvasShell.getBoundingClientRect();
  const worldX = (clientX - rect.left - state.panX) / oldZoom;
  const worldY = (clientY - rect.top - state.panY) / oldZoom;
  state.zoom = nextZoom;
  state.panX = clientX - rect.left - worldX * nextZoom;
  state.panY = clientY - rect.top - worldY * nextZoom;
  updateZoom();
  renderEdges();
}

function screenToWorld(clientX, clientY) {
  const rect = els.canvasShell.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.panX) / state.zoom,
    y: (clientY - rect.top - state.panY) / state.zoom
  };
}

function isCanvasBlankTarget(target) {
  return target === els.canvasShell
    || target === els.canvasTransform
    || target === els.nodeMount
    || target === els.noteMount
    || target === els.edgeLayer
    || target === els.alignmentGuides;
}

function nodeBoxFromElement(element) {
  return {
    x: Number.parseFloat(element.style.left) || 0,
    y: Number.parseFloat(element.style.top) || 0,
    w: element.offsetWidth,
    h: element.offsetHeight
  };
}

function buildAlignmentCandidates(activeElement) {
  const activeBox = nodeBoxFromElement(activeElement);
  const xCandidates = [];
  const yCandidates = [];
  document.querySelectorAll('.page-node').forEach((element) => {
    if (element === activeElement) {
      return;
    }
    const box = nodeBoxFromElement(element);
    [
      { line: box.x, value: box.x },
      { line: box.x + box.w / 2, value: box.x + box.w / 2 - activeBox.w / 2 },
      { line: box.x + box.w, value: box.x + box.w - activeBox.w }
    ].forEach((candidate) => xCandidates.push(candidate));
    [
      { line: box.y, value: box.y },
      { line: box.y + box.h / 2, value: box.y + box.h / 2 - activeBox.h / 2 },
      { line: box.y + box.h, value: box.y + box.h - activeBox.h }
    ].forEach((candidate) => yCandidates.push(candidate));
  });
  return { xCandidates, yCandidates };
}

function nearestAlignmentCandidate(candidates, value, threshold) {
  let nearest = null;
  candidates.forEach((candidate) => {
    const distance = Math.abs(candidate.value - value);
    if (distance <= threshold && (!nearest || distance < nearest.distance)) {
      nearest = { ...candidate, distance };
    }
  });
  return nearest;
}

function snapNodePosition(drag, x, y) {
  const threshold = ALIGN_SNAP_THRESHOLD / state.zoom;
  const snapX = nearestAlignmentCandidate(drag.alignment?.xCandidates || [], x, threshold);
  const snapY = nearestAlignmentCandidate(drag.alignment?.yCandidates || [], y, threshold);
  return {
    x: snapX ? snapX.value : x,
    y: snapY ? snapY.value : y,
    guideX: snapX?.line ?? null,
    guideY: snapY?.line ?? null
  };
}

function renderAlignmentGuides(guides = {}) {
  if (!els.alignmentGuides) {
    return;
  }
  const lines = [];
  if (Number.isFinite(guides.guideX)) {
    lines.push(`<span class="alignment-guide vertical" style="left:${guides.guideX}px;"></span>`);
  }
  if (Number.isFinite(guides.guideY)) {
    lines.push(`<span class="alignment-guide horizontal" style="top:${guides.guideY}px;"></span>`);
  }
  els.alignmentGuides.innerHTML = lines.join('');
}

function clearAlignmentGuides() {
  if (els.alignmentGuides) {
    els.alignmentGuides.innerHTML = '';
  }
}

function handleNodePointerDown(event) {
  if (event.button !== 0 || state.toolMode !== 'select') {
    return;
  }
  const element = event.currentTarget;
  const nodeId = element.dataset.id;
  const previewSurface = event.target.closest('.device-screen, .prototype-frame-stage');
  if (state.activePreviewNodeId === nodeId) {
    if (!previewSurface) {
      clearSelection({ silent: true });
      setStatus('已退出原型交互，可刷新重置页面');
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    selectNode(nodeId);
    return;
  }
  if (previewSurface || event.target.closest('.node-preview-action')) {
    selectNode(nodeId);
    return;
  }
  selectNode(nodeId);
  const node = state.manifest.canvas.nodes.find((item) => item.id === nodeId);
  if (!node) {
    return;
  }
  state.activeDrag = {
    pointerId: event.pointerId,
    element,
    node,
    startX: event.clientX,
    startY: event.clientY,
    originalX: node.x,
    originalY: node.y,
    alignment: buildAlignmentCandidates(element)
  };
  element.setPointerCapture(event.pointerId);
  els.canvasShell.classList.add('is-dragging-node');
  event.preventDefault();
}

function handleNotePointerDown(event) {
  const noteElement = event.currentTarget.closest('.text-note');
  const note = state.manifest.canvas.notes.find((item) => item.id === noteElement.dataset.noteId);
  if (!note) {
    return;
  }
  state.activeNoteDrag = {
    pointerId: event.pointerId,
    element: noteElement,
    note,
    startX: event.clientX,
    startY: event.clientY,
    originalX: note.x,
    originalY: note.y
  };
  noteElement.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function moveActiveDrags(event) {
  if (state.activeDrag) {
    const drag = state.activeDrag;
    const dx = (event.clientX - drag.startX) / state.zoom;
    const dy = (event.clientY - drag.startY) / state.zoom;
    const snapped = snapNodePosition(drag, drag.originalX + dx, drag.originalY + dy);
    drag.node.x = clampCanvasCoord(snapped.x);
    drag.node.y = clampCanvasCoord(snapped.y);
    drag.element.style.left = `${drag.node.x}px`;
    drag.element.style.top = `${drag.node.y}px`;
    renderAlignmentGuides(snapped);
    scheduleRenderEdges();
  }
  if (state.activeNoteDrag) {
    const drag = state.activeNoteDrag;
    const dx = (event.clientX - drag.startX) / state.zoom;
    const dy = (event.clientY - drag.startY) / state.zoom;
    drag.note.x = clampCanvasCoord(drag.originalX + dx);
    drag.note.y = clampCanvasCoord(drag.originalY + dy);
    drag.element.style.left = `${drag.note.x}px`;
    drag.element.style.top = `${drag.note.y}px`;
  }
  if (state.activePan) {
    state.panX = state.activePan.originalX + event.clientX - state.activePan.startX;
    state.panY = state.activePan.originalY + event.clientY - state.activePan.startY;
    updateZoom();
  }
  if (state.activeInspectorResize) {
    const dx = event.clientX - state.activeInspectorResize.startX;
    setInspectorWidth(state.activeInspectorResize.originalWidth - dx);
    event.preventDefault();
  }
}

function endActiveDrags() {
  if (state.activeDrag) {
    state.activeDrag = null;
    els.canvasShell.classList.remove('is-dragging-node');
    clearAlignmentGuides();
    renderEdges();
    markDirty('画布位置已修改');
  }
  if (state.activeNoteDrag) {
    state.activeNoteDrag = null;
    markDirty('文本位置已修改');
  }
  if (state.activePan) {
    state.activePan = null;
    els.canvasShell.classList.remove('is-panning');
  }
  if (state.activeInspectorResize) {
    const width = Number.parseFloat(getComputedStyle(els.workspace).getPropertyValue('--inspector-width'));
    if (Number.isFinite(width)) {
      setInspectorWidth(width, true);
    }
    state.activeInspectorResize = null;
    els.workspace.classList.remove('is-resizing-inspector');
    renderPlayback();
  }
}

function handleAnchorClick(event) {
  event.stopPropagation();
  const nodeElement = event.currentTarget.closest('.page-node');
  const nodeId = nodeElement.dataset.id;
  const side = event.currentTarget.dataset.anchor;
  if (!state.activeEdgeDraft) {
    state.activeEdgeDraft = { from: nodeId, fromSide: side };
    state.toolMode = 'edge';
    renderToolMode();
    setStatus('选择目标页面锚点');
    return;
  }
  if (state.activeEdgeDraft.from === nodeId) {
    state.activeEdgeDraft = null;
    setStatus('已取消连线');
    return;
  }
  state.manifest.canvas.edges.push({
    id: `edge-${Date.now()}`,
    from: state.activeEdgeDraft.from,
    to: nodeId,
    label: '',
    fromSide: state.activeEdgeDraft.fromSide,
    toSide: side
  });
  state.activeEdgeDraft = null;
  renderEdges();
  markDirty('已新增连线');
}

function renderToolMode() {
  buttons.modeSelect?.classList.toggle('active', state.toolMode === 'select');
  buttons.addEdge?.classList.toggle('active', state.toolMode === 'edge');
  buttons.addText?.classList.toggle('active', state.toolMode === 'text');
  els.canvasShell.classList.toggle('is-linking', state.toolMode === 'edge');
  els.canvasShell.classList.toggle('show-anchors', state.toolMode === 'edge');
}

function setToolMode(mode) {
  if (mode !== 'select') {
    exitPreviewInteraction(state.activePreviewNodeId, { silent: true });
  }
  state.toolMode = mode;
  if (mode !== 'edge') {
    state.activeEdgeDraft = null;
  }
  renderToolMode();
}

function setSafeAreaEnabled(enabled) {
  if (!state.manifest) {
    return;
  }
  const safeArea = configuredSafeAreaInsets();
  state.manifest.project.safeAreaEnabled = enabled;
  state.manifest.project.safeAreaTop = safeArea.top;
  state.manifest.project.safeAreaBottom = safeArea.bottom;
  renderCanvas();
  if (state.playbackActive) {
    renderPlayback();
  }
  markDirty(enabled ? '已开启安全区' : '已关闭安全区');
}

function setSafeAreaSettingsOpen(open) {
  if (!state.manifest) {
    return;
  }
  state.safeAreaSettingsOpen = !!open;
  if (state.safeAreaSettingsOpen) {
    syncSafeAreaInputs();
  }
  renderSafeAreaSettingsControls();
  window.lucide?.createIcons();
}

function saveSafeAreaSettings() {
  if (!state.manifest) {
    return;
  }
  const current = configuredSafeAreaInsets();
  const next = {
    top: clampSafeAreaInset(els.safeAreaTopInput?.value, current.top),
    bottom: clampSafeAreaInset(els.safeAreaBottomInput?.value, current.bottom)
  };
  state.safeAreaSettingsOpen = false;
  if (next.top === current.top && next.bottom === current.bottom) {
    renderSafeAreaSettingsControls();
    return;
  }
  state.manifest.project.safeAreaTop = next.top;
  state.manifest.project.safeAreaBottom = next.bottom;
  renderCanvas();
  if (state.playbackActive) {
    renderPlayback();
  }
  markDirty(`安全区已保存：刘海 ${next.top}px / 手势条 ${next.bottom}px`);
}

function addNode() {
  if (!state.manifest) {
    return;
  }
  exitPreviewInteraction(state.activePreviewNodeId, { silent: true });
  const pageId = `page-${Date.now()}`;
  const nodeId = `node-${pageId}`;
  state.manifest.pages[pageId] = buildPageRecord(pageId, '新页面');
  state.manifest.canvas.nodes.push({
    id: nodeId,
    pageId,
    x: 160 + state.manifest.canvas.nodes.length * 280,
    y: 160
  });
  state.docCache.set(pageId, buildDefaultDoc(pageId, state.manifest.pages[pageId]));
  state.docDirty.add(pageId);
  state.selectedNodeId = nodeId;
  renderCanvas();
  markDirty('已新增页面节点');
}

function addTextNote(worldPoint) {
  state.manifest.canvas.notes.push({
    id: `note-${Date.now()}`,
    text: '补充说明',
    x: clampCanvasCoord(worldPoint.x),
    y: clampCanvasCoord(worldPoint.y)
  });
  renderCanvas();
  markDirty('已新增文本');
}

function deleteSelected() {
  if (!state.manifest) {
    return;
  }
  if (state.selectedNodeId) {
    const node = activeNode();
    const page = activePage();
    if (!node || !confirm(`删除页面节点「${page?.title || node.pageId}」？`)) {
      return;
    }
    state.manifest.canvas.nodes = state.manifest.canvas.nodes.filter((item) => item.id !== state.selectedNodeId);
    state.manifest.canvas.edges = state.manifest.canvas.edges.filter((edge) => edge.from !== state.selectedNodeId && edge.to !== state.selectedNodeId);
    state.editingEdgeLabelId = null;
    revokePreviewUrls(state.selectedNodeId);
    state.previewResetNodeIds.delete(state.selectedNodeId);
    if (state.activePreviewNodeId === state.selectedNodeId) {
      state.activePreviewNodeId = null;
    }
    state.selectedNodeId = state.manifest.canvas.nodes[0]?.id || null;
    renderCanvas();
    markDirty('已删除页面节点');
    return;
  }
  if (state.selectedEdgeId) {
    state.manifest.canvas.edges = state.manifest.canvas.edges.filter((edge) => edge.id !== state.selectedEdgeId);
    state.editingEdgeLabelId = null;
    state.selectedEdgeId = null;
    renderCanvas();
    markDirty('已删除连线');
    return;
  }
  if (state.selectedNoteId) {
    state.manifest.canvas.notes = state.manifest.canvas.notes.filter((note) => note.id !== state.selectedNoteId);
    state.selectedNoteId = null;
    renderCanvas();
    markDirty('已删除文本');
  }
}

async function loadBundledExample() {
  try {
    const baseUrl = new URL('examples/pictale/', window.location.href);
    const manifestUrl = new URL(MANIFEST_FILE, baseUrl);
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('示例项目不存在');
    }
    const text = await response.text();
    await loadManifestText(text, {
      projectBaseUrl: baseUrl.toString(),
      projectDirectoryName: 'examples/pictale',
      readOnly: true
    });
    setStatus('已加载示例项目');
  } catch (error) {
    console.warn(error);
    state.manifest = null;
    state.editingEdgeLabelId = null;
    state.safeAreaSettingsOpen = false;
    renderCanvas();
    setStatus('选择工作目录开始');
  }
}

async function loadManifestText(text, options = {}) {
  stopPlayback();
  state.previewUrls.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)));
  state.previewUrls.clear();
  state.previewResetNodeIds.clear();
  state.activePreviewNodeId = null;
  state.editingEdgeLabelId = null;
  state.safeAreaSettingsOpen = false;
  state.docCache.clear();
  state.docDirty.clear();
  state.manifest = normalizeManifest(JSON.parse(text));
  state.projectHandle = options.projectHandle || null;
  state.manifestHandle = options.manifestHandle || null;
  state.projectBaseUrl = options.projectBaseUrl || null;
  state.projectDirectoryName = options.projectDirectoryName || null;
  state.readOnly = !!options.readOnly;
  state.manifestHash = await hashText(text);
  state.dirty = false;
  state.selectedNodeId = state.manifest.canvas.nodes[0]?.id || null;
  state.selectedEdgeId = null;
  state.selectedNoteId = null;
  state.panX = 0;
  state.panY = 0;
  state.zoom = window.innerWidth < 760 ? 0.78 : 1;
  renderCanvas();
}

async function openProjectDirectory() {
  if (!window.showDirectoryPicker) {
    setStatus('当前浏览器不支持目录读写，请使用 Chrome / Edge');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const manifestHandle = await handle.getFileHandle(MANIFEST_FILE);
    const text = await (await manifestHandle.getFile()).text();
    await loadManifestText(text, {
      projectHandle: handle,
      manifestHandle,
      projectDirectoryName: handle.name,
      readOnly: false
    });
    setStatus(`已打开 ${handle.name}`);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error(error);
      setStatus(`打开失败：${error.message || '未找到 protodock.project.json'}`);
    }
  }
}

function renderPresetPicker() {
  els.projectPresetGrid.innerHTML = Object.entries(canvasPresets).map(([id, preset]) => `
    <button class="preset-card ${id === state.selectedPresetId ? 'selected' : ''}" type="button" data-preset="${escapeHtml(id)}">
      <strong>${escapeHtml(preset.label)}</strong>
      <span>${escapeHtml(preset.desc)}</span>
    </button>
  `).join('');
}

function renderDirectoryPreview() {
  const directory = state.selectedProjectDirectoryHandle?.name || els.projectDirectory.value || '未选择';
  els.projectDirectoryPreview.innerHTML = `
    <div>
      <span>工作目录</span>
      <strong>${escapeHtml(directory)}</strong>
    </div>
    <div>
      <span>项目清单</span>
      <strong>${MANIFEST_FILE}</strong>
    </div>
  `;
}

function openProjectModal() {
  state.selectedPresetId = state.manifest?.project?.devicePreset || 'iphone-portrait';
  state.selectedProjectDirectoryHandle = null;
  els.projectName.value = '新 ProtoDock 项目';
  els.projectDirectory.value = '';
  renderPresetPicker();
  renderDirectoryPreview();
  els.projectModal.hidden = false;
  els.projectName.focus();
}

function closeProjectModal() {
  els.projectModal.hidden = true;
}

async function chooseProjectDirectory() {
  if (!window.showDirectoryPicker) {
    setStatus('当前浏览器不支持目录读写，请使用 Chrome / Edge');
    return;
  }
  try {
    state.selectedProjectDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    els.projectDirectory.value = state.selectedProjectDirectoryHandle.name;
    renderDirectoryPreview();
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error(error);
    }
  }
}

function starterManifest(name, devicePreset) {
  const safeAreaDefaults = safeAreaDefaultsFor(devicePreset);
  return {
    schemaVersion: 1,
    project: {
      id: `project-${Date.now()}`,
      name,
      description: '本地静态原型工作台',
      devicePreset,
      safeAreaEnabled: true,
      safeAreaTop: safeAreaDefaults.top,
      safeAreaBottom: safeAreaDefaults.bottom
    },
    pages: {
      home: {
        title: '起始页面',
        kind: '原型页面',
        tag: '起始',
        sourceDir: 'pages/home',
        entry: 'pages/home/index.html',
        doc: 'docs/home.md'
      }
    },
    canvas: {
      nodes: [
        { id: 'node-home', pageId: 'home', x: 120, y: 128 }
      ],
      edges: [],
      notes: [
        { id: 'note-contract', text: '设计 Agent 负责 pages/* 静态页面；ProtoDock 负责 flow、文档和预览编排。', x: 420, y: 148 }
      ]
    }
  };
}

function starterHtml(name) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(name)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fb; color: #172033; }
    main { min-height: 100vh; display: grid; align-content: center; gap: 18px; padding: 28px; }
    .eyebrow { color: #0066cc; font-size: 13px; font-weight: 700; }
    h1 { margin: 0; font-size: 34px; line-height: 1.08; letter-spacing: 0; }
    p { margin: 0; color: #667085; line-height: 1.6; }
    .panel { display: grid; gap: 10px; border: 1px solid #d9dee7; border-radius: 18px; background: #fff; padding: 18px; box-shadow: 0 18px 44px rgba(23, 32, 51, 0.12); }
    button { height: 44px; border: 0; border-radius: 12px; background: #0066cc; color: #fff; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <span class="eyebrow">ProtoDock Page</span>
    <h1>${escapeHtml(name)}</h1>
    <p>这是设计 Agent 可以替换的静态页面入口。</p>
    <section class="panel">
      <strong>页面源码</strong>
      <p>修改 pages/home/index.html 后，回到 ProtoDock 重新预览。</p>
      <button type="button">主要动作</button>
    </section>
  </main>
</body>
</html>
`;
}

function starterProjectReadme(manifest) {
  const project = manifest.project;
  const pages = Object.entries(manifest.pages).map(([pageId, page]) => (
    `| ${pageId} | ${page.title || pageId} | \`${page.sourceDir || '-'}\` | \`${page.entry}\` | \`${page.doc || '-'}\` |`
  )).join('\n');

  return `# ${project.name}

这是一个 ProtoDock 原型项目工作目录。

## 项目元信息

- ProtoDock 项目 ID：${project.id}
- 项目名称：${project.name}
- 设备壳：${project.devicePreset}
- 安全区：${project.safeAreaEnabled === false ? '关闭' : `开启（刘海 ${project.safeAreaTop ?? 0}px / 手势条 ${project.safeAreaBottom ?? 0}px）`}
- Manifest：\`${MANIFEST_FILE}\`

> 项目 ID 以 \`${MANIFEST_FILE}\` 里的 \`project.id\` 为唯一来源。不要在 README、文档或页面源码里另行编造项目 ID。

## 目录约定

\`\`\`text
.
├── ${MANIFEST_FILE}
├── pages/
├── docs/
├── assets/
└── exports/
\`\`\`

## 页面清单

| Page ID | 标题 | 源码目录 | 预览入口 | 文档 |
| --- | --- | --- | --- | --- |
${pages}

## 给设计 Agent

- 页面源码统一放在 \`pages/<page-id>/\`。
- 每个页面必须提供静态入口，通常是 \`pages/<page-id>/index.html\`。
- 页面说明放在 \`docs/<page-id>.md\`。
- 可以更新 \`${MANIFEST_FILE}\` 中的 \`pages\` 字段，但不要改 \`canvas.nodes[].x\`、\`canvas.nodes[].y\` 或 \`canvas.edges\`，除非用户要求调整 flow。
`;
}

async function createProject() {
  if (!state.selectedProjectDirectoryHandle) {
    setStatus('请先选择一个本地工作目录');
    return;
  }
  const name = els.projectName.value.trim() || '新 ProtoDock 项目';
  const manifest = starterManifest(name, state.selectedPresetId);
  const text = manifestText(manifest);
  try {
    const root = state.selectedProjectDirectoryHandle;
    await writeInitialFile(root, MANIFEST_FILE, text);
    await writeInitialFile(root, 'README.md', starterProjectReadme(manifest));
    await writeInitialFile(root, 'pages/home/index.html', starterHtml(name));
    await writeInitialFile(root, 'docs/home.md', buildDefaultDoc('home', manifest.pages.home));
    const manifestHandle = await root.getFileHandle(MANIFEST_FILE);
    closeProjectModal();
    await loadManifestText(text, {
      projectHandle: root,
      manifestHandle,
      projectDirectoryName: root.name,
      readOnly: false
    });
    setStatus(`已创建 ${name}`);
  } catch (error) {
    console.error(error);
    setStatus(`创建失败：${error.message || '无法写入目录'}`);
  }
}

async function writeInitialFile(rootHandle, path, text) {
  const parts = splitPath(path);
  const fileName = parts.pop();
  let directory = rootHandle;
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create: true });
  }
  let exists = false;
  try {
    await directory.getFileHandle(fileName);
    exists = true;
  } catch (error) {
    exists = false;
  }
  if (exists && !confirm(`${path} 已存在，是否覆盖？`)) {
    return;
  }
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function saveProject() {
  if (!state.manifest || state.readOnly || !state.manifestHandle) {
    setStatus(state.readOnly ? '示例项目只读，请打开本地目录' : '没有可保存的项目');
    return;
  }
  try {
    const currentText = await (await state.manifestHandle.getFile()).text();
    const currentHash = await hashText(currentText);
    if (state.manifestHash && currentHash !== state.manifestHash) {
      const choice = await showConflictDialog();
      if (choice === 'reload') {
        await reloadProject();
        return;
      }
      if (choice !== 'overwrite') {
        setStatus('已取消保存');
        return;
      }
    }

    for (const pageId of state.docDirty) {
      const page = state.manifest.pages[pageId];
      if (page?.doc) {
        await writeTextFile(page.doc, state.docCache.get(pageId) || '');
      }
    }
    const text = manifestText(state.manifest);
    const writable = await state.manifestHandle.createWritable();
    await writable.write(text);
    await writable.close();
    state.manifestHash = await hashText(text);
    state.dirty = false;
    state.docDirty.clear();
    setStatus('已保存到本地文件');
    renderProjectActions();
  } catch (error) {
    console.error(error);
    setStatus(`保存失败：${error.message || '无法写入文件'}`);
  }
}

async function reloadProject() {
  if (state.projectHandle && state.manifestHandle) {
    const text = await (await state.manifestHandle.getFile()).text();
    await loadManifestText(text, {
      projectHandle: state.projectHandle,
      manifestHandle: state.manifestHandle,
      projectDirectoryName: state.projectDirectoryName,
      readOnly: false
    });
    setStatus('已读取本地变更');
    return;
  }
  await loadBundledExample();
}

function showConflictDialog() {
  return new Promise((resolve) => {
    const close = (choice) => {
      els.conflictModal.hidden = true;
      resolve(choice);
    };
    buttons.conflictReload.onclick = () => close('reload');
    buttons.conflictOverwrite.onclick = () => close('overwrite');
    buttons.conflictCancel.onclick = () => close('cancel');
    els.conflictModal.hidden = false;
  });
}

function startPlayback() {
  if (!state.manifest?.canvas.nodes.length) {
    return;
  }
  exitPreviewInteraction(state.activePreviewNodeId, { silent: true });
  state.playbackActive = true;
  state.playbackIndex = 0;
  els.inspector?.classList.add('is-playback');
  if (els.playbackPanel) {
    els.playbackPanel.hidden = false;
  }
  buttons.playFlow?.classList.add('active');
  renderPlayback();
  setStatus('已打开原型播放');
}

function stopPlayback() {
  if (state.playbackTimer) {
    window.clearInterval(state.playbackTimer);
    state.playbackTimer = null;
  }
  state.playbackActive = false;
  state.playbackJobId = null;
  els.inspector?.classList.remove('is-playback');
  if (els.playbackPanel) {
    els.playbackPanel.hidden = true;
  }
  if (els.playbackMount) {
    els.playbackMount.innerHTML = '';
    els.playbackMount.removeAttribute('style');
  }
  buttons.playFlow?.classList.remove('active');
}

function activePlaybackNode() {
  const nodes = state.manifest?.canvas.nodes || [];
  if (!nodes.length) {
    return null;
  }
  state.playbackIndex = Math.min(Math.max(state.playbackIndex, 0), nodes.length - 1);
  return nodes[state.playbackIndex];
}

function renderPlayback() {
  if (!state.playbackActive || !state.manifest) {
    return;
  }
  const nodes = state.manifest.canvas.nodes;
  const node = activePlaybackNode();
  if (!node) {
    stopPlayback();
    return;
  }
  const page = pageForNode(node);
  const current = state.playbackIndex + 1;
  const total = nodes.length;
  const preset = presetFor();

  els.playbackTitle.textContent = page.title || node.pageId;
  els.playbackMeta.textContent = `${page.sourceDir || dirname(page.entry || '') || node.pageId}`;
  els.playbackCounter.textContent = `${current} / ${total}`;
  buttons.playbackPrev.disabled = state.playbackIndex <= 0;
  buttons.playbackNext.disabled = state.playbackIndex >= total - 1;
  els.playbackMount.style.cssText = playbackStyleFor(preset);
  els.playbackMount.innerHTML = renderPlaybackShell(node, page);
  selectNode(node.id);
  centerNode(node.id);
  hydratePlaybackPreview(node);
  window.lucide?.createIcons();
}

function stepPlayback(delta) {
  if (!state.playbackActive || !state.manifest?.canvas.nodes.length) {
    return;
  }
  const maxIndex = state.manifest.canvas.nodes.length - 1;
  const nextIndex = Math.min(Math.max(state.playbackIndex + delta, 0), maxIndex);
  if (nextIndex === state.playbackIndex) {
    return;
  }
  state.playbackIndex = nextIndex;
  renderPlayback();
}

function centerNode(nodeId) {
  const element = document.querySelector(`[data-id="${CSS.escape(nodeId)}"]`);
  if (!element) {
    return;
  }
  const rect = els.canvasShell.getBoundingClientRect();
  const x = Number.parseFloat(element.style.left) + element.offsetWidth / 2;
  const y = Number.parseFloat(element.style.top) + element.offsetHeight / 2;
  state.panX = rect.width / 2 - x * state.zoom;
  state.panY = rect.height / 2 - y * state.zoom;
  updateZoom();
}

function bindGlobalEvents() {
  buttons.openProject?.addEventListener('click', openProjectDirectory);
  buttons.startOpenProject?.addEventListener('click', openProjectDirectory);
  buttons.newProject?.addEventListener('click', openProjectModal);
  buttons.startNewProject?.addEventListener('click', openProjectModal);
  buttons.saveProject?.addEventListener('click', saveProject);
  buttons.reloadProject?.addEventListener('click', reloadProject);
  buttons.closeProjectModal?.addEventListener('click', closeProjectModal);
  buttons.cancelProject?.addEventListener('click', closeProjectModal);
  buttons.chooseProjectDirectory?.addEventListener('click', chooseProjectDirectory);
  buttons.createProject?.addEventListener('click', createProject);
  buttons.modeSelect?.addEventListener('click', () => setToolMode('select'));
  buttons.addEdge?.addEventListener('click', () => setToolMode('edge'));
  buttons.addText?.addEventListener('click', () => setToolMode('text'));
  buttons.addNode?.addEventListener('click', addNode);
  buttons.playFlow?.addEventListener('click', startPlayback);
  buttons.closePlayback?.addEventListener('click', stopPlayback);
  buttons.playbackPrev?.addEventListener('click', () => stepPlayback(-1));
  buttons.playbackNext?.addEventListener('click', () => stepPlayback(1));
  els.safeAreaToggle?.addEventListener('change', (event) => {
    setSafeAreaEnabled(event.currentTarget.checked);
  });
  els.safeAreaSettingsButton?.addEventListener('click', () => {
    setSafeAreaSettingsOpen(!state.safeAreaSettingsOpen);
  });
  els.saveSafeAreaSettings?.addEventListener('click', saveSafeAreaSettings);
  buttons.resetView?.addEventListener('click', () => {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    updateZoom();
  });
  buttons.zoomIn?.addEventListener('click', () => zoomFromCenter(0.1));
  buttons.zoomOut?.addEventListener('click', () => zoomFromCenter(-0.1));
  els.inspectorResizer?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    const inspectorWidth = document.querySelector('.inspector')?.getBoundingClientRect().width || MIN_INSPECTOR_WIDTH;
    state.activeInspectorResize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      originalWidth: inspectorWidth
    };
    els.inspectorResizer.setPointerCapture(event.pointerId);
    els.workspace.classList.add('is-resizing-inspector');
    event.preventDefault();
  });
  els.inspectorResizer?.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }
    const currentWidth = document.querySelector('.inspector')?.getBoundingClientRect().width || MIN_INSPECTOR_WIDTH;
    const delta = event.shiftKey ? 48 : 16;
    setInspectorWidth(currentWidth + (event.key === 'ArrowLeft' ? delta : -delta), true);
    renderPlayback();
    event.preventDefault();
  });
  window.addEventListener('resize', () => {
    const currentWidth = Number.parseFloat(getComputedStyle(els.workspace).getPropertyValue('--inspector-width'));
    if (Number.isFinite(currentWidth)) {
      setInspectorWidth(currentWidth);
    }
    renderPlayback();
  });

  els.projectPresetGrid?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-preset]');
    if (!card) {
      return;
    }
    state.selectedPresetId = card.dataset.preset;
    renderPresetPicker();
  });
  els.projectName?.addEventListener('input', renderDirectoryPreview);
  els.projectDirectory?.addEventListener('input', renderDirectoryPreview);
  els.projectModal?.addEventListener('click', (event) => {
    if (event.target === els.projectModal) {
      closeProjectModal();
    }
  });

  els.pageList?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-page-node]');
    if (item) {
      selectNode(item.dataset.pageNode);
      centerNode(item.dataset.pageNode);
    }
  });

  els.canvasShell.addEventListener('pointerdown', (event) => {
    const blankCanvasTarget = isCanvasBlankTarget(event.target);
    if (state.toolMode === 'text' && event.button === 0 && blankCanvasTarget) {
      addTextNote(screenToWorld(event.clientX, event.clientY));
      setToolMode('select');
      event.preventDefault();
      return;
    }
    if (event.button === 0 && blankCanvasTarget) {
      clearSelection({ silent: true });
    }
    if (event.button === 1 || event.shiftKey || blankCanvasTarget) {
      state.activePan = {
        startX: event.clientX,
        startY: event.clientY,
        originalX: state.panX,
        originalY: state.panY
      };
      els.canvasShell.classList.add('is-panning');
      event.preventDefault();
      return;
    }
  });
  els.canvasShell.addEventListener('wheel', (event) => {
    if (!event.altKey && !event.metaKey && !event.ctrlKey) {
      return;
    }
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 0.08 : -0.08, event.clientX, event.clientY);
  }, { passive: false });
  els.canvasShell.addEventListener('auxclick', (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  });

  document.addEventListener('pointermove', moveActiveDrags);
  document.addEventListener('pointerup', endActiveDrags);
  document.addEventListener('pointercancel', endActiveDrags);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && !event.target.closest('input, textarea, [contenteditable="true"]')) {
      event.preventDefault();
      deleteSelected();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveProject();
    }
    if (event.key === 'Escape') {
      state.activeEdgeDraft = null;
      setToolMode('select');
      stopPlayback();
    }
    if (state.playbackActive && !event.target.closest('input, textarea, [contenteditable="true"]')) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepPlayback(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepPlayback(1);
      }
    }
  });
}

window.ProtoDock = {
  getState() {
    const safeArea = state.manifest ? configuredSafeAreaInsets() : { top: null, bottom: null };
    return {
      projectId: state.manifest?.project?.id || null,
      projectName: state.manifest?.project?.name || null,
      selectedNodeId: state.selectedNodeId,
      selectedEdgeId: state.selectedEdgeId,
      selectedNoteId: state.selectedNoteId,
      activePreviewNodeId: state.activePreviewNodeId,
      previewResetNodeIds: Array.from(state.previewResetNodeIds),
      playbackActive: state.playbackActive,
      playbackIndex: state.playbackIndex,
      safeAreaEnabled: safeAreaEnabled(),
      safeAreaTop: safeArea.top,
      safeAreaBottom: safeArea.bottom,
      readOnly: state.readOnly,
      dirty: state.dirty,
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      toolMode: state.toolMode,
      nodeCount: state.manifest?.canvas.nodes.length || 0,
      edgeCount: state.manifest?.canvas.edges.length || 0,
      noteCount: state.manifest?.canvas.notes.length || 0,
      projectDirectoryName: state.projectDirectoryName
    };
  },
  openProjectDirectory,
  saveProject,
  reloadProject,
  zoomByWheel(deltaY = -360, clientX, clientY) {
    const rect = els.canvasShell.getBoundingClientRect();
    zoomAt(deltaY < 0 ? 0.08 : -0.08, clientX ?? rect.left + rect.width / 2, clientY ?? rect.top + rect.height / 2);
  },
  panBy(dx, dy) {
    state.panX += dx;
    state.panY += dy;
    updateZoom();
  },
  startPlayback,
  stopPlayback
};

initMarkdownEditor();
bindGlobalEvents();
restoreInspectorWidth();
renderToolMode();
loadBundledExample();
window.lucide?.createIcons();
