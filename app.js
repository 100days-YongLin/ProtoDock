const MANIFEST_FILE = 'protodock.project.json';
const INSPECTOR_WIDTH_STORAGE_KEY = 'protodock.inspectorWidth';
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const VIRTUAL_CANVAS_LIMIT = 100000;
const MIN_INSPECTOR_WIDTH = 320;
const MAX_INSPECTOR_WIDTH = 760;
const ALIGN_SNAP_THRESHOLD = 10;
const MAX_SAFE_AREA_INSET = 240;
const MANIFEST_WATCH_DIRTY_INTERVAL_MS = 6000;
const CAPTURE_PREVIEW_READY_TIMEOUT_MS = 20000;
const CAPTURE_IMAGE_SETTLE_TIMEOUT_MS = 5000;
const PRODUCT_DOCUMENT_CAPTURE_CONCURRENCY = 3;
const SHARE_ARCHIVE_ROOT_DIRS = ['pages', 'docs', 'assets'];

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

const els = {
  workspace: document.querySelector('.workspace'),
  inspector: document.querySelector('.inspector'),
  canvasShell: document.getElementById('canvasShell'),
  canvasTransform: document.getElementById('canvasTransform'),
  edgeLayer: document.getElementById('edgeLayer'),
  alignmentGuides: document.getElementById('alignmentGuides'),
  edgeLabelEditorMount: document.getElementById('edgeLabelEditorMount'),
  groupMount: document.getElementById('groupMount'),
  nodeMount: document.getElementById('nodeMount'),
  noteMount: document.getElementById('noteMount'),
  groupLayoutReview: document.getElementById('groupLayoutReview'),
  groupLayoutReviewText: document.getElementById('groupLayoutReviewText'),
  cancelGroupLayout: document.getElementById('cancelGroupLayout'),
  applyGroupLayout: document.getElementById('applyGroupLayout'),
  canvasMinimap: document.getElementById('canvasMinimap'),
  canvasMinimapSvg: document.getElementById('canvasMinimapSvg'),
  canvasMinimapFit: document.getElementById('canvasMinimapFit'),
  zoomValue: document.getElementById('zoomValue'),
  openProductDocument: document.getElementById('openProductDocument'),
  productSelect: document.getElementById('productSelect'),
  currentProjectName: document.getElementById('currentProjectName'),
  pageList: document.getElementById('pageList'),
  pageSearchInput: document.getElementById('pageSearchInput'),
  pageSearchClear: document.getElementById('pageSearchClear'),
  addGroupButton: document.getElementById('addGroupButton'),
  sortPagesButton: document.getElementById('sortPagesButton'),
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
  pageSettingsButton: document.getElementById('pageSettingsButton'),
  pageSettingsView: document.getElementById('pageSettingsView'),
  closePageSettings: document.getElementById('closePageSettings'),
  pageSettingsPanel: document.getElementById('pageSettingsPanel'),
  pageTitleInput: document.getElementById('pageTitleInput'),
  pageKindInput: document.getElementById('pageKindInput'),
  pageSourceDirInput: document.getElementById('pageSourceDirInput'),
  pageEntryInput: document.getElementById('pageEntryInput'),
  pageDocInput: document.getElementById('pageDocInput'),
  savePageSettings: document.getElementById('savePageSettings'),
  sourceMeta: document.getElementById('sourceMeta'),
  sourcePath: document.getElementById('sourcePath'),
  entryPath: document.getElementById('entryPath'),
  docPath: document.getElementById('docPath'),
  capturePngControls: document.getElementById('capturePngControls'),
  copyPagePngButton: document.getElementById('copyPagePngButton'),
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
  conflictModal: document.getElementById('conflictModal'),
  conflictModalTitle: document.getElementById('conflictModalTitle'),
  conflictModalDescription: document.getElementById('conflictModalDescription'),
  openProjectModal: document.getElementById('openProjectModal'),
  openLocalProjectStatus: document.getElementById('openLocalProjectStatus'),
  githubOpenRepo: document.getElementById('githubOpenRepo'),
  githubOpenBranch: document.getElementById('githubOpenBranch'),
  githubOpenProjectPath: document.getElementById('githubOpenProjectPath'),
  githubOpenStatus: document.getElementById('githubOpenStatus'),
  unsavedHomeModal: document.getElementById('unsavedHomeModal'),
  publicPreviewModal: document.getElementById('publicPreviewModal'),
  publicPreviewList: document.getElementById('publicPreviewList'),
  groupModal: document.getElementById('groupModal'),
  groupModalTitle: document.getElementById('groupModalTitle'),
  groupNameInput: document.getElementById('groupNameInput'),
  groupPageOptions: document.getElementById('groupPageOptions'),
  groupPageCount: document.getElementById('groupPageCount'),
  groupRootSelect: document.getElementById('groupRootSelect'),
  groupStatus: document.getElementById('groupStatus'),
  closeGroupModal: document.getElementById('closeGroupModal'),
  cancelGroupModal: document.getElementById('cancelGroupModal'),
  saveGroup: document.getElementById('saveGroup'),
  deleteGroup: document.getElementById('deleteGroup')
};

const buttons = {
  homeProject: document.getElementById('homeProject'),
  newProject: document.getElementById('newProject'),
  openProject: document.getElementById('openProject'),
  saveProject: document.getElementById('saveProject'),
  reloadProject: document.getElementById('reloadProject'),
  startNewProject: document.getElementById('startNewProject'),
  startOpenProject: document.getElementById('startOpenProject'),
  closeOpenProjectModal: document.getElementById('closeOpenProjectModal'),
  openLocalProjectFromMenu: document.getElementById('openLocalProjectFromMenu'),
  openPublicPreviewFromMenu: document.getElementById('openPublicPreviewFromMenu'),
  openGithubProject: document.getElementById('openGithubProject'),
  closeProjectModal: document.getElementById('closeProjectModal'),
  closePublicPreviewModal: document.getElementById('closePublicPreviewModal'),
  chooseProjectDirectory: document.getElementById('chooseProjectDirectory'),
  createProject: document.getElementById('createProject'),
  cancelProject: document.getElementById('cancelProject'),
  modeSelect: document.getElementById('modeSelect'),
  addNode: document.getElementById('addNode'),
  addText: document.getElementById('addText'),
  playFlow: document.getElementById('playFlow'),
  openProductDocument: document.getElementById('openProductDocument'),
  zoomIn: document.getElementById('zoomIn'),
  zoomOut: document.getElementById('zoomOut'),
  closePlayback: document.getElementById('closePlayback'),
  playbackPrev: document.getElementById('playbackPrev'),
  playbackNext: document.getElementById('playbackNext'),
  conflictReload: document.getElementById('conflictReload'),
  conflictOverwrite: document.getElementById('conflictOverwrite'),
  conflictCancel: document.getElementById('conflictCancel'),
  unsavedHomeCancel: document.getElementById('unsavedHomeCancel'),
  unsavedHomeConfirm: document.getElementById('unsavedHomeConfirm')
};

const canvasPresets = {
  'web-landscape': {
    label: 'Web 横版',
    desc: '1440 x 900，后台和桌面 Web',
    shellClass: 'web web-landscape',
    width: 1440,
    height: 900,
    thumbnailWidth: 480
  },
  'web-portrait': {
    label: 'Web 竖版',
    desc: '900 x 1440，竖向 Web 或长页面',
    shellClass: 'web web-portrait',
    width: 900,
    height: 1440,
    thumbnailWidth: 360
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
  shareId: null,
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
  pageSettingsOpen: false,
  pageSettingsNodeId: null,
  pageSortMode: false,
  draggingPageNodeId: null,
  activePageSortDrag: null,
  pageSearchQuery: '',
  editingGroupId: null,
  groupLayoutPreview: null,
  canvasBackupCreated: false,
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
  activeEdgeDrag: null,
  playbackTimer: null,
  playbackIndex: 0,
  playbackActive: false,
  playbackJobId: null,
  playbackLocationSuffix: '',
  playbackHistory: window.ProtoDockNavigation.createPageHistory(),
  edgeFrameId: null,
  minimapFrameId: null,
  isSettingEditorValue: false,
  markdownEditor: null,
  manifestWatchTimer: null,
  manifestCheckInFlight: false,
  manifestExternalDialogOpen: false,
  ignoredExternalManifestHash: null,
  productDocumentGenerating: false,
  projectSaving: false
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

function readonlyProjectMessage() {
  return state.shareId ? '分享预览只读，不能修改项目' : '示例项目只读，请打开本地目录';
}

function canEditProject() {
  return !!state.manifest && !state.readOnly;
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
  if (state.readOnly) {
    setStatus(readonlyProjectMessage());
    renderProjectActions();
    return;
  }
  state.dirty = true;
  setStatus(message);
  renderProjectActions();
}

function canWatchLocalManifest() {
  return !!state.manifest && !!state.manifestHandle && !state.readOnly && !!state.manifestHash;
}

function stopManifestWatcher() {
  if (state.manifestWatchTimer) {
    window.clearInterval(state.manifestWatchTimer);
  }
  state.manifestWatchTimer = null;
  state.manifestCheckInFlight = false;
  state.manifestExternalDialogOpen = false;
  state.ignoredExternalManifestHash = null;
}

function startManifestWatcher() {
  if (state.manifestWatchTimer) {
    window.clearInterval(state.manifestWatchTimer);
  }
  state.manifestWatchTimer = null;
  if (!canWatchLocalManifest()) {
    return;
  }
  state.manifestWatchTimer = window.setInterval(() => {
    if (state.dirty && !document.hidden) {
      checkExternalManifestChange('timer');
    }
  }, MANIFEST_WATCH_DIRTY_INTERVAL_MS);
}

async function manifestFileSnapshot() {
  const file = await state.manifestHandle.getFile();
  const text = await file.text();
  return {
    hash: await hashText(text),
    text
  };
}

async function checkExternalManifestChange(reason = 'manual') {
  if (!canWatchLocalManifest() || state.manifestCheckInFlight || state.manifestExternalDialogOpen) {
    return false;
  }
  if (els.conflictModal && !els.conflictModal.hidden) {
    return false;
  }
  if (reason === 'timer' && (!state.dirty || document.hidden)) {
    return false;
  }

  state.manifestCheckInFlight = true;
  try {
    const snapshot = await manifestFileSnapshot();
    if (snapshot.hash === state.manifestHash) {
      state.ignoredExternalManifestHash = null;
      return false;
    }
    if (snapshot.hash === state.ignoredExternalManifestHash) {
      return false;
    }

    state.manifestExternalDialogOpen = true;
    const choice = await showConflictDialog({
      title: '本地项目有更新',
      description: state.dirty
        ? '检测到 protodock.project.json 已被其他工具或 Agent 修改。当前画布也有未保存改动，请选择读取最新文件，或继续保留当前编辑。'
        : '检测到 protodock.project.json 已被其他工具或 Agent 修改。当前没有未保存改动，可以读取本地最新文件。',
      reloadLabel: '读取本地变更',
      overwriteLabel: null,
      cancelLabel: state.dirty ? '继续编辑' : '稍后处理'
    });

    if (choice === 'reload') {
      await reloadProject();
      return true;
    }

    state.ignoredExternalManifestHash = snapshot.hash;
    setStatus(state.dirty ? '已保留当前编辑，保存时会再次确认冲突' : '已暂不读取本地更新');
    return false;
  } catch (error) {
    console.warn('ProtoDock: failed to check external manifest changes', error);
    if (reason !== 'timer') {
      setStatus(`检测本地更新失败：${error.message || '无法读取项目清单'}`);
    }
    return false;
  } finally {
    state.manifestCheckInFlight = false;
    state.manifestExternalDialogOpen = false;
  }
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

function estimatedNodeSize() {
  const preset = presetFor();
  const frameWidth = preset.frameWidth || preset.width || 390;
  const frameHeight = preset.frameHeight || preset.height || 830;
  const previewWidth = preset.thumbnailWidth || frameWidth;
  const scale = previewWidth / frameWidth;
  return {
    width: Math.round(frameWidth * scale),
    height: Math.round(frameHeight * scale) + 48
  };
}

function measuredNodeBoxes() {
  const boxes = {};
  document.querySelectorAll('.page-node').forEach((element) => {
    const id = element.dataset.id;
    if (!id) {
      return;
    }
    boxes[id] = {
      x: Number.parseFloat(element.style.left) || 0,
      y: Number.parseFloat(element.style.top) || 0,
      width: element.offsetWidth,
      height: element.offsetHeight
    };
  });
  return boxes;
}

function nextNodePosition() {
  const calculatePosition = window.ProtoDockPlacement?.calculateNewNodePosition;
  if (!calculatePosition) {
    return {
      x: 160 + state.manifest.canvas.nodes.length * 280,
      y: 160
    };
  }
  return calculatePosition({
    nodes: state.manifest.canvas.nodes,
    selectedNodeId: state.selectedNodeId,
    measuredBoxes: measuredNodeBoxes(),
    nodeSize: estimatedNodeSize(),
    canvasLimit: VIRTUAL_CANVAS_LIMIT
  });
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
  manifest.changelog = window.ProtoDockChangeLog?.normalize(manifest.changelog) || [];
  manifest.pendingChanges = window.ProtoDockChangeLog?.normalizePending(manifest.pendingChanges) || [];
  manifest.canvas = manifest.canvas || {};
  manifest.canvas.nodes = Array.isArray(manifest.canvas.nodes) ? manifest.canvas.nodes : [];
  manifest.canvas.edges = Array.isArray(manifest.canvas.edges) ? manifest.canvas.edges : [];
  manifest.canvas.notes = Array.isArray(manifest.canvas.notes) ? manifest.canvas.notes : [];
  manifest.canvas.groups = window.ProtoDockGroups?.normalizeGroups(manifest.canvas.groups, manifest.canvas.nodes) || [];

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

> 所属功能：<!-- 请填写这个页面属于哪个业务功能 -->

## 页面定位

<!-- 请说明这个页面解决什么用户问题，以及它在完整业务流程中的职责。 -->

## 使用场景

- 目标用户：<!-- 请填写 -->
- 用户目标：<!-- 请填写 -->
- 进入场景：<!-- 请填写用户为什么会来到这里 -->

## 前置条件

- <!-- 请填写登录、绑定、权限、账户和业务状态等条件。 -->

## 页面内容

- <!-- 请填写页面展示的模块、字段、按钮和关键文案。 -->

## 交互规则

1. <!-- 请填写用户操作。 -->
2. <!-- 请填写系统反馈、状态变化和页面跳转。 -->
3. <!-- 请填写完成后的结果。 -->

## 业务规则

- <!-- 请填写资格、次数、金额、权限、有效期和规则优先级。 -->

## 状态与异常

| 状态或异常 | 触发条件 | 产品处理 |
| --- | --- | --- |
| <!-- 请填写 --> | <!-- 请填写 --> | <!-- 请填写 --> |

## 数据影响

- 读取数据：<!-- 请填写 -->
- 写入或同步：<!-- 请填写 -->
- 刷新时机：<!-- 请填写 -->

## 产品验收

### 验收场景 1：主流程

- 前提：<!-- 请填写用户和系统所处状态。 -->
- 操作：<!-- 请填写用户执行的操作。 -->
- 预期：<!-- 请填写可观察、可判断的系统结果。 -->

### 验收场景 2：异常或边界

- 前提：<!-- 请填写异常或边界条件。 -->
- 操作：<!-- 请填写触发操作。 -->
- 预期：<!-- 请填写提示、数据和后续可操作结果。 -->

## 非本期范围

- <!-- 请填写本次明确不实现的能力，避免范围歧义。 -->
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
  const filesystemPath = window.ProtoDockLocalResourcePaths?.filesystemPath?.(path) ?? path;
  const parts = splitPath(filesystemPath);
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

async function readProjectLocalSettings() {
  if (!state.projectHandle || state.readOnly || state.shareId) {
    return { available: false, text: '' };
  }
  try {
    return {
      available: true,
      text: await readTextFile(window.ProtoDockProjectNotifications?.fileName || 'protodock.local.json')
    };
  } catch (error) {
    if (error?.name === 'NotFoundError') {
      return { available: true, text: '' };
    }
    throw error;
  }
}

async function writeProjectLocalSettings(text) {
  if (!state.projectHandle || state.readOnly || state.shareId) {
    throw new Error('当前项目没有本地配置写入权限');
  }
  const fileName = window.ProtoDockProjectNotifications?.fileName || 'protodock.local.json';
  let gitignore = '';
  try {
    gitignore = await readTextFile('.gitignore');
  } catch (error) {
    if (error?.name !== 'NotFoundError') {
      throw error;
    }
  }
  const lines = gitignore.split(/\r?\n/);
  if (!lines.some((line) => line.trim() === fileName)) {
    const prefix = gitignore && !gitignore.endsWith('\n') ? `${gitignore}\n` : gitignore;
    await writeTextFile('.gitignore', `${prefix}${fileName}\n`);
  }
  await writeTextFile(fileName, text);
}

function canCreateShareArchive() {
  return !!state.manifest && !!state.projectHandle && !state.readOnly && !state.shareId;
}

function isAllowedShareArchivePath(path) {
  const parts = splitPath(path);
  if (!parts.length) {
    return false;
  }
  if (parts.length === 1) {
    return parts[0] === MANIFEST_FILE;
  }
  return SHARE_ARCHIVE_ROOT_DIRS.includes(parts[0]);
}

function safeShareArchiveFileName() {
  const rawName = state.manifest?.project?.name || state.manifest?.project?.id || 'protodock-project';
  const safeName = String(rawName)
    .replace(/[^\p{L}\p{N} ._-]+/gu, '-')
    .replace(/^[ ._-]+|[ ._-]+$/g, '')
    .slice(0, 80);
  return `${safeName || 'protodock-project'}.zip`;
}

function dirtyDocArchiveEntries() {
  const entries = new Map();
  for (const pageId of state.docDirty) {
    const page = state.manifest?.pages?.[pageId];
    const docPath = page?.doc ? resolvePath('', page.doc) : '';
    if (docPath && isAllowedShareArchivePath(docPath)) {
      entries.set(docPath, state.docCache.get(pageId) || '');
    }
  }
  return entries;
}

async function collectShareFiles(directoryHandle, prefix, files) {
  const children = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    children.push({ name, handle });
  }
  children.sort((a, b) => a.name.localeCompare(b.name));

  for (const child of children) {
    const path = `${prefix}/${child.name}`;
    if (child.handle.kind === 'file') {
      files.push({ path, handle: child.handle });
      continue;
    }
    if (child.handle.kind === 'directory') {
      await collectShareFiles(child.handle, path, files);
    }
  }
}

async function createShareArchive(options = {}) {
  if (!canCreateShareArchive()) {
    throw new Error('请先打开一个本地项目目录');
  }
  if (!window.ProtoDockZip?.createZipFile) {
    throw new Error('当前页面缺少 zip 打包模块');
  }
  if (state.dirty || state.docDirty.size) {
    throw new Error('当前项目有未保存修改，请先保存并填写本次变更记录');
  }

  await checkExternalManifestChange('manual');

  const archiveManifest = options.release
    ? window.ProtoDockChangeLog.releaseSnapshot(state.manifest, options.release).manifest
    : state.manifest;

  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const diskFiles = [];
  onProgress({ phase: 'collecting', current: 0, total: 0 });

  for (const rootName of SHARE_ARCHIVE_ROOT_DIRS) {
    try {
      const directoryHandle = await state.projectHandle.getDirectoryHandle(rootName);
      await collectShareFiles(directoryHandle, rootName, diskFiles);
      onProgress({ phase: 'collecting', current: diskFiles.length, total: 0 });
    } catch (error) {
      if (error?.name !== 'NotFoundError') {
        throw error;
      }
    }
  }

  const entries = [{
    path: MANIFEST_FILE,
    data: manifestText(archiveManifest),
    lastModified: Date.now()
  }];
  const dirtyDocs = dirtyDocArchiveEntries();
  const includedPaths = new Set([MANIFEST_FILE]);

  for (let index = 0; index < diskFiles.length; index += 1) {
    const item = diskFiles[index];
    if (!isAllowedShareArchivePath(item.path)) {
      continue;
    }
    const overrideText = dirtyDocs.get(item.path);
    if (overrideText !== undefined) {
      entries.push({
        path: item.path,
        data: overrideText,
        lastModified: Date.now()
      });
    } else {
      const file = await item.handle.getFile();
      entries.push({
        path: item.path,
        data: file,
        lastModified: file.lastModified
      });
    }
    includedPaths.add(item.path);
    onProgress({ phase: 'reading', current: index + 1, total: diskFiles.length, path: item.path });
  }

  for (const [path, text] of dirtyDocs) {
    if (!includedPaths.has(path)) {
      entries.push({ path, data: text, lastModified: Date.now() });
      includedPaths.add(path);
    }
  }

  onProgress({ phase: 'zipping', current: entries.length, total: entries.length });
  return window.ProtoDockZip.createZipFile(entries, safeShareArchiveFileName(), {
    onProgress: (progress) => onProgress({ phase: 'compressing', ...progress })
  });
}

async function finalizePublishedVersion(release) {
  if (!state.manifest || state.readOnly || !state.manifestHandle) {
    throw new Error('当前项目没有本地清单写入权限');
  }
  const diskSnapshot = await manifestFileSnapshot();
  if (state.manifestHash && diskSnapshot.hash !== state.manifestHash) {
    throw new Error('发布期间本地清单被其他工具修改，请读取本地变更后再处理版本记录');
  }
  const result = window.ProtoDockChangeLog.releaseSnapshot(state.manifest, release);
  if (!result.changed) {
    return result.entry;
  }
  const text = manifestText(result.manifest);
  const writable = await state.manifestHandle.createWritable();
  await writable.write(text);
  await writable.close();
  state.manifest = result.manifest;
  state.manifestHash = await hashText(text);
  state.ignoredExternalManifestHash = null;
  renderProjectActions();
  return result.entry;
}

function safePngFileName(page, captureMode = 'frame') {
  const rawName = page?.title || activeNode()?.pageId || 'protodock-page';
  const safeName = String(rawName)
    .replace(/[^\p{L}\p{N} ._-]+/gu, '-')
    .replace(/^[ ._-]+|[ ._-]+$/g, '')
    .slice(0, 80);
  const suffix = captureMode === 'screen' ? '-无框' : '';
  return `${safeName || 'protodock-page'}${suffix}.png`;
}

function captureFrameSizeForPreset(preset) {
  const safeArea = configuredSafeAreaInsets();
  return window.ProtoDockCapture.captureViewportSize(preset, {
    safeAreaEnabled: safeAreaEnabled(),
    safeAreaTop: safeArea.top,
    safeAreaBottom: safeArea.bottom
  });
}

function waitForPreviewImages(documentRef) {
  const images = Array.from(documentRef.images || []).filter((image) => !image.complete);
  if (!images.length) {
    return Promise.resolve();
  }
  return Promise.race([
    Promise.all(images.map((image) => new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    }))),
    new Promise((resolve) => window.setTimeout(resolve, CAPTURE_IMAGE_SETTLE_TIMEOUT_MS))
  ]);
}

function isExpectedIframeDocument(iframe, expectedSrc) {
  const doc = iframe.contentDocument;
  if (!doc?.documentElement) {
    return false;
  }
  if (!expectedSrc) {
    return true;
  }
  if (doc.location?.href === 'about:blank') {
    return false;
  }
  try {
    return new URL(doc.location.href).href === new URL(expectedSrc, window.location.href).href;
  } catch (error) {
    return doc.location?.href === expectedSrc;
  }
}

function waitForIframeReady(iframe, options = {}) {
  const expectedSrc = options.expectedSrc || '';
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      iframe.removeEventListener('load', done);
      iframe.removeEventListener('error', fail);
    };
    const fail = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error('页面预览加载失败'));
    };
    const done = async () => {
      if (settled || !isExpectedIframeDocument(iframe, expectedSrc)) {
        return;
      }
      const doc = iframe.contentDocument;
      if (!doc?.documentElement) {
        settled = true;
        cleanup();
        reject(new Error('无法读取页面预览'));
        return;
      }
      const finish = async () => {
        if (doc.fonts?.ready) {
          await doc.fonts.ready.catch(() => {});
        }
        await waitForPreviewImages(doc);
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(iframe);
      };
      if (doc.readyState === 'complete') {
        await finish();
      } else {
        window.setTimeout(finish, 150);
      }
    };

    iframe.addEventListener('load', done);
    iframe.addEventListener('error', fail);
    window.setTimeout(async () => {
      if (settled) {
        return;
      }
      if (isExpectedIframeDocument(iframe, expectedSrc)) {
        await done();
      } else {
        settled = true;
        cleanup();
        reject(new Error('页面预览加载超时'));
      }
    }, CAPTURE_PREVIEW_READY_TIMEOUT_MS);
  });
}

async function createCaptureIframe(node) {
  const preset = presetFor();
  const size = captureFrameSizeForPreset(preset);
  const captureNode = {
    ...node,
    id: `capture-${node.id}-${Date.now()}`
  };
  const iframe = await buildPreviewIframe(captureNode, 'capture-frame');
  iframe.loading = 'eager';
  iframe.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    'border:0',
    `width:${size.width}px`,
    `height:${size.height}px`,
    'pointer-events:none'
  ].join(';');
  const pendingSrc = iframe.src && !iframe.srcdoc ? iframe.src : '';
  if (pendingSrc) {
    iframe.removeAttribute('src');
  }
  const ready = waitForIframeReady(iframe, { expectedSrc: pendingSrc });
  document.body.append(iframe);
  if (pendingSrc) {
    iframe.src = pendingSrc;
  }
  try {
    await ready;
    return { iframe, captureNodeId: captureNode.id };
  } catch (error) {
    iframe.remove();
    revokePreviewUrls(captureNode.id);
    throw error;
  }
}

function loadedCanvasPreviewIframe(nodeId) {
  const mount = document.querySelector(`[data-preview-node="${CSS.escape(nodeId)}"]`);
  const iframe = mount?.querySelector('iframe');
  if (!iframe) {
    return null;
  }
  try {
    const doc = iframe.contentDocument;
    if (!doc?.documentElement || doc.readyState !== 'complete' || doc.location?.href === 'about:blank') {
      return null;
    }
    return iframe;
  } catch (error) {
    return null;
  }
}

async function acquireCaptureIframe(node) {
  const existingIframe = loadedCanvasPreviewIframe(node.id);
  const preset = presetFor();
  const safeArea = configuredSafeAreaInsets(preset);
  const canReuse = existingIframe && window.ProtoDockCapture.iframeMatchesCaptureViewport(
    existingIframe,
    preset,
    {
      safeAreaEnabled: safeAreaEnabled(),
      safeAreaTop: safeArea.top,
      safeAreaBottom: safeArea.bottom
    }
  );
  if (canReuse) {
    if (existingIframe.contentDocument?.fonts?.ready) {
      await existingIframe.contentDocument.fonts.ready.catch(() => {});
    }
    await waitForPreviewImages(existingIframe.contentDocument);
    return { iframe: existingIframe, captureNodeId: null, reused: true };
  }
  return createCaptureIframe(node);
}

function releaseCaptureIframe(capture) {
  if (!capture?.captureNodeId) {
    return;
  }
  capture.iframe.remove();
  revokePreviewUrls(capture.captureNodeId);
}

async function copySelectedPagePng() {
  const node = activeNode();
  const page = activePage();
  if (!node || !page) {
    setStatus('请先选择一个页面节点');
    return;
  }
  if (!window.ProtoDockCapture?.capturePagePng) {
    setStatus('缺少 PNG 生成模块');
    return;
  }

  const captureMode = window.ProtoDockCaptureOptions?.getMode?.() === 'screen' ? 'screen' : 'frame';
  const modeLabel = captureMode === 'screen' ? '无框' : '带框';
  const previousDisabled = els.copyPagePngButton?.disabled;
  if (els.copyPagePngButton) {
    els.copyPagePngButton.disabled = true;
  }
  window.ProtoDockCaptureOptions?.setDisabled?.(true);
  setStatus(`正在生成${modeLabel}页面 PNG...`);

  let capture = null;
  try {
    capture = await createCaptureIframe(node);
    const preset = presetFor();
    const safeArea = configuredSafeAreaInsets();
    const blob = await window.ProtoDockCapture.capturePagePng({
      iframe: capture.iframe,
      preset,
      safeAreaEnabled: safeAreaEnabled(),
      safeAreaTop: safeArea.top,
      safeAreaBottom: safeArea.bottom,
      includeFrame: captureMode === 'frame'
    });
    const result = await window.ProtoDockCapture.copyPngBlob(blob, safePngFileName(page, captureMode));
    setStatus(result.copied ? `已复制${modeLabel}页面 PNG` : `当前浏览器不能直接复制图片，已下载${modeLabel} PNG`);
  } catch (error) {
    console.error(error);
    setStatus(`复制 PNG 失败：${error.message || '无法生成图片'}`);
  } finally {
    if (capture) {
      capture.iframe.remove();
      revokePreviewUrls(capture.captureNodeId);
    }
    if (els.copyPagePngButton) {
      els.copyPagePngButton.disabled = previousDisabled;
    }
    renderPageSettingsControls();
  }
}

async function openFullProductDocument() {
  if (!state.manifest) {
    setStatus('请先打开一个项目');
    return;
  }
  if (state.productDocumentGenerating) {
    return;
  }
  if (!window.ProtoDockProductDocument?.generate
    || !window.ProtoDockCapture?.capturePagePng
    || !window.ProtoDockProductDocumentCache?.createProjectRevisionSession) {
    setStatus('完整产品文档模块未加载');
    return;
  }

  state.productDocumentGenerating = true;
  renderProjectActions();
  setStatus('正在准备完整产品文档...');

  try {
    const preset = presetFor();
    const interactiveWebDocument = window.ProtoDockProductDocument.documentLayoutMode(
      state.manifest.project
    ) === 'web';
    const livePreviewSessionId = `product-document-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const safeArea = configuredSafeAreaInsets();
    const captureProfile = {
      preset: state.manifest.project?.devicePreset || 'iphone-portrait',
      width: preset.width,
      height: preset.height,
      frameWidth: preset.frameWidth || preset.width,
      frameHeight: preset.frameHeight || preset.height,
      safeAreaEnabled: safeAreaEnabled(),
      safeAreaTop: safeArea.top,
      safeAreaBottom: safeArea.bottom,
      includeFrame: true,
      fullPage: true,
      rendererVersion: 6
    };
    const revisionSession = window.ProtoDockProductDocumentCache.createProjectRevisionSession({
      projectId: state.manifest.project?.id || '',
      projectDirectoryName: state.projectDirectoryName,
      projectHandle: state.projectHandle,
      projectBaseUrl: state.projectBaseUrl,
      shareId: state.shareId,
      manifestHash: state.manifestHash
    });
    const screenshotCache = window.ProtoDockProductDocumentCache.screenshotCache;
    const captureAssetCache = new Map();
    const result = await window.ProtoDockProductDocument.generate({
      viewerUrl: appUrl('/product-document.html'),
      manifest: state.manifest,
      concurrency: PRODUCT_DOCUMENT_CAPTURE_CONCURRENCY,
      loadMarkdown(descriptor) {
        return loadDocForPage(descriptor.id, state.manifest.pages[descriptor.id]);
      },
      async loadPrototype(descriptor) {
        if (!interactiveWebDocument) {
          return {};
        }
        const page = state.manifest.pages[descriptor.id];
        if (!page?.entry) {
          throw new Error('页面没有配置入口文件');
        }
        if (state.projectBaseUrl) {
          return {
            prototypeSrc: new URL(page.entry, state.projectBaseUrl).toString()
          };
        }
        const nodeId = `${livePreviewSessionId}-${descriptor.nodeId || descriptor.id}`;
        const html = await readTextFile(page.entry);
        return {
          prototypeSrcdoc: await rewriteHtmlForLocalPreview(html, page.entry, nodeId)
        };
      },
      async buildPage(descriptor, context = {}) {
        const page = state.manifest.pages[descriptor.id];
        const node = state.manifest.canvas.nodes.find((item) => item.id === descriptor.nodeId);
        const markdown = context.markdown || '';
        const cacheKey = await revisionSession.keyForPage(descriptor, captureProfile);
        const cachedScreenshot = await screenshotCache.get(cacheKey);
        if (cachedScreenshot) {
          return {
            markdown,
            screenshot: cachedScreenshot,
            captureError: '',
            cacheHit: true
          };
        }
        let capture = null;

        try {
          if (!node) {
            throw new Error('页面没有对应的画布节点');
          }
          capture = await acquireCaptureIframe(node);
          const screenshot = await window.ProtoDockCapture.capturePagePng({
            iframe: capture.iframe,
            preset,
            safeAreaEnabled: safeAreaEnabled(),
            safeAreaTop: safeArea.top,
            safeAreaBottom: safeArea.bottom,
            includeFrame: true,
            fullPage: true,
            assetCache: captureAssetCache
          });
          await screenshotCache.set(cacheKey, screenshot);
          return { markdown, screenshot, captureError: '', cacheHit: false };
        } finally {
          releaseCaptureIframe(capture);
        }
      },
      onPageError(descriptor, error) {
        console.warn(`ProtoDock: product document capture failed for ${descriptor.id}`, error);
      },
      onPrototypeError(descriptor, error) {
        console.warn(`ProtoDock: interactive product preview failed for ${descriptor.id}`, error);
      },
      onProgress(current, total, progress) {
        const cacheLabel = progress.cached ? `，缓存 ${progress.cached}` : '';
        setStatus(`正在生成完整产品文档 ${current}/${total}${cacheLabel}`);
      }
    });
    if (result.failed) {
      setStatus(`完整产品文档已生成，${result.failed} 张截图未生成`);
    } else if (result.cached) {
      setStatus(`完整产品文档已生成，复用 ${result.cached} 张缓存截图`);
    } else {
      setStatus('完整产品文档已生成并缓存截图');
    }
  } catch (error) {
    console.error(error);
    setStatus(`完整产品文档生成失败：${error.message || '未知错误'}`);
  } finally {
    state.productDocumentGenerating = false;
    renderProjectActions();
  }
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

async function resolveLocalPreviewAttribute(element, attribute, value, entryDir, nodeId) {
  const resolved = resolvePath(entryDir, value);
  const tagName = element.tagName?.toLowerCase() || '';
  if (tagName === 'script' && attribute === 'src') {
    const jsText = await readTextFile(resolved);
    const blobUrl = URL.createObjectURL(new Blob([jsText], { type: 'text/javascript' }));
    rememberPreviewUrl(nodeId, blobUrl);
    return blobUrl;
  }
  if (tagName === 'link'
    && attribute === 'href'
    && (element.getAttribute('rel') || '').toLowerCase().includes('stylesheet')) {
    const cssText = await readTextFile(resolved);
    const rewritten = await rewriteCssUrls(cssText, dirname(resolved), nodeId);
    const blobUrl = URL.createObjectURL(new Blob([rewritten], { type: 'text/css' }));
    rememberPreviewUrl(nodeId, blobUrl);
    return blobUrl;
  }
  const { url } = await createBlobUrlFromFile(value, entryDir);
  rememberPreviewUrl(nodeId, url);
  return url;
}

function bindLocalPreviewAssets(iframe, entryPath, nodeId) {
  const entryDir = dirname(entryPath);
  window.ProtoDockLocalPreviewAssets?.bindFrame?.(iframe, {
    resolveAttribute: (element, attribute, value) => (
      resolveLocalPreviewAttribute(element, attribute, value, entryDir, nodeId)
    ),
    rewriteCss: (cssText) => rewriteCssUrls(cssText, entryDir, nodeId),
    onError(error) {
      console.warn('ProtoDock: dynamic local asset missing', error);
    }
  });
}

function normalizedNavigationSuffix(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  try {
    const url = new URL(normalized, window.location.href);
    return `${url.search}${url.hash}`;
  } catch (error) {
    return '';
  }
}

async function rewriteHtmlForLocalPreview(html, entryPath, nodeId, options = {}) {
  const entryDir = dirname(entryPath);
  const documentForPreview = new DOMParser().parseFromString(html, 'text/html');
  const head = documentForPreview.head || documentForPreview.documentElement;
  const guardStyle = documentForPreview.createElement('style');
  guardStyle.textContent = 'html,body{margin:0;}a{cursor:default;}';
  head.prepend(guardStyle);
  const locationSuffix = normalizedNavigationSuffix(options.locationSuffix);
  if (locationSuffix) {
    const locationScript = documentForPreview.createElement('script');
    const injectedSearch = new URL(locationSuffix, window.location.href).search;
    locationScript.textContent = `(() => {
      const injectedSearch = ${JSON.stringify(injectedSearch)};
      const NativeURLSearchParams = window.URLSearchParams;
      window.URLSearchParams = class ProtoDockURLSearchParams extends NativeURLSearchParams {
        constructor(value) {
          super(value === window.location.search && !value ? injectedSearch : value);
        }
      };
    })();`;
    head.prepend(locationScript);
  }

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

async function buildPreviewIframe(node, className = 'prototype-frame', options = {}) {
  const page = pageForNode(node);
  const iframe = document.createElement('iframe');
  iframe.className = className;
  iframe.title = `${page.title || node.pageId} preview`;
  iframe.loading = 'lazy';

  if (state.projectBaseUrl) {
    const entryUrl = new URL(page.entry, state.projectBaseUrl);
    const locationSuffix = normalizedNavigationSuffix(options.locationSuffix);
    if (locationSuffix) {
      const routedUrl = new URL(locationSuffix, entryUrl);
      entryUrl.search = routedUrl.search;
      entryUrl.hash = routedUrl.hash;
    }
    iframe.src = entryUrl.toString();
  } else {
    const html = await readTextFile(page.entry);
    iframe.srcdoc = await rewriteHtmlForLocalPreview(html, page.entry, node.id, options);
    bindLocalPreviewAssets(iframe, page.entry, node.id);
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
    const iframe = await buildPreviewIframe(node, 'playback-frame', {
      locationSuffix: state.playbackLocationSuffix
    });
    window.ProtoDockNavigation?.bindFrame(iframe, {
      manifest: state.manifest,
      pageId: node.pageId,
      onNavigate: navigatePlaybackToPage,
      onBack: navigatePlaybackBack
    });
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
      title: '正在操作原型，点击原型外退出'
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
  setStatus('已启用原型交互，点击原型外退出');
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
      <div class="note-content" contenteditable="${state.readOnly ? 'false' : 'true'}" spellcheck="false">${escapeHtml(note.text)}</div>
    </article>
  `;
}

function canvasGroups() {
  return state.manifest?.canvas.groups || [];
}

function groupForNodeId(nodeId) {
  return window.ProtoDockGroups?.groupForNode(canvasGroups(), nodeId) || null;
}

function renderedCanvasNodes() {
  if (!state.manifest) {
    return [];
  }
  return window.ProtoDockGroups?.effectiveNodes(
    state.manifest.canvas.nodes,
    state.groupLayoutPreview
  ) || state.manifest.canvas.nodes;
}

function normalizedPageSearchQuery() {
  return state.pageSearchQuery.trim().toLocaleLowerCase();
}

function pageMatchesSearch(node, group, query) {
  const page = pageForNode(node);
  return window.ProtoDockGroups?.matchesPageSearch(node, page, group, query) ?? true;
}

function renderPageListItem(node, index) {
  const page = pageForNode(node);
  return `
    <li class="doc-item ${node.id === state.selectedNodeId ? 'active' : ''} ${node.id === state.draggingPageNodeId ? 'dragging' : ''}" data-page-node="${escapeHtml(node.id)}" draggable="false">
      <button class="page-order-handle" type="button" title="拖拽排序" aria-label="拖拽排序" tabindex="-1"><i data-lucide="grip-vertical"></i></button>
      <span class="page-list-copy">
        <strong>${index + 1}. ${escapeHtml(page.title || node.pageId)}</strong>
        <span>${escapeHtml(page.entry || '未设置入口')}</span>
      </span>
      <i class="page-list-locate" data-lucide="locate-fixed" aria-hidden="true"></i>
    </li>
  `;
}

function renderPageList() {
  if (!state.manifest) {
    state.pageSearchQuery = '';
    els.pageList.innerHTML = '';
    els.pageList.classList.remove('is-sorting');
    if (els.pageSearchInput) {
      els.pageSearchInput.value = '';
      els.pageSearchInput.disabled = true;
    }
    if (els.pageSearchClear) {
      els.pageSearchClear.hidden = true;
    }
    return;
  }
  els.pageList.classList.toggle('is-sorting', state.pageSortMode);
  const query = normalizedPageSearchQuery();
  if (els.pageSearchInput) {
    els.pageSearchInput.disabled = state.pageSortMode;
    if (els.pageSearchInput.value !== state.pageSearchQuery) {
      els.pageSearchInput.value = state.pageSearchQuery;
    }
  }
  if (els.pageSearchClear) {
    els.pageSearchClear.hidden = !query;
  }
  const nodes = state.manifest.canvas.nodes;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const groupedNodeIds = new Set(canvasGroups().flatMap((group) => group.nodeIds));
  const groupHtml = canvasGroups().map((group) => {
    const members = group.nodeIds.map((nodeId) => nodeById.get(nodeId)).filter(Boolean);
    const groupTitleMatches = query && group.title.toLocaleLowerCase().includes(query);
    const matchingMembers = groupTitleMatches ? members : members.filter((node) => pageMatchesSearch(node, group, query));
    if (!matchingMembers.length) {
      return '';
    }
    const isCollapsed = group.collapsed && !query;
    return `
      <li class="page-group" data-page-group="${escapeHtml(group.id)}">
        <div class="page-group-head">
          <button type="button" data-group-toggle="${escapeHtml(group.id)}" title="${query ? '搜索时自动展开' : isCollapsed ? '展开组' : '折叠组'}" aria-label="${query ? '搜索时自动展开' : isCollapsed ? '展开组' : '折叠组'}" aria-expanded="${isCollapsed ? 'false' : 'true'}" ${query ? 'disabled' : ''}>
            <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}"></i>
          </button>
          <span class="page-group-title">
            <strong>${escapeHtml(group.title)}</strong>
            <span>${query && matchingMembers.length !== members.length ? `${matchingMembers.length} / ${members.length}` : members.length} 个页面</span>
          </span>
          <details class="page-group-menu" name="page-group-menu">
            <summary title="页面组操作" aria-label="页面组操作"><i data-lucide="more-horizontal"></i></summary>
            <div class="page-group-menu-popover">
              <button type="button" data-group-focus="${escapeHtml(group.id)}">
                <i data-lucide="locate-fixed"></i><span>定位主入口</span>
              </button>
              <button type="button" data-group-layout="${escapeHtml(group.id)}" ${state.readOnly ? 'disabled' : ''}>
                <i data-lucide="layout-template"></i><span>预览组内布局</span>
              </button>
              <button type="button" data-group-edit="${escapeHtml(group.id)}" ${state.readOnly ? 'disabled' : ''}>
                <i data-lucide="settings-2"></i><span>编辑页面组</span>
              </button>
            </div>
          </details>
        </div>
        <ul class="page-group-pages" ${isCollapsed ? 'hidden' : ''}>
          ${matchingMembers.map((node) => renderPageListItem(node, nodeIndex.get(node.id))).join('')}
        </ul>
      </li>
    `;
  }).join('');
  const ungroupedNodes = nodes.filter((node) => !groupedNodeIds.has(node.id) && pageMatchesSearch(node, null, query));
  const ungroupedHtml = ungroupedNodes.length
    ? `${canvasGroups().length ? '<li class="page-list-section-label">未分组</li>' : ''}${ungroupedNodes.map((node) => renderPageListItem(node, nodeIndex.get(node.id))).join('')}`
    : '';
  els.pageList.innerHTML = groupHtml + ungroupedHtml || '<li class="page-list-empty">未找到匹配页面</li>';
  window.lucide?.createIcons();
}

function renderGroupFrames(nodes = renderedCanvasNodes()) {
  if (!els.groupMount || !state.manifest) {
    return;
  }
  const nodeSize = estimatedNodeSize();
  els.groupMount.innerHTML = canvasGroups().map((group) => {
    const bounds = window.ProtoDockGroups?.groupBounds(group, nodes, nodeSize);
    if (!bounds) {
      return '';
    }
    return `
      <section class="canvas-group-frame" data-canvas-group="${escapeHtml(group.id)}" style="left:${bounds.x}px;top:${bounds.y}px;width:${bounds.width}px;height:${bounds.height}px;">
        <header><strong>${escapeHtml(group.title)}</strong><span>${group.nodeIds.length} 个页面</span></header>
      </section>
    `;
  }).join('');
}

function renderProjectActions() {
  const hasProject = !!state.manifest;
  const canEdit = canEditProject();
  document.querySelectorAll('[data-requires-project]').forEach((button) => {
    button.disabled = !hasProject;
  });
  buttons.openProductDocument?.toggleAttribute('disabled', !hasProject || state.productDocumentGenerating);
  [
    buttons.saveProject,
    buttons.addNode,
    buttons.addText,
    els.safeAreaToggle,
    els.safeAreaSettingsButton,
    els.saveSafeAreaSettings,
    els.addGroupButton,
    els.sortPagesButton,
    els.savePageSettings
  ].forEach((control) => {
    control?.toggleAttribute('disabled', !canEdit);
  });
  buttons.saveProject?.toggleAttribute('disabled', !canEdit || state.projectSaving);
  buttons.reloadProject?.toggleAttribute('disabled', !hasProject || (!state.projectHandle && !state.projectBaseUrl));
  els.productSelect?.toggleAttribute('disabled', !canEdit);
  els.productSelect?.setAttribute('aria-disabled', String(!canEdit));
  els.productSelect?.setAttribute('title', canEdit ? '修改项目名称' : (hasProject ? '当前项目（只读）' : '未打开项目'));
  els.productSelect?.setAttribute('aria-label', canEdit ? '修改项目名称' : '当前项目');
  els.nodeInspectorPanel?.classList.toggle('is-readonly', hasProject && state.readOnly);
  syncMarkdownReadOnlyState(hasProject && state.readOnly);
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
  const canEdit = canEditProject();
  if (!canEdit) {
    state.safeAreaSettingsOpen = false;
  }
  if (els.safeAreaPanel) {
    els.safeAreaPanel.hidden = !canEdit || !state.safeAreaSettingsOpen;
  }
  if (els.safeAreaSettingsButton) {
    els.safeAreaSettingsButton.classList.toggle('active', state.safeAreaSettingsOpen);
    els.safeAreaSettingsButton.setAttribute('aria-expanded', String(state.safeAreaSettingsOpen));
  }
  els.safeAreaTopInput?.toggleAttribute('disabled', !canEdit);
  els.safeAreaBottomInput?.toggleAttribute('disabled', !canEdit);
  els.saveSafeAreaSettings?.toggleAttribute('disabled', !canEdit);
  if (!state.safeAreaSettingsOpen) {
    syncSafeAreaInputs();
  }
}

function syncPageSettingsInputs() {
  const node = activeNode();
  const page = activePage();
  if (!node || !page) {
    return;
  }
  state.pageSettingsNodeId = node.id;
  if (els.pageTitleInput) {
    els.pageTitleInput.value = page.title || node.pageId;
  }
  if (els.pageKindInput) {
    els.pageKindInput.value = page.kind || '';
  }
  if (els.pageSourceDirInput) {
    els.pageSourceDirInput.value = page.sourceDir || dirname(page.entry || '');
  }
  if (els.pageEntryInput) {
    els.pageEntryInput.value = page.entry || '';
  }
  if (els.pageDocInput) {
    els.pageDocInput.value = page.doc || '';
  }
}

function renderPageSettingsControls() {
  const hasActivePage = !!activeNode() && !!activePage();
  const canEdit = hasActivePage && !state.readOnly;
  if (!hasActivePage) {
    state.pageSettingsOpen = false;
    state.pageSettingsNodeId = null;
  }
  if (els.pageSettingsView) {
    els.pageSettingsView.hidden = !hasActivePage || !state.pageSettingsOpen;
  }
  if (els.sourceMeta) {
    els.sourceMeta.hidden = !hasActivePage || !state.pageSettingsOpen || canEdit;
  }
  if (els.pageSettingsPanel) {
    els.pageSettingsPanel.hidden = !canEdit || !state.pageSettingsOpen;
  }
  if (els.nodeInspectorPanel) {
    els.nodeInspectorPanel.hidden = hasActivePage && state.pageSettingsOpen;
  }
  els.inspector?.classList.toggle('is-page-settings', hasActivePage && state.pageSettingsOpen);
  if (els.pageSettingsButton) {
    els.pageSettingsButton.hidden = !hasActivePage;
    els.pageSettingsButton.disabled = !hasActivePage;
    els.pageSettingsButton.classList.toggle('active', state.pageSettingsOpen);
    els.pageSettingsButton.setAttribute('aria-expanded', String(state.pageSettingsOpen));
    els.pageSettingsButton.setAttribute('title', state.pageSettingsOpen ? '返回 PRD' : '查看页面信息');
    els.pageSettingsButton.setAttribute('aria-label', state.pageSettingsOpen ? '返回 PRD' : '查看页面信息');
  }
  if (els.copyPagePngButton) {
    els.capturePngControls.hidden = !hasActivePage;
    els.copyPagePngButton.hidden = !hasActivePage;
    els.copyPagePngButton.disabled = !hasActivePage;
  }
  window.ProtoDockCaptureOptions?.setDisabled?.(!hasActivePage);
  [
    els.pageTitleInput,
    els.pageKindInput,
    els.pageSourceDirInput,
    els.pageEntryInput,
    els.pageDocInput,
    els.savePageSettings
  ].forEach((control) => {
    control?.toggleAttribute('disabled', !canEdit);
  });
  if (hasActivePage && (!state.pageSettingsOpen || state.pageSettingsNodeId !== activeNode().id)) {
    syncPageSettingsInputs();
  }
}

function setPageSettingsOpen(open) {
  if (!activeNode() || !activePage()) {
    return;
  }
  state.pageSettingsOpen = !!open;
  state.pageSettingsNodeId = activeNode()?.id || null;
  if (state.pageSettingsOpen) {
    syncPageSettingsInputs();
  }
  renderPageSettingsControls();
  window.lucide?.createIcons();
}

function savePageSettings() {
  const node = activeNode();
  const page = activePage();
  if (!node || !page || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
    return;
  }
  const next = {
    title: (els.pageTitleInput?.value || '').trim() || node.pageId,
    kind: (els.pageKindInput?.value || '').trim(),
    sourceDir: (els.pageSourceDirInput?.value || '').trim(),
    entry: (els.pageEntryInput?.value || '').trim(),
    doc: (els.pageDocInput?.value || '').trim()
  };
  let changed = false;
  ['title', 'kind', 'sourceDir', 'entry', 'doc'].forEach((key) => {
    if ((page[key] || '') !== next[key]) {
      page[key] = next[key];
      changed = true;
    }
  });
  state.pageSettingsOpen = false;
  renderCanvas();
  if (changed) {
    markDirty('页面信息已修改');
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
    els.currentProjectName.textContent = '未打开项目';
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
  els.currentProjectName.textContent = state.manifest.project.name;
  renderPageList();
}

function renameProject(name) {
  if (!state.manifest) {
    setStatus('请先打开一个项目');
    return { ok: false, message: '请先打开一个项目' };
  }
  if (state.readOnly) {
    const message = readonlyProjectMessage();
    setStatus(message);
    return { ok: false, message };
  }
  const nextName = String(name || '').trim();
  if (!nextName) {
    return { ok: false, message: '项目名称不能为空' };
  }
  if (nextName === state.manifest.project.name) {
    return { ok: true, changed: false, name: nextName };
  }
  state.manifest.project.name = nextName;
  renderChrome();
  markDirty('项目名称已修改，正在等待保存');
  return { ok: true, changed: true, name: nextName };
}

function renderCanvas() {
  if (!state.manifest) {
    state.editingEdgeLabelId = null;
    els.groupMount.innerHTML = '';
    els.nodeMount.innerHTML = '';
    els.noteMount.innerHTML = '';
    els.edgeLayer.innerHTML = markerDefs();
    els.groupLayoutReview.hidden = true;
    renderEdgeLabelEditor();
    renderChrome();
    renderMinimap();
    return;
  }
  const nodes = renderedCanvasNodes();
  els.nodeMount.innerHTML = nodes.map((node) => renderNode(node, state.manifest.canvas.nodes.findIndex((item) => item.id === node.id))).join('');
  els.noteMount.innerHTML = state.manifest.canvas.notes.map(renderNote).join('');
  renderGroupFrames(nodes);
  renderEdges();
  bindRenderedCanvas();
  renderChrome();
  renderGroupLayoutReview();
  updateInspector();
  updateZoom();
  window.lucide?.createIcons();
  syncPreviewInteractionUi();
  nodes.forEach(hydratePreview);
}

function renderGroupLayoutReview() {
  if (!els.groupLayoutReview) {
    return;
  }
  const preview = state.groupLayoutPreview;
  const group = preview ? canvasGroups().find((item) => item.id === preview.groupId) : null;
  if (!group) {
    els.groupLayoutReview.hidden = true;
    return;
  }
  els.groupLayoutReviewText.textContent = `预览「${group.title}」组内布局`;
  els.groupLayoutReview.hidden = false;
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

function fallbackEdgePath(from, to, fromSide, toSide) {
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

function edgeDescriptor(edge) {
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
    id: edge.id,
    toId: edge.to,
    label: edge.label || '',
    from,
    to,
    fromSide,
    toSide
  };
}

function edgeGeometryMap() {
  const descriptors = (state.manifest?.canvas.edges || []).map(edgeDescriptor).filter(Boolean);
  const routed = window.ProtoDockEdgeRouting?.routeEdges(descriptors) || descriptors.map((edge) => ({
    ...edge,
    path: fallbackEdgePath(edge.from, edge.to, edge.fromSide, edge.toSide),
    labelX: (edge.from.x + edge.to.x) / 2,
    labelY: (edge.from.y + edge.to.y) / 2 - 8,
    labelWidth: 96,
    labelHeight: 22,
    labelDirection: 'right'
  }));
  return new Map(routed.map((geometry) => [geometry.id, geometry]));
}

function edgeGeometry(edge) {
  return edgeGeometryMap().get(edge.id) || null;
}

function edgeLabelChevronPath(direction, width) {
  const x = width / 2 - 11;
  if (direction === 'down') {
    return `M ${x - 3} -2 L ${x} 1 L ${x + 3} -2`;
  }
  if (direction === 'up') {
    return `M ${x - 3} 2 L ${x} -1 L ${x + 3} 2`;
  }
  if (direction === 'left') {
    return `M ${x + 2} -3 L ${x - 1} 0 L ${x + 2} 3`;
  }
  return `M ${x - 2} -3 L ${x + 1} 0 L ${x - 2} 3`;
}

function edgeLabelSvg(edge, geometry, selected) {
  if (!edge.label) {
    return '';
  }
  const width = geometry.labelWidth || 96;
  const height = geometry.labelHeight || 22;
  return `
    <g class="edge-label-tag ${selected ? 'selected' : ''}" transform="translate(${geometry.labelX} ${geometry.labelY})">
      <rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="5"></rect>
      <text class="edge-label" x="-5" y="0">${escapeHtml(edge.label)}</text>
      <path class="edge-label-direction" d="${edgeLabelChevronPath(geometry.labelDirection, width)}"></path>
    </g>
  `;
}

function draftEdgeSvg() {
  const draft = state.activeEdgeDrag;
  if (!draft) {
    return '';
  }
  return `<path class="edge-draft" marker-end="url(#arrow)" d="M ${draft.fromPoint.x} ${draft.fromPoint.y} L ${draft.currentPoint.x} ${draft.currentPoint.y}"></path>`;
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
  if (!state.manifest || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
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
  const geometries = edgeGeometryMap();
  const edgeSvg = state.manifest.canvas.edges.map((edge) => {
    const geometry = geometries.get(edge.id);
    if (!geometry) {
      return '';
    }
    const selected = edge.id === state.selectedEdgeId;
    return `
      <g data-edge-id="${escapeHtml(edge.id)}">
        <path class="edge-path ${selected ? 'selected' : ''}" marker-end="url(#arrow)" d="${geometry.path}"></path>
        <path class="edge-hit" d="${geometry.path}"></path>
        ${edgeLabelSvg(edge, geometry, selected)}
      </g>
    `;
  }).join('');
  els.edgeLayer.innerHTML = markerDefs() + edgeSvg + draftEdgeSvg();
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
  scheduleRenderMinimap();
}

function bindRenderedCanvas() {
  document.querySelectorAll('.page-node').forEach((element) => {
    element.addEventListener('pointerdown', handleNodePointerDown);
    element.querySelector('[data-preview-action-node]')?.addEventListener('click', handlePreviewActionClick);
    element.querySelector('[data-preview-action-node]')?.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });
    element.querySelectorAll('.node-anchor').forEach((anchor) => {
      anchor.addEventListener('pointerdown', handleAnchorPointerDown);
    });
  });
  document.querySelectorAll('.text-note').forEach((noteElement) => {
    noteElement.addEventListener('pointerdown', () => selectNote(noteElement.dataset.noteId));
    noteElement.querySelector('.note-grip')?.addEventListener('pointerdown', handleNotePointerDown);
    noteElement.querySelector('.note-content')?.addEventListener('input', () => {
      if (state.readOnly) {
        return;
      }
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
    renderPageSettingsControls();
    setEditorValue('');
    return;
  }

  els.inspectorName.textContent = page.title || node.pageId;
  els.inspectorType.textContent = page.kind || '原型页面';
  els.sourcePath.textContent = page.sourceDir || dirname(page.entry || '') || '-';
  els.entryPath.textContent = page.entry || '-';
  els.docPath.textContent = page.doc || '-';
  renderPageSettingsControls();

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
    if (shareIdFromLocation() && typeof toastui.Editor.factory === 'function') {
      state.markdownEditor = toastui.Editor.factory({
        el: els.markdownMount,
        height: '100%',
        viewer: true,
        initialValue: ''
      });
      return;
    }
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
  if (typeof state.markdownEditor?.getMarkdown === 'function') {
    return state.markdownEditor.getMarkdown();
  }
  return els.markdownFallback.value;
}

function syncMarkdownReadOnlyState(readOnly) {
  els.markdownFallback.readOnly = !!readOnly;
  if (readOnly) {
    els.markdownMount?.setAttribute('tabindex', '0');
  } else {
    els.markdownMount?.removeAttribute('tabindex');
  }
  els.markdownMount?.querySelectorAll('[contenteditable]').forEach((element) => {
    element.setAttribute('contenteditable', readOnly ? 'false' : 'true');
  });
}

function setEditorValue(value) {
  state.isSettingEditorValue = true;
  if (state.markdownEditor) {
    state.markdownEditor.setMarkdown(value || '', false);
  } else {
    els.markdownFallback.value = value || '';
  }
  syncMarkdownReadOnlyState(!!state.manifest && state.readOnly);
  state.isSettingEditorValue = false;
}

function handleEditorChange() {
  if (state.isSettingEditorValue || state.readOnly) {
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
  scheduleRenderMinimap();
}

let canvasMinimapController = null;

function worldRectFromElement(element) {
  return {
    x: Number.parseFloat(element.style.left) || 0,
    y: Number.parseFloat(element.style.top) || 0,
    width: element.offsetWidth,
    height: element.offsetHeight
  };
}

function canvasViewportRect() {
  const rect = els.canvasShell.getBoundingClientRect();
  return {
    x: -state.panX / state.zoom,
    y: -state.panY / state.zoom,
    width: rect.width / state.zoom,
    height: rect.height / state.zoom
  };
}

function buildMinimapScene() {
  if (!state.manifest) {
    return null;
  }
  return {
    padding: 100,
    groups: Array.from(els.groupMount.querySelectorAll('.canvas-group-frame')).map(worldRectFromElement),
    nodes: Array.from(els.nodeMount.querySelectorAll('.page-node')).map((element) => ({
      ...worldRectFromElement(element),
      selected: element.dataset.id === state.selectedNodeId
    })),
    notes: Array.from(els.noteMount.querySelectorAll('.text-note')).map(worldRectFromElement),
    edges: Array.from(els.edgeLayer.querySelectorAll('.edge-path')).map((element) => ({
      path: element.getAttribute('d') || ''
    })),
    viewport: canvasViewportRect()
  };
}

function centerCanvasAt(point) {
  const rect = els.canvasShell.getBoundingClientRect();
  state.panX = rect.width / 2 - point.x * state.zoom;
  state.panY = rect.height / 2 - point.y * state.zoom;
  updateZoom();
  renderEdges();
}

function fitCanvasToBounds(bounds) {
  if (!bounds) {
    return;
  }
  const rect = els.canvasShell.getBoundingClientRect();
  const availableWidth = Math.max(1, rect.width - 96);
  const availableHeight = Math.max(1, rect.height - 96);
  state.zoom = Math.min(1, MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(
    availableWidth / bounds.width,
    availableHeight / bounds.height
  )));
  state.panX = rect.width / 2 - (bounds.x + bounds.width / 2) * state.zoom;
  state.panY = rect.height / 2 - (bounds.y + bounds.height / 2) * state.zoom;
  updateZoom();
  renderEdges();
  setStatus('已显示全部画布内容');
}

function ensureCanvasMinimap() {
  if (!canvasMinimapController && window.ProtoDockMinimap) {
    canvasMinimapController = window.ProtoDockMinimap.create({
      root: els.canvasMinimap,
      svg: els.canvasMinimapSvg,
      fitButton: els.canvasMinimapFit,
      onNavigate: centerCanvasAt,
      onFit: fitCanvasToBounds
    });
  }
  return canvasMinimapController;
}

function renderMinimap() {
  ensureCanvasMinimap()?.render(buildMinimapScene());
}

function scheduleRenderMinimap() {
  if (state.minimapFrameId) {
    return;
  }
  state.minimapFrameId = window.requestAnimationFrame(() => {
    state.minimapFrameId = null;
    renderMinimap();
  });
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
  if (state.groupLayoutPreview) {
    selectNode(nodeId);
    setStatus('当前是布局预览，请先应用或取消');
    event.preventDefault();
    return;
  }
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
  if (state.readOnly) {
    return;
  }
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
  if (state.readOnly) {
    setStatus(readonlyProjectMessage());
    return;
  }
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
  if (state.activePageSortDrag) {
    movePageSortDrag(event);
  }
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
    scheduleRenderMinimap();
  }
  if (state.activeEdgeDrag) {
    state.activeEdgeDrag.currentPoint = screenToWorld(event.clientX, event.clientY);
    renderEdges();
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

function endActiveDrags(event) {
  if (endPageSortDrag(event)) {
    return;
  }
  if (state.activeEdgeDrag) {
    completeAnchorDrag(event);
  }
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

function handleAnchorPointerDown(event) {
  if (event.button !== 0 || !state.manifest || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
    return;
  }
  event.stopPropagation();
  event.preventDefault();
  const nodeElement = event.currentTarget.closest('.page-node');
  const nodeId = nodeElement.dataset.id;
  const side = event.currentTarget.dataset.anchor;
  const rect = getRectForNodeId(nodeId);
  if (!rect) {
    return;
  }
  const fromPoint = connectorPoint(rect, side);
  state.activeEdgeDrag = {
    pointerId: event.pointerId,
    from: nodeId,
    fromSide: side,
    fromPoint,
    currentPoint: screenToWorld(event.clientX, event.clientY)
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  els.canvasShell.classList.add('is-linking');
  renderEdges();
  setStatus('拖到另一个页面锚点完成连线');
}

function completeAnchorDrag(event) {
  const drag = state.activeEdgeDrag;
  if (!drag || !state.manifest) {
    return;
  }
  const targetAnchor = document.elementFromPoint(event.clientX, event.clientY)?.closest('.node-anchor');
  const targetNodeElement = targetAnchor?.closest('.page-node');
  const toNodeId = targetNodeElement?.dataset.id;
  const toSide = targetAnchor?.dataset.anchor;
  state.activeEdgeDrag = null;
  els.canvasShell.classList.remove('is-linking');
  if (!targetAnchor || !toNodeId || !toSide || toNodeId === drag.from) {
    renderEdges();
    setStatus('已取消连线');
    return;
  }
  state.manifest.canvas.edges.push({
    id: `edge-${Date.now()}`,
    from: drag.from,
    to: toNodeId,
    label: '',
    fromSide: drag.fromSide,
    toSide
  });
  renderEdges();
  markDirty('已新增连线');
}

function renderToolMode() {
  buttons.modeSelect?.classList.toggle('active', state.toolMode === 'select');
  buttons.addText?.classList.toggle('active', state.toolMode === 'text');
}

function setToolMode(mode) {
  if (mode !== 'select') {
    exitPreviewInteraction(state.activePreviewNodeId, { silent: true });
  }
  if (state.readOnly && mode !== 'select') {
    state.toolMode = 'select';
    renderToolMode();
    setStatus(readonlyProjectMessage());
    return;
  }
  state.toolMode = mode;
  renderToolMode();
}

function setSafeAreaEnabled(enabled) {
  if (!state.manifest || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
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
  if (!state.manifest || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
    return;
  }
  if (!open && state.safeAreaSettingsOpen) {
    saveSafeAreaSettings();
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
  if (!state.manifest || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
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
  if (!state.manifest || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
    return;
  }
  exitPreviewInteraction(state.activePreviewNodeId, { silent: true });
  const pageId = `page-${Date.now()}`;
  const nodeId = `node-${pageId}`;
  const position = nextNodePosition();
  state.manifest.pages[pageId] = buildPageRecord(pageId, '新页面');
  state.manifest.canvas.nodes.push({
    id: nodeId,
    pageId,
    x: clampCanvasCoord(position.x),
    y: clampCanvasCoord(position.y)
  });
  state.docCache.set(pageId, buildDefaultDoc(pageId, state.manifest.pages[pageId]));
  state.docDirty.add(pageId);
  state.selectedNodeId = nodeId;
  renderCanvas();
  centerNode(nodeId);
  markDirty('已新增页面节点，并定位到新页面');
}

function addTextNote(worldPoint) {
  if (!state.manifest || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
    return;
  }
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
  if (!state.manifest || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
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
    state.manifest.canvas.groups = canvasGroups().map((group) => {
      const nodeIds = group.nodeIds.filter((nodeId) => nodeId !== state.selectedNodeId);
      return {
        ...group,
        nodeIds,
        rootNodeId: group.rootNodeId === state.selectedNodeId ? nodeIds[0] || '' : group.rootNodeId
      };
    }).filter((group) => group.nodeIds.length);
    state.editingEdgeLabelId = null;
    revokePreviewUrls(state.selectedNodeId);
    state.previewResetNodeIds.delete(state.selectedNodeId);
    if (state.activePreviewNodeId === state.selectedNodeId) {
      state.activePreviewNodeId = null;
    }
    state.selectedNodeId = renderedCanvasNodes()[0]?.id || null;
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
    const baseUrl = new URL('examples/pictale/', appBaseUrl());
    const manifestUrl = new URL(MANIFEST_FILE, baseUrl);
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('示例项目不存在');
    }
    const text = await response.text();
    await loadManifestText(text, {
      projectBaseUrl: baseUrl.toString(),
      projectDirectoryName: 'examples/pictale',
      readOnly: true,
      shareId: null
    });
    setStatus('已加载示例项目');
  } catch (error) {
    console.warn(error);
    state.manifest = null;
    state.editingEdgeLabelId = null;
    state.activeEdgeDrag = null;
    state.safeAreaSettingsOpen = false;
    state.pageSettingsOpen = false;
    state.pageSettingsNodeId = null;
    state.pageSortMode = false;
    state.draggingPageNodeId = null;
    state.activePageSortDrag = null;
    renderCanvas();
    setStatus('选择工作目录开始');
  }
}

function showStartScreen(message = '选择工作目录开始') {
  state.manifest = null;
  state.projectHandle = null;
  state.manifestHandle = null;
  state.projectBaseUrl = null;
  state.projectDirectoryName = null;
  state.shareId = null;
  state.readOnly = true;
  state.manifestHash = null;
  state.dirty = false;
  state.docCache.clear();
  state.docDirty.clear();
  state.previewUrls.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)));
  state.previewUrls.clear();
  state.previewJobs.clear();
  state.previewResetNodeIds.clear();
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.selectedNoteId = null;
  state.editingEdgeLabelId = null;
  state.activePreviewNodeId = null;
  state.activeEdgeDrag = null;
  state.safeAreaSettingsOpen = false;
  state.pageSettingsOpen = false;
  state.pageSettingsNodeId = null;
  state.pageSortMode = false;
  state.draggingPageNodeId = null;
  state.activePageSortDrag = null;
  state.pageSearchQuery = '';
  state.editingGroupId = null;
  state.groupLayoutPreview = null;
  state.canvasBackupCreated = false;
  state.toolMode = 'select';
  state.panX = 0;
  state.panY = 0;
  state.zoom = window.innerWidth < 760 ? 0.78 : 1;
  renderToolMode();
  renderCanvas();
  setStatus(message);
}

function shareIdFromLocation() {
  return window.ProtoDockShareReference?.fromLocation?.() || null;
}

async function loadSharedProject(shareId) {
  try {
    const basePath = window.ProtoDockShareReference?.assetBasePath?.(shareId);
    if (!basePath) {
      throw new Error('分享项目编号无效');
    }
    const baseUrl = new URL(appUrl(basePath));
    const manifestUrl = new URL(MANIFEST_FILE, baseUrl);
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('分享项目不存在');
    }
    const text = await response.text();
    await loadManifestText(text, {
      projectBaseUrl: baseUrl.toString(),
      projectDirectoryName: `share:${shareId}`,
      readOnly: true,
      shareId
    });
    setStatus('已加载分享预览');
  } catch (error) {
    console.error(error);
    state.manifest = null;
    state.projectHandle = null;
    state.manifestHandle = null;
    state.projectBaseUrl = null;
    state.projectDirectoryName = null;
    state.shareId = null;
    state.readOnly = true;
    state.dirty = false;
    state.selectedNodeId = null;
    state.selectedEdgeId = null;
    state.selectedNoteId = null;
    state.editingEdgeLabelId = null;
    state.activeEdgeDrag = null;
    renderCanvas();
    setStatus(`分享链接无法加载：${error.message || '项目包不可用'}`);
  }
}

async function loadManifestText(text, options = {}) {
  stopManifestWatcher();
  stopPlayback();
  state.previewUrls.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)));
  state.previewUrls.clear();
  state.previewResetNodeIds.clear();
  state.activePreviewNodeId = null;
  state.editingEdgeLabelId = null;
  state.activeEdgeDrag = null;
  state.safeAreaSettingsOpen = false;
  state.pageSettingsOpen = false;
  state.pageSettingsNodeId = null;
  state.pageSortMode = false;
  state.draggingPageNodeId = null;
  state.activePageSortDrag = null;
  state.pageSearchQuery = '';
  state.editingGroupId = null;
  state.groupLayoutPreview = null;
  state.canvasBackupCreated = false;
  state.docCache.clear();
  state.docDirty.clear();
  state.manifest = normalizeManifest(JSON.parse(text));
  state.projectHandle = options.projectHandle || null;
  state.manifestHandle = options.manifestHandle || null;
  state.projectBaseUrl = options.projectBaseUrl || null;
  state.projectDirectoryName = options.projectDirectoryName || null;
  state.shareId = options.shareId || null;
  state.readOnly = !!options.readOnly;
  state.manifestHash = await hashText(text);
  state.ignoredExternalManifestHash = null;
  state.dirty = false;
  state.selectedNodeId = renderedCanvasNodes()[0]?.id || null;
  state.selectedEdgeId = null;
  state.selectedNoteId = null;
  state.panX = 0;
  state.panY = 0;
  state.zoom = window.innerWidth < 760 ? 0.78 : 1;
  renderCanvas();
  startManifestWatcher();
}

function localProjectErrorMessage(error) {
  if (error?.name === 'NotFoundError') {
    return `项目根目录缺少 ${MANIFEST_FILE}`;
  }
  if (error?.name === 'NotAllowedError') {
    return '需要授予项目文件夹读写权限';
  }
  return error?.message || `未找到 ${MANIFEST_FILE}`;
}

async function loadLocalProjectHandle(handle) {
  if (!handle || handle.kind !== 'directory') {
    throw new Error('请选择一个项目文件夹');
  }
  const hasPermission = await window.ProtoDockProjectDrop?.ensureReadWritePermission?.(handle);
  if (hasPermission === false) {
    const error = new Error('需要授予项目文件夹读写权限');
    error.name = 'NotAllowedError';
    throw error;
  }
  const manifestHandle = await handle.getFileHandle(MANIFEST_FILE);
  const text = await (await manifestHandle.getFile()).text();
  const parsedManifest = JSON.parse(text);
  const directoryValidation = await window.ProtoDockProjectDrop?.validateProjectDirectory?.(handle, parsedManifest);
  if (directoryValidation?.missingPaths.length) {
    const examples = directoryValidation.missingPaths.slice(0, 3).join('、');
    const remaining = directoryValidation.missingPaths.length - Math.min(directoryValidation.missingPaths.length, 3);
    const error = new Error(
      `所选目录不是完整的 ProtoDock 项目根目录，缺少 ${examples}${remaining ? ` 等 ${directoryValidation.missingPaths.length} 个文件` : ''}。`
      + `请打开直接包含 ${MANIFEST_FILE}、pages、docs 和所需 assets 的可编辑项目根目录，不要打开 dist 或完整交付外层目录。`
    );
    error.name = 'InvalidProjectRootError';
    throw error;
  }
  await loadManifestText(text, {
    projectHandle: handle,
    manifestHandle,
    projectDirectoryName: handle.name,
    readOnly: false
  });
  setStatus(`已打开 ${handle.name}`);
}

async function openProjectDirectory() {
  if (!window.showDirectoryPicker) {
    setStatus('当前浏览器不支持目录读写，请使用 Chrome / Edge');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await loadLocalProjectHandle(handle);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error(error);
      setStatus(`打开失败：${localProjectErrorMessage(error)}`);
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

function openNewProjectModal() {
  state.selectedPresetId = state.manifest?.project?.devicePreset || 'iphone-portrait';
  state.selectedProjectDirectoryHandle = null;
  els.projectName.value = '新 ProtoDock 项目';
  els.projectDirectory.value = '';
  renderPresetPicker();
  renderDirectoryPreview();
  els.projectModal.hidden = false;
  els.projectName.focus();
}

function closeNewProjectModal() {
  els.projectModal.hidden = true;
}

function openProjectMenuModal() {
  if (!els.openProjectModal) {
    openProjectDirectory();
    return;
  }
  const githubPreferences = window.ProtoDockGithubPreferences?.getOpenProject?.() || {};
  if (els.githubOpenRepo && !els.githubOpenRepo.value) {
    els.githubOpenRepo.value = githubPreferences.repoUrl || '';
  }
  if (els.githubOpenBranch && !els.githubOpenBranch.value) {
    els.githubOpenBranch.value = githubPreferences.branch || '';
  }
  if (els.githubOpenProjectPath && !els.githubOpenProjectPath.value) {
    els.githubOpenProjectPath.value = githubPreferences.projectPath || '';
  }
  if (els.githubOpenStatus) {
    els.githubOpenStatus.textContent = '等待填写仓库地址和分支';
  }
  if (els.openLocalProjectStatus) {
    els.openLocalProjectStatus.textContent = '选择或拖入完整项目根目录，根下须直接包含清单、pages 和 docs。';
  }
  buttons.openLocalProjectFromMenu?.classList.remove('is-drag-over', 'is-loading', 'is-error');
  els.openProjectModal.hidden = false;
  buttons.openLocalProjectFromMenu?.focus();
}

function closeProjectMenuModal() {
  if (els.openProjectModal) {
    els.openProjectModal.hidden = true;
  }
}

async function openDroppedProjectDirectory(handle) {
  try {
    await loadLocalProjectHandle(handle);
    closeProjectMenuModal();
  } catch (error) {
    throw new Error(localProjectErrorMessage(error));
  }
}

function updateLocalProjectDropState(status, message = '') {
  const target = buttons.openLocalProjectFromMenu;
  if (!target || !els.openLocalProjectStatus) {
    return;
  }
  target.classList.toggle('is-loading', status === 'loading');
  target.classList.toggle('is-error', status === 'error');
  if (status === 'dragging') {
    els.openLocalProjectStatus.textContent = '松开即可打开这个项目文件夹';
  } else if (status === 'loading') {
    els.openLocalProjectStatus.textContent = '正在读取项目文件夹...';
  } else if (status === 'error') {
    els.openLocalProjectStatus.textContent = `打开失败：${message}`;
  } else if (status === 'idle') {
    els.openLocalProjectStatus.textContent = '选择或拖入完整项目根目录，根下须直接包含清单、pages 和 docs。';
  }
}

async function openLocalProjectFromMenu() {
  closeProjectMenuModal();
  await openProjectDirectory();
}

function openPublicPreviewFromMenu() {
  closeProjectMenuModal();
  openPublicPreviewModal();
}

function setGithubOpenBusy(busy) {
  buttons.openGithubProject?.toggleAttribute('disabled', busy);
  els.githubOpenRepo?.toggleAttribute('disabled', busy);
  els.githubOpenBranch?.toggleAttribute('disabled', busy);
  els.githubOpenProjectPath?.toggleAttribute('disabled', busy);
}

async function openGithubProjectFromMenu() {
  const repoUrl = (els.githubOpenRepo?.value || '').trim();
  const branch = (els.githubOpenBranch?.value || '').trim();
  const projectPath = (els.githubOpenProjectPath?.value || '').trim();

  if (!repoUrl) {
    els.githubOpenStatus.textContent = '请填写 GitHub 仓库地址';
    els.githubOpenRepo?.focus();
    return;
  }
  if (!branch) {
    els.githubOpenStatus.textContent = '请填写分支';
    els.githubOpenBranch?.focus();
    return;
  }

  setGithubOpenBusy(true);
  els.githubOpenStatus.textContent = '正在下载 GitHub 项目...';
  try {
    const response = await fetch('/api/github/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl, branch, projectPath })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || '无法打开 GitHub 项目');
    }
    window.ProtoDockGithubPreferences?.setOpenProject?.({ repoUrl, branch, projectPath });
    els.githubOpenStatus.textContent = '已生成只读预览，正在打开...';
    window.location.href = payload.url || appUrl(payload.path || `/s/${encodeURIComponent(payload.id)}`);
  } catch (error) {
    console.error(error);
    els.githubOpenStatus.textContent = error.message || '无法打开 GitHub 项目';
  } finally {
    setGithubOpenBusy(false);
  }
}

function renderPublicPreviewList(items = []) {
  if (!els.publicPreviewList) {
    return;
  }
  if (!items.length) {
    els.publicPreviewList.innerHTML = '<div class="public-preview-empty">暂无公开预览项目</div>';
    return;
  }
  els.publicPreviewList.innerHTML = items.map((item) => `
    <button class="public-preview-item" type="button" data-share-url="${escapeHtml(shareUrlForItem(item))}">
      <strong>${escapeHtml(item.name || '未命名项目')}</strong>
      <span>${escapeHtml(shareUrlForItem(item))}</span>
    </button>
  `).join('');
}

function shareUrlForItem(item) {
  const path = item.path || (item.id ? window.ProtoDockShareReference?.sharePath?.(item.id) : item.url || '');
  if (!path) {
    return '';
  }
  return appUrl(path);
}

async function loadPublicPreviews() {
  if (els.publicPreviewList) {
    els.publicPreviewList.innerHTML = '';
  }
  try {
    const response = await fetch('/api/shares', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || '无法读取公开预览');
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    renderPublicPreviewList(items);
  } catch (error) {
    console.warn('ProtoDock: unable to load public previews', error);
    renderPublicPreviewList([]);
  }
}

function openPublicPreviewModal() {
  if (!els.publicPreviewModal) {
    return;
  }
  els.publicPreviewModal.hidden = false;
  loadPublicPreviews();
}

function closePublicPreviewModal() {
  if (els.publicPreviewModal) {
    els.publicPreviewModal.hidden = true;
  }
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
    changelog: [],
    pendingChanges: [],
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
      groups: [],
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
├── .gitignore
├── ${MANIFEST_FILE}
├── protodock.local.json        # 可选，本地集成配置，不提交
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
- 产品文档放在 \`docs/<page-id>.md\`，必须覆盖页面定位、场景、规则、状态、数据影响和产品验收。
- 产品验收统一使用“前提 / 操作 / 预期”，源码路径和技术实现不要写入 PRD 主体。
- 可以更新 \`${MANIFEST_FILE}\` 中的 \`pages\` 字段，但不要改 \`canvas.nodes[].x\`、\`canvas.nodes[].y\`、\`canvas.edges\` 或 \`canvas.groups\`，除非用户要求调整 flow 或页面组。
- 每次完成一批修改后，向 \`${MANIFEST_FILE}\` 的 \`pendingChanges\` 追加时间和变更内容，不要自行生成版本号。ProtoDock 发布时会把累计内容合并为一条正式 \`changelog\`，并以发布版本号为准。
- 飞书机器人 Webhook 等本地密钥只放在 \`protodock.local.json\`，不得写入 manifest、页面、文档、发布包或 GitHub。
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
    await writeInitialFile(root, '.gitignore', 'protodock.local.json\n');
    await writeInitialFile(root, 'pages/home/index.html', starterHtml(name));
    await writeInitialFile(root, 'docs/home.md', buildDefaultDoc('home', manifest.pages.home));
    const manifestHandle = await root.getFileHandle(MANIFEST_FILE);
    closeNewProjectModal();
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

async function ensureCanvasBackup() {
  if (state.canvasBackupCreated) {
    return true;
  }
  if (!state.projectHandle || state.readOnly) {
    setStatus(state.readOnly ? readonlyProjectMessage() : '无法创建画布备份');
    return false;
  }
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '-');
  const path = `protodock/backups/protodock.project.${timestamp}.json`;
  try {
    await writeInitialFile(state.projectHandle, path, manifestText(state.manifest));
    state.canvasBackupCreated = true;
    return true;
  } catch (error) {
    console.error(error);
    setStatus(`画布备份失败：${error.message || '无法写入备份文件'}`);
    return false;
  }
}

function groupById(groupId) {
  return canvasGroups().find((group) => group.id === groupId) || null;
}

function groupOwnerForNode(nodeId, excludingGroupId = null) {
  return canvasGroups().find((group) => group.id !== excludingGroupId && group.nodeIds.includes(nodeId)) || null;
}

function renderGroupModal() {
  if (!state.manifest || !els.groupModal) {
    return;
  }
  const group = groupById(state.editingGroupId);
  const selectedNodeIds = new Set(group?.nodeIds || []);
  els.groupModalTitle.textContent = group ? '编辑页面组' : '新建页面组';
  els.groupNameInput.value = group?.title || '';
  els.deleteGroup.hidden = !group;
  els.groupPageOptions.innerHTML = state.manifest.canvas.nodes.map((node) => {
    const page = pageForNode(node);
    const owner = groupOwnerForNode(node.id, group?.id);
    return `
      <label class="group-page-option ${owner ? 'is-unavailable' : ''}">
        <input type="checkbox" value="${escapeHtml(node.id)}" ${selectedNodeIds.has(node.id) ? 'checked' : ''} ${owner ? 'disabled' : ''}>
        <span>
          <strong>${escapeHtml(page.title || node.pageId)}</strong>
          <small>${owner ? `已属于「${escapeHtml(owner.title)}」` : escapeHtml(page.entry || node.pageId)}</small>
        </span>
      </label>
    `;
  }).join('');
  syncGroupRootOptions(group?.rootNodeId || '');
  els.groupStatus.textContent = group ? '修改只影响分组，不会删除页面或连线' : '请选择至少一个页面';
}

function selectedGroupModalNodeIds() {
  return Array.from(els.groupPageOptions?.querySelectorAll('input[type="checkbox"]:checked') || []).map((input) => input.value);
}

function syncGroupRootOptions(preferredRootId = els.groupRootSelect?.value || '') {
  const selectedNodeIds = selectedGroupModalNodeIds();
  const nodeById = new Map((state.manifest?.canvas.nodes || []).map((node) => [node.id, node]));
  els.groupRootSelect.innerHTML = selectedNodeIds.map((nodeId) => {
    const node = nodeById.get(nodeId);
    const page = node ? pageForNode(node) : null;
    return `<option value="${escapeHtml(nodeId)}">${escapeHtml(page?.title || node?.pageId || nodeId)}</option>`;
  }).join('');
  if (selectedNodeIds.includes(preferredRootId)) {
    els.groupRootSelect.value = preferredRootId;
  }
  els.groupRootSelect.disabled = !selectedNodeIds.length;
  els.groupPageCount.textContent = `${selectedNodeIds.length} 个页面`;
  els.groupStatus.textContent = selectedNodeIds.length ? '请选择组的主入口页面' : '请选择至少一个页面';
}

function openGroupModal(groupId = null) {
  if (!state.manifest || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
    return;
  }
  state.editingGroupId = groupId;
  renderGroupModal();
  els.groupModal.hidden = false;
  window.requestAnimationFrame(() => els.groupNameInput?.focus());
}

function closeGroupModal() {
  if (els.groupModal) {
    els.groupModal.hidden = true;
  }
  state.editingGroupId = null;
}

async function saveGroupFromModal() {
  if (!state.manifest || state.readOnly) {
    return;
  }
  const title = els.groupNameInput.value.trim();
  const nodeIds = selectedGroupModalNodeIds();
  const rootNodeId = els.groupRootSelect.value;
  if (!title) {
    els.groupStatus.textContent = '请填写组名称';
    els.groupNameInput.focus();
    return;
  }
  if (!nodeIds.length || !nodeIds.includes(rootNodeId)) {
    els.groupStatus.textContent = '请选择组内页面和主入口';
    return;
  }
  if (!await ensureCanvasBackup()) {
    return;
  }
  const existing = groupById(state.editingGroupId);
  if (existing) {
    existing.title = title;
    existing.nodeIds = nodeIds;
    existing.rootNodeId = rootNodeId;
  } else {
    state.manifest.canvas.groups.push({
      id: `group-${Date.now()}`,
      title,
      rootNodeId,
      nodeIds,
      collapsed: true
    });
  }
  state.selectedNodeId = rootNodeId;
  closeGroupModal();
  renderCanvas();
  markDirty(existing ? '页面组已更新' : '页面组已创建');
}

async function deleteEditingGroup() {
  const group = groupById(state.editingGroupId);
  if (!group || !confirm(`删除页面组「${group.title}」？组内页面和连线会保留。`)) {
    return;
  }
  if (!await ensureCanvasBackup()) {
    return;
  }
  state.manifest.canvas.groups = canvasGroups().filter((item) => item.id !== group.id);
  closeGroupModal();
  renderCanvas();
  markDirty('页面组已删除，组内页面保持不变');
}

async function toggleGroupCollapsed(groupId) {
  const group = groupById(groupId);
  if (!group) {
    return;
  }
  if (!state.readOnly && !await ensureCanvasBackup()) {
    return;
  }
  group.collapsed = !group.collapsed;
  renderPageList();
  if (!state.readOnly) {
    markDirty(group.collapsed ? '左侧页面组已收起' : '左侧页面组已展开');
  }
}

function previewGroupLayout(groupId) {
  if (!state.manifest || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
    return;
  }
  const group = groupById(groupId);
  if (!group) {
    return;
  }
  const positions = window.ProtoDockGroups?.layoutGroup(
    group,
    state.manifest.canvas.nodes,
    state.manifest.canvas.edges
  ) || {};
  state.groupLayoutPreview = { groupId, positions };
  state.selectedNodeId = group.rootNodeId;
  renderCanvas();
  centerNode(group.rootNodeId);
  setStatus(`正在预览「${group.title}」组内布局`);
}

function cancelGroupLayoutPreview() {
  if (!state.groupLayoutPreview) {
    return;
  }
  state.groupLayoutPreview = null;
  renderCanvas();
  setStatus('已取消组内布局预览');
}

async function applyGroupLayoutPreview() {
  const preview = state.groupLayoutPreview;
  if (!preview || !await ensureCanvasBackup()) {
    return;
  }
  state.manifest.canvas.nodes.forEach((node) => {
    const position = preview.positions[node.id];
    if (position) {
      node.x = clampCanvasCoord(position.x);
      node.y = clampCanvasCoord(position.y);
    }
  });
  state.groupLayoutPreview = null;
  renderCanvas();
  markDirty('组内布局已应用，仅更新当前组节点');
}

function selectPageFromList(nodeId) {
  selectNode(nodeId);
  centerNode(nodeId);
}

async function saveProject() {
  if (!state.manifest || state.readOnly || !state.manifestHandle) {
    const message = state.readOnly ? readonlyProjectMessage() : '没有可保存的项目';
    setStatus(message);
    return { ok: false, message };
  }
  if (state.projectSaving) {
    return { ok: false, message: '项目正在保存' };
  }
  state.projectSaving = true;
  renderProjectActions();
  try {
    const currentText = await (await state.manifestHandle.getFile()).text();
    const currentHash = await hashText(currentText);
    if (state.manifestHash && currentHash !== state.manifestHash) {
      const choice = await showConflictDialog({
        title: '保存前发现本地项目有更新',
        description: 'ProtoDock 准备保存时发现磁盘上的项目清单已经变化。请选择读取本地最新文件，或用当前画布状态覆盖本地文件。',
        reloadLabel: '读取本地变更',
        overwriteLabel: '覆盖本地文件',
        cancelLabel: '取消'
      });
      if (choice === 'reload') {
        await reloadProject();
        return { ok: false, message: '已读取本地变更，名称未保存' };
      }
      if (choice !== 'overwrite') {
        setStatus('已取消保存');
        return { ok: false, message: '已取消保存' };
      }
    }

    let pendingChange = null;
    if (state.dirty || state.docDirty.size) {
      pendingChange = await window.ProtoDockChangeLogDialog.open(state.manifest);
      if (!pendingChange) {
        setStatus('已取消保存');
        return { ok: false, message: '已取消保存' };
      }
    }

    for (const pageId of state.docDirty) {
      const page = state.manifest.pages[pageId];
      if (page?.doc) {
        await writeTextFile(page.doc, state.docCache.get(pageId) || '');
      }
    }
    if (pendingChange) {
      window.ProtoDockChangeLog.appendPending(state.manifest, pendingChange);
    }
    const text = manifestText(state.manifest);
    const writable = await state.manifestHandle.createWritable();
    await writable.write(text);
    await writable.close();
    state.manifestHash = await hashText(text);
    state.ignoredExternalManifestHash = null;
    state.dirty = false;
    state.docDirty.clear();
    const pendingCount = state.manifest.pendingChanges.length;
    setStatus(`已保存到本地文件，累计 ${pendingCount} 条待发布变更`);
    renderProjectActions();
    return { ok: true };
  } catch (error) {
    console.error(error);
    const message = `保存失败：${error.message || '无法写入文件'}`;
    setStatus(message);
    return { ok: false, message };
  } finally {
    state.projectSaving = false;
    renderProjectActions();
  }
}

async function reloadProject() {
  if (state.shareId) {
    await loadSharedProject(state.shareId);
    return;
  }
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
  showStartScreen();
}

function showConflictDialog(options = {}) {
  return new Promise((resolve) => {
    const title = options.title || '本地文档有更新';
    const description = options.description || 'ProtoDock 准备保存时发现磁盘上的项目清单已经变化。请选择如何处理当前画布状态。';
    const reloadLabel = options.reloadLabel || '读取本地变更';
    const overwriteLabel = options.overwriteLabel === undefined ? '覆盖本地文件' : options.overwriteLabel;
    const cancelLabel = options.cancelLabel || '取消';

    const close = (choice) => {
      els.conflictModal.hidden = true;
      resolve(choice);
    };

    if (els.conflictModalTitle) {
      els.conflictModalTitle.textContent = title;
    }
    if (els.conflictModalDescription) {
      els.conflictModalDescription.textContent = description;
    }
    buttons.conflictReload.textContent = reloadLabel;
    buttons.conflictOverwrite.hidden = !overwriteLabel;
    if (overwriteLabel) {
      buttons.conflictOverwrite.textContent = overwriteLabel;
    }
    buttons.conflictCancel.textContent = cancelLabel;
    buttons.conflictReload.onclick = () => close('reload');
    buttons.conflictOverwrite.onclick = () => close('overwrite');
    buttons.conflictCancel.onclick = () => close('cancel');
    els.conflictModal.hidden = false;
  });
}

function showUnsavedHomeDialog() {
  return new Promise((resolve) => {
    const close = (confirmed) => {
      els.unsavedHomeModal.hidden = true;
      resolve(confirmed);
    };
    buttons.unsavedHomeCancel.onclick = () => close(false);
    buttons.unsavedHomeConfirm.onclick = () => close(true);
    els.unsavedHomeModal.hidden = false;
  });
}

function startPlayback() {
  if (!state.manifest?.canvas.nodes.length) {
    return;
  }
  exitPreviewInteraction(state.activePreviewNodeId, { silent: true });
  state.playbackActive = true;
  state.playbackIndex = 0;
  state.playbackLocationSuffix = '';
  state.playbackHistory.reset();
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
  state.playbackLocationSuffix = '';
  state.playbackHistory.reset();
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
  rememberPlaybackLocation();
  state.playbackIndex = nextIndex;
  state.playbackLocationSuffix = '';
  renderPlayback();
}

function rememberPlaybackLocation() {
  state.playbackHistory.push(state.playbackIndex, state.playbackLocationSuffix);
}

function navigatePlaybackToPage(pageId, source, navigation = null) {
  if (!state.playbackActive || !state.manifest) {
    return;
  }
  const index = state.manifest.canvas.nodes.findIndex((node) => node.pageId === pageId);
  if (index < 0) {
    return;
  }
  const suffix = source === 'location'
    ? normalizedNavigationSuffix(navigation?.suffix || navigation?.url)
    : '';
  if (index === state.playbackIndex && suffix === state.playbackLocationSuffix) {
    return;
  }
  rememberPlaybackLocation();
  state.playbackIndex = index;
  state.playbackLocationSuffix = suffix;
  renderPlayback();
  setStatus(`已进入 ${pageForNode(state.manifest.canvas.nodes[index]).title || pageId}`);
}

function navigatePlaybackBack(fallbackPageId = null) {
  if (!state.playbackActive || !state.manifest) {
    return;
  }
  const previous = state.playbackHistory.pop();
  if (previous) {
    state.playbackIndex = previous.index;
    state.playbackLocationSuffix = previous.suffix || '';
    renderPlayback();
    setStatus('已返回上一页');
    return;
  }
  const fallbackIndex = fallbackPageId
    ? state.manifest.canvas.nodes.findIndex((node) => node.pageId === fallbackPageId)
    : -1;
  if (fallbackIndex >= 0 && fallbackIndex !== state.playbackIndex) {
    state.playbackIndex = fallbackIndex;
    state.playbackLocationSuffix = '';
    renderPlayback();
    setStatus(`已返回 ${pageForNode(state.manifest.canvas.nodes[fallbackIndex]).title || fallbackPageId}`);
    return;
  }
  setStatus('当前没有可返回的上一页');
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

function setPageSortMode(enabled) {
  if (!state.manifest || state.readOnly) {
    if (state.readOnly) {
      setStatus(readonlyProjectMessage());
    }
    return;
  }
  state.pageSortMode = !!enabled;
  if (state.pageSortMode) {
    state.pageSearchQuery = '';
  }
  state.activePageSortDrag = null;
  state.draggingPageNodeId = null;
  els.sortPagesButton?.classList.toggle('active', state.pageSortMode);
  els.sortPagesButton?.setAttribute('aria-pressed', String(state.pageSortMode));
  els.sortPagesButton?.closest('details')?.removeAttribute('open');
  renderPageList();
  setStatus(state.pageSortMode ? '拖拽左侧页面调整顺序' : '已退出页面排序');
}

function moveNodeInOrder(sourceId, targetId = null, placement = 'before') {
  if (!state.manifest || !sourceId || sourceId === targetId) {
    return false;
  }
  const nodes = state.manifest.canvas.nodes;
  const beforeOrder = nodes.map((node) => node.id).join('|');
  const sourceIndex = nodes.findIndex((node) => node.id === sourceId);
  if (sourceIndex < 0) {
    return false;
  }
  const [node] = nodes.splice(sourceIndex, 1);
  let insertionIndex = nodes.length;
  if (targetId) {
    const targetIndex = nodes.findIndex((item) => item.id === targetId);
    if (targetIndex < 0) {
      nodes.splice(sourceIndex, 0, node);
      return false;
    }
    insertionIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
  }
  nodes.splice(insertionIndex, 0, node);
  return nodes.map((item) => item.id).join('|') !== beforeOrder;
}

function beginPageSortDrag(event) {
  if (state.readOnly || !state.pageSortMode || event.button !== 0) {
    return;
  }
  const item = event.target.closest('[data-page-node]');
  if (!item) {
    return;
  }
  state.activePageSortDrag = {
    pointerId: event.pointerId,
    nodeId: item.dataset.pageNode,
    changed: false
  };
  state.draggingPageNodeId = item.dataset.pageNode;
  item.classList.add('dragging');
  els.pageList.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function movePageSortDrag(event) {
  const drag = state.activePageSortDrag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const listRect = els.pageList.getBoundingClientRect();
  let moved = false;
  if (event.clientY > listRect.bottom) {
    moved = moveNodeInOrder(drag.nodeId, null, 'after');
  } else {
    const item = document.elementFromPoint(event.clientX, event.clientY)?.closest('.page-list .doc-item[data-page-node]');
    if (item && els.pageList.contains(item) && item.dataset.pageNode !== drag.nodeId) {
      const itemRect = item.getBoundingClientRect();
      const placement = event.clientY > itemRect.top + itemRect.height / 2 ? 'after' : 'before';
      moved = moveNodeInOrder(drag.nodeId, item.dataset.pageNode, placement);
    }
  }
  if (!moved) {
    return;
  }
  drag.changed = true;
  renderPageList();
  event.preventDefault();
}

function endPageSortDrag(event) {
  const drag = state.activePageSortDrag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return false;
  }
  state.activePageSortDrag = null;
  state.draggingPageNodeId = null;
  if (els.pageList.hasPointerCapture?.(event.pointerId)) {
    els.pageList.releasePointerCapture(event.pointerId);
  }
  if (drag.changed) {
    renderCanvas();
    markDirty('页面顺序已调整');
  } else {
    renderPageList();
  }
  event.preventDefault();
  return true;
}

async function goHome() {
  if (state.dirty) {
    const confirmed = await showUnsavedHomeDialog();
    if (!confirmed) {
      setStatus('已取消返回首页');
      return;
    }
  }
  if (shareIdFromLocation()) {
    window.location.href = appUrl('/index.html');
    return;
  }
  stopManifestWatcher();
  stopPlayback();
  state.previewUrls.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)));
  state.previewUrls.clear();
  state.previewResetNodeIds.clear();
  state.previewJobs.clear();
  state.docCache.clear();
  state.docDirty.clear();
  state.manifest = null;
  state.projectHandle = null;
  state.manifestHandle = null;
  state.projectBaseUrl = null;
  state.projectDirectoryName = null;
  state.shareId = null;
  state.readOnly = true;
  state.manifestHash = null;
  state.ignoredExternalManifestHash = null;
  state.dirty = false;
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.selectedNoteId = null;
  state.editingEdgeLabelId = null;
  state.activePreviewNodeId = null;
  state.activeEdgeDrag = null;
  state.pageSettingsOpen = false;
  state.pageSettingsNodeId = null;
  state.pageSortMode = false;
  state.draggingPageNodeId = null;
  state.activePageSortDrag = null;
  state.safeAreaSettingsOpen = false;
  state.panX = 0;
  state.panY = 0;
  state.zoom = window.innerWidth < 760 ? 0.78 : 1;
  renderCanvas();
  setStatus('已返回首页');
}

function bindGlobalEvents() {
  buttons.homeProject?.addEventListener('click', goHome);
  buttons.openProject?.addEventListener('click', openProjectMenuModal);
  buttons.startOpenProject?.addEventListener('click', openProjectMenuModal);
  buttons.openLocalProjectFromMenu?.addEventListener('click', openLocalProjectFromMenu);
  buttons.openPublicPreviewFromMenu?.addEventListener('click', openPublicPreviewFromMenu);
  buttons.openGithubProject?.addEventListener('click', openGithubProjectFromMenu);
  window.ProtoDockProjectDrop?.bindDirectoryDropTarget?.(buttons.openLocalProjectFromMenu, {
    onDirectory: openDroppedProjectDirectory,
    onState: updateLocalProjectDropState
  });
  buttons.newProject?.addEventListener('click', openNewProjectModal);
  buttons.startNewProject?.addEventListener('click', openNewProjectModal);
  buttons.saveProject?.addEventListener('click', saveProject);
  buttons.reloadProject?.addEventListener('click', reloadProject);
  buttons.closeOpenProjectModal?.addEventListener('click', closeProjectMenuModal);
  buttons.closeProjectModal?.addEventListener('click', closeNewProjectModal);
  buttons.cancelProject?.addEventListener('click', closeNewProjectModal);
  buttons.closePublicPreviewModal?.addEventListener('click', closePublicPreviewModal);
  buttons.chooseProjectDirectory?.addEventListener('click', chooseProjectDirectory);
  buttons.createProject?.addEventListener('click', createProject);
  buttons.modeSelect?.addEventListener('click', () => setToolMode('select'));
  buttons.addText?.addEventListener('click', () => setToolMode('text'));
  buttons.addNode?.addEventListener('click', addNode);
  buttons.playFlow?.addEventListener('click', startPlayback);
  buttons.openProductDocument?.addEventListener('click', openFullProductDocument);
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
  els.pageSettingsButton?.addEventListener('click', () => {
    setPageSettingsOpen(!state.pageSettingsOpen);
  });
  els.closePageSettings?.addEventListener('click', () => setPageSettingsOpen(false));
  els.copyPagePngButton?.addEventListener('click', copySelectedPagePng);
  els.savePageSettings?.addEventListener('click', savePageSettings);
  els.sortPagesButton?.addEventListener('click', () => {
    setPageSortMode(!state.pageSortMode);
  });
  els.addGroupButton?.addEventListener('click', () => openGroupModal());
  els.closeGroupModal?.addEventListener('click', closeGroupModal);
  els.cancelGroupModal?.addEventListener('click', closeGroupModal);
  els.saveGroup?.addEventListener('click', saveGroupFromModal);
  els.deleteGroup?.addEventListener('click', deleteEditingGroup);
  els.groupPageOptions?.addEventListener('change', () => syncGroupRootOptions());
  els.cancelGroupLayout?.addEventListener('click', cancelGroupLayoutPreview);
  els.applyGroupLayout?.addEventListener('click', applyGroupLayoutPreview);
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
    scheduleRenderMinimap();
  });
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) {
      return;
    }
    event.preventDefault();
    event.returnValue = '';
  });
  window.addEventListener('focus', () => {
    checkExternalManifestChange('focus');
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkExternalManifestChange('visible');
    }
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
  [els.githubOpenRepo, els.githubOpenBranch, els.githubOpenProjectPath].forEach((input) => {
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        openGithubProjectFromMenu();
      }
    });
  });
  els.projectModal?.addEventListener('click', (event) => {
    if (event.target === els.projectModal) {
      closeNewProjectModal();
    }
  });
  els.openProjectModal?.addEventListener('click', (event) => {
    if (event.target === els.openProjectModal) {
      closeProjectMenuModal();
    }
  });
  els.publicPreviewModal?.addEventListener('click', (event) => {
    if (event.target === els.publicPreviewModal) {
      closePublicPreviewModal();
    }
  });
  els.publicPreviewList?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-share-url]');
    if (!item?.dataset.shareUrl) {
      return;
    }
    window.location.href = item.dataset.shareUrl;
  });
  els.groupModal?.addEventListener('click', (event) => {
    if (event.target === els.groupModal) {
      closeGroupModal();
    }
  });
  els.pageList?.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-group-toggle]');
    if (toggle) {
      await toggleGroupCollapsed(toggle.dataset.groupToggle);
      return;
    }
    const layout = event.target.closest('[data-group-layout]');
    if (layout) {
      layout.closest('details')?.removeAttribute('open');
      previewGroupLayout(layout.dataset.groupLayout);
      return;
    }
    const focus = event.target.closest('[data-group-focus]');
    if (focus) {
      focus.closest('details')?.removeAttribute('open');
      const group = groupById(focus.dataset.groupFocus);
      if (group) {
        selectPageFromList(group.rootNodeId);
      }
      return;
    }
    const edit = event.target.closest('[data-group-edit]');
    if (edit) {
      edit.closest('details')?.removeAttribute('open');
      openGroupModal(edit.dataset.groupEdit);
      return;
    }
    const item = event.target.closest('[data-page-node]');
    if (item && !state.pageSortMode) {
      selectPageFromList(item.dataset.pageNode);
    }
  });
  els.pageList?.addEventListener('pointerdown', beginPageSortDrag);
  els.pageSearchInput?.addEventListener('input', (event) => {
    state.pageSearchQuery = event.currentTarget.value;
    renderPageList();
  });
  els.pageSearchClear?.addEventListener('click', () => {
    state.pageSearchQuery = '';
    if (els.pageSearchInput) {
      els.pageSearchInput.value = '';
      els.pageSearchInput.focus();
    }
    renderPageList();
  });
  document.addEventListener('click', (event) => {
    const currentMenu = event.target.closest('.panel-menu, .page-group-menu');
    document.querySelectorAll('.panel-menu[open], .page-group-menu[open]').forEach((menu) => {
      if (menu !== currentMenu) {
        menu.removeAttribute('open');
      }
    });
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
      if (!els.groupModal?.hidden) {
        closeGroupModal();
      }
      if (state.groupLayoutPreview) {
        cancelGroupLayoutPreview();
      }
      state.activeEdgeDrag = null;
      els.canvasShell.classList.remove('is-linking');
      renderEdges();
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
  window.addEventListener('message', (event) => {
    if (!state.playbackActive) {
      return;
    }
    const frame = els.playbackMount?.querySelector('iframe.playback-frame');
    const backAction = window.ProtoDockNavigation?.backActionFromMessage(event, frame, state.manifest);
    if (backAction) {
      navigatePlaybackBack(backAction.fallbackPageId);
      return;
    }
    const pageId = window.ProtoDockNavigation?.pageIdFromMessage(event, frame, state.manifest);
    if (pageId) {
      navigatePlaybackToPage(pageId);
    }
  });
}

window.ProtoDock = {
  getState() {
    const safeArea = state.manifest ? configuredSafeAreaInsets() : { top: null, bottom: null };
    const changeLog = Array.isArray(state.manifest?.changelog) ? state.manifest.changelog : [];
    const currentChange = changeLog[changeLog.length - 1] || null;
    const pendingChanges = window.ProtoDockChangeLog?.normalizePending?.(state.manifest?.pendingChanges) || [];
    return {
      projectId: state.manifest?.project?.id || null,
      projectName: state.manifest?.project?.name || null,
      currentVersion: currentChange?.version || window.ProtoDockChangeLog?.inferredVersion?.(state.manifest) || null,
      currentChangeDescription: currentChange?.description || null,
      pendingChangeCount: pendingChanges.length,
      pendingChangeDescription: window.ProtoDockChangeLog?.pendingDescription?.(state.manifest) || null,
      shareId: state.shareId,
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
      canPackageProject: canCreateShareArchive(),
      manifestWatcherActive: !!state.manifestWatchTimer,
      ignoredExternalManifestChange: !!state.ignoredExternalManifestHash,
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      toolMode: state.toolMode,
      nodeCount: state.manifest?.canvas.nodes.length || 0,
      edgeCount: state.manifest?.canvas.edges.length || 0,
      noteCount: state.manifest?.canvas.notes.length || 0,
      groupCount: state.manifest?.canvas.groups.length || 0,
      pageSearchQuery: state.pageSearchQuery,
      groupLayoutPreviewActive: !!state.groupLayoutPreview,
      projectDirectoryName: state.projectDirectoryName
    };
  },
  openProjectDirectory,
  openDroppedProjectDirectory,
  renameProject,
  saveProject,
  reloadProject,
  checkExternalManifestChange,
  readProjectLocalSettings,
  writeProjectLocalSettings,
  createShareArchive,
  finalizePublishedVersion,
  copySelectedPagePng,
  openFullProductDocument,
  loadSharedProject,
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
const initialShareId = shareIdFromLocation();
if (initialShareId) {
  loadSharedProject(initialShareId);
} else {
  showStartScreen();
}
window.lucide?.createIcons();
