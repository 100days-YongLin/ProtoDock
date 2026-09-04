#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const ADAPTER_ROOT = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_ROOT = path.join(ADAPTER_ROOT, 'runtime');
const SUPPORTED_WX_APIS = new Set([
  'chooseMedia', 'clearStorageSync', 'createSelectorQuery', 'exitMiniProgram',
  'env',
  'getAccountInfoSync', 'getFileSystemManager', 'getImageInfo', 'getMenuButtonBoundingClientRect',
  'getSetting', 'getStorageSync', 'getSystemInfoSync', 'getWindowInfo', 'hideTabBar',
  'login', 'navigateBack', 'navigateTo', 'navigateToMiniProgram', 'nextTick', 'openSetting',
  'pageScrollTo', 'previewImage', 'previewMedia', 'reLaunch', 'redirectTo', 'removeStorageSync',
  'request', 'requestSubscribeMessage', 'scanCode', 'setStorageSync', 'showModal', 'showTabBar',
  'showToast', 'stopPullDownRefresh', 'switchTab', 'uploadFile',
]);
const NATIVE_COMPONENTS = new Set([
  'button', 'canvas', 'cover-image', 'cover-view', 'image', 'input', 'picker', 'rich-text',
  'scroll-view', 'slider', 'swiper', 'swiper-item', 'text', 'textarea', 'video', 'view',
]);

const COMPONENT_TEMPLATES = {
  view: '<slot />\n',
  text: '<slot />\n',
  image: '<img class="pd-control pd-image-{{mode}}" src="{{resolvedSrc}}" alt="{{alt}}" />\n',
  button: '<button class="pd-control" disabled="{{disabled}}"><slot /></button>\n',
  input: '<input class="pd-control" value="{{value}}" placeholder="{{placeholder}}" disabled="{{disabled}}" type="{{password ? \'password\' : \'text\'}}" bindinput="onInput" bindchange="onChange" bindfocus="onFocus" bindblur="onBlur" />\n',
  textarea: '<textarea class="pd-control" value="{{value}}" placeholder="{{placeholder}}" disabled="{{disabled}}" bindinput="onInput" bindchange="onChange" bindfocus="onFocus" bindblur="onBlur"></textarea>\n',
  'scroll-view': '<div class="pd-scroll"><slot /></div>\n',
  swiper: '<div class="pd-swiper"><slot /></div>\n',
  'swiper-item': '<div class="pd-swiper-item"><slot /></div>\n',
  picker: '<div class="pd-picker"><slot /><select value="{{value}}" disabled="{{disabled}}" bindchange="onPickerChange"><option wx:for="{{displayRange}}" wx:key="index" value="{{index}}">{{item}}</option></select></div>\n',
  slider: '<input class="pd-slider" type="range" min="{{min}}" max="{{max}}" step="{{step}}" value="{{value}}" disabled="{{disabled}}" bindinput="onSliderChange" bindchange="onSliderChange" />\n',
  video: '<video class="pd-control" src="{{resolvedSrc}}" poster="{{resolvedPoster}}" controls="{{controls}}"></video>\n',
  'rich-text': '<div class="pd-rich-text">{{displayText}}</div>\n',
  canvas: '<canvas class="pd-control"></canvas>\n',
  'cover-view': '<div class="pd-cover"><slot /></div>\n',
  'cover-image': '<img class="pd-control" src="{{resolvedSrc}}" alt="" />\n',
};

const BASE_COMPONENT_SCRIPT = `
export default Component({
  properties: { type: String, role: String, ariaLabel: String, ariaHidden: Boolean, ariaDisabled: Boolean, ariaChecked: Boolean, ariaExpanded: Boolean, ariaPressed: Boolean, ariaBusy: Boolean, ariaLive: String },
  data: {},
});
`.trimStart();

const FORM_COMPONENT_SCRIPT = `
function valueFromEvent(event) {
  return event?.detail?.value ?? event?.target?.value ?? '';
}
function markNativeEventHandled(event) {
  if (event?.originalEvent) event.originalEvent.__protodockWechatHandled = true;
}
export default Component({
  properties: {
    value: null, placeholder: String, placeholderClass: String, disabled: Boolean, password: Boolean,
    maxlength: Number, confirmType: String, confirmHold: Boolean, cursor: Number,
    selectionStart: Number, selectionEnd: Number, adjustPosition: Boolean, holdKeyboard: Boolean,
    role: String, ariaLabel: String, ariaHidden: Boolean, ariaDisabled: Boolean, ariaChecked: Boolean, ariaExpanded: Boolean, ariaPressed: Boolean, ariaBusy: Boolean, ariaLive: String,
  },
  data: {},
  methods: {
    onInput(event) { markNativeEventHandled(event); this.triggerEvent('input', { value: valueFromEvent(event) }); },
    onChange(event) { markNativeEventHandled(event); this.triggerEvent('change', { value: valueFromEvent(event) }); },
    onFocus(event) { markNativeEventHandled(event); this.triggerEvent('focus', { value: valueFromEvent(event) }); },
    onBlur(event) { markNativeEventHandled(event); this.triggerEvent('blur', { value: valueFromEvent(event) }); },
  },
});
`.trimStart();

const COMPONENT_SCRIPTS = {
  view: `export default Component({ properties: { type: String, hoverClass: String, hoverStopPropagation: Boolean, hoverStartTime: Number, hoverStayTime: Number, role: String, ariaLabel: String, ariaHidden: Boolean, ariaDisabled: Boolean, ariaChecked: Boolean, ariaExpanded: Boolean, ariaPressed: Boolean, ariaBusy: Boolean, ariaLive: String }, data: {} });\n`,
  image: assetComponentScript(['src', 'alt', 'mode', 'lazyLoad', 'showMenuByLongpress', 'loading', 'ariaHidden']),
  'cover-image': assetComponentScript(['src']),
  video: assetComponentScript(['src', 'poster', 'controls']),
  button: `export default Component({ properties: { type: String, disabled: Boolean, loading: Boolean, hoverClass: String, hoverStopPropagation: Boolean, hoverStartTime: Number, hoverStayTime: Number, formType: String, openType: String, role: String, ariaLabel: String, ariaHidden: Boolean, ariaDisabled: Boolean, ariaChecked: Boolean, ariaExpanded: Boolean, ariaPressed: Boolean }, data: {} });\n`,
  swiper: `export default Component({ properties: { current: Number, circular: Boolean, duration: Number, autoplay: Boolean, interval: Number, vertical: Boolean, role: String, ariaLabel: String, ariaHidden: Boolean }, data: {} });\n`,
  input: FORM_COMPONENT_SCRIPT,
  textarea: FORM_COMPONENT_SCRIPT,
  'scroll-view': `export default Component({ properties: { scrollX: Boolean, scrollY: Boolean, enhanced: Boolean, showScrollbar: Boolean, enableBackToTop: Boolean, scrollTop: Number, scrollLeft: Number, scrollIntoView: String, scrollWithAnimation: Boolean, scrollAnchoring: Boolean, bounces: Boolean, lowerThreshold: Number, upperThreshold: Number, role: String, ariaLabel: String, ariaHidden: Boolean }, data: {} });\n`,
  picker: `
export default Component({
  properties: { range: Array, rangeKey: String, value: null, disabled: Boolean, mode: String, start: String, end: String, fields: String, role: String, ariaLabel: String, ariaHidden: Boolean, ariaDisabled: Boolean },
  data: { displayRange: [] },
  observers: {
    'range, rangeKey': function(range, rangeKey) {
      const items = Array.isArray(range) ? range : [];
      this.setData({ displayRange: items.map((item) => rangeKey && item && typeof item === 'object' ? String(item[rangeKey] ?? '') : String(item ?? '')) });
    },
  },
  methods: {
    onPickerChange(event) {
      if (event?.originalEvent) event.originalEvent.__protodockWechatHandled = true;
      this.triggerEvent('change', { value: event?.detail?.value ?? event?.target?.value ?? '' });
    },
  },
});
`.trimStart(),
  slider: `
export default Component({
  properties: { min: { type: Number, value: 0 }, max: { type: Number, value: 100 }, step: { type: Number, value: 1 }, value: Number, disabled: Boolean },
  data: {},
  methods: { onSliderChange(event) { this.triggerEvent('change', { value: Number(event?.detail?.value ?? event?.target?.value ?? 0) }); } },
});
`.trimStart(),
  'rich-text': `
export default Component({
  properties: { nodes: null },
  data: { displayText: '' },
  observers: { nodes(value) { this.setData({ displayText: typeof value === 'string' ? value : '' }); } },
});
`.trimStart(),
};

const COMPONENT_STYLES = {
  view: ':host{display:block;box-sizing:border-box}\n',
  text: ':host{display:inline;box-sizing:border-box}\n',
  image: ':host{display:inline-block;box-sizing:border-box}.pd-control{display:block;width:100%;height:100%;object-fit:cover}.pd-image-aspectFit{object-fit:contain}.pd-image-scaleToFill{object-fit:fill}.pd-image-widthFix{height:auto}.pd-image-heightFix{width:auto}\n',
  'cover-image': ':host{display:inline-block;box-sizing:border-box}.pd-control{display:block;width:100%;height:100%;object-fit:cover}\n',
  button: ':host{display:inline-block;box-sizing:border-box}.pd-control{width:100%;height:100%;padding:0;border:0;color:inherit;font:inherit;background:transparent}\n',
  input: ':host{display:block;box-sizing:border-box}.pd-control{width:100%;height:100%;padding:0;border:0;outline:0;color:inherit;font:inherit;background:transparent}\n',
  textarea: ':host{display:block;box-sizing:border-box}.pd-control{width:100%;height:100%;padding:0;border:0;outline:0;resize:none;color:inherit;font:inherit;background:transparent}\n',
  'scroll-view': ':host{display:block;box-sizing:border-box}.pd-scroll{width:100%;height:100%;overflow:auto}\n',
  swiper: ':host{display:block;overflow:hidden;box-sizing:border-box}.pd-swiper{display:flex;width:100%;height:100%;overflow:auto;scroll-snap-type:x mandatory}\n',
  'swiper-item': ':host{display:block;flex:0 0 100%;box-sizing:border-box;scroll-snap-align:start}.pd-swiper-item{width:100%;height:100%}\n',
  picker: ':host{display:block;box-sizing:border-box}.pd-picker{position:relative;width:100%;height:100%}.pd-picker>select{position:absolute;inset:0;width:100%;height:100%;opacity:0}\n',
  slider: ':host{display:block;box-sizing:border-box}.pd-slider{width:100%;height:100%;margin:0}\n',
  video: ':host{display:block;box-sizing:border-box}.pd-control{display:block;width:100%;height:100%;object-fit:contain}\n',
  'rich-text': ':host{display:block;box-sizing:border-box}.pd-rich-text{white-space:pre-wrap}\n',
  canvas: ':host{display:block;box-sizing:border-box}.pd-control{display:block;width:100%;height:100%}\n',
  'cover-view': ':host{display:block;box-sizing:border-box}.pd-cover{width:100%;height:100%}\n',
};

function assetComponentScript(properties) {
  const booleanProperties = new Set(['controls', 'lazyLoad', 'showMenuByLongpress', 'ariaHidden', 'ariaDisabled']);
  const allProperties = [...new Set([...properties, 'role', 'ariaLabel', 'ariaHidden', 'ariaDisabled'])];
  const propertyEntries = allProperties.map((name) => `${name}: ${booleanProperties.has(name) ? 'Boolean' : 'String'}`).join(', ');
  const assetNames = properties.filter((name) => ['src', 'poster'].includes(name));
  const dataEntries = assetNames.map((name) => `resolved${capitalize(name)}: ''`).join(', ');
  const observers = assetNames.map((name) => `${name}(value) { this.setData({ resolved${capitalize(name)}: String(value || '').replace(/^\\/+/, '') }); }`).join(',\n    ');
  return `export default Component({\n  properties: { ${propertyEntries} },\n  data: { ${dataEntries} },\n  observers: {\n    ${observers}\n  },\n});\n`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'keep-stage') result.keepStage = true;
    else result[key] = argv[index += 1];
  }
  return result;
}

export function pageIdForRoute(route, prefix = 'wx') {
  const normalized = route.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${prefix}-${normalized}`;
}

export function collectRoutes(appJson) {
  const routes = [...(appJson.pages || [])];
  for (const item of appJson.subpackages || appJson.subPackages || []) {
    const root = String(item.root || '').replace(/^\/+|\/+$/g, '');
    for (const page of item.pages || []) routes.push(`${root}/${String(page).replace(/^\/+/, '')}`);
  }
  return [...new Set(routes)];
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!args.source || !args.output) {
    throw new Error('Usage: node build.mjs --source <miniprogram-dir> --output <pages-dir> [--config <protodock.wechat.json>]');
  }

  const source = path.resolve(args.source);
  const output = path.resolve(args.output);
  const config = args.config ? JSON.parse(await readFile(path.resolve(args.config), 'utf8')) : {};
  const appJson = JSON.parse(await readFile(path.join(source, 'app.json'), 'utf8'));
  const routes = collectRoutes(appJson);
  const pageMap = Object.fromEntries(routes.map((route) => [route, config.pages?.[route] || pageIdForRoute(route, config.pageIdPrefix || 'wx')]));
  const fixtures = await loadFixtures(config, args.config);
  const stage = await realpath(await mkdtemp(path.join(os.tmpdir(), 'protodock-wechat-stage-')));
  const sourceStage = path.join(stage, 'src');
  const runtimeOutput = path.join(output, '_wechat-runtime');

  try {
    await cp(source, sourceStage, { recursive: true, preserveTimestamps: true });
    await symlink(path.join(ADAPTER_ROOT, 'node_modules'), path.join(stage, 'node_modules'), 'dir');
    await cp(path.join(ADAPTER_ROOT, 'webpack.config.cjs'), path.join(stage, 'webpack.config.cjs'));
    await writeAdapterTsConfig(stage);
    const includeNativeShims = config.nativeComponentShims !== false;
    if (includeNativeShims) await installNativeComponents(sourceStage);
    await patchComponentMappings(sourceStage, includeNativeShims);
    await mkdir(output, { recursive: true });
    const runtimeCollectionsByRoute = await normalizePageRuntimeCollections(sourceStage, routes);
    await runWebpack(stage, runtimeOutput);
    await cp(path.join(RUNTIME_ROOT, 'protodock-runtime.css'), path.join(runtimeOutput, 'protodock-runtime.css'));
    await cp(path.join(RUNTIME_ROOT, 'protodock-runtime.js'), path.join(runtimeOutput, 'protodock-runtime.js'));
    await cp(path.join(RUNTIME_ROOT, 'protodock-bootstrap.js'), path.join(runtimeOutput, 'protodock-bootstrap.js'));
    await cp(
      path.join(ADAPTER_ROOT, 'node_modules', 'glass-easel', 'dist', 'glass_easel.all.global.js'),
      path.join(runtimeOutput, 'glass-easel.js'),
    );
    await normalizeCompiledCss(path.join(runtimeOutput, 'index.css'));
    await writeEntries({ appJson, config, fixtures, output, pageMap, routes, runtimeCollectionsByRoute });
    const report = await buildReport({ source, stage: sourceStage, output, pageMap, routes });
    await writeFile(path.join(output, '_wechat-adapter-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    assertCompatible(report);
  } finally {
    if (!args.keepStage) await rm(stage, { recursive: true, force: true });
    else process.stderr.write(`ProtoDock WeChat stage retained at ${stage}\n`);
  }
}

export function assertCompatible(report) {
  const issues = [];
  if (report.compatibility.hasWxs) issues.push('WXS is not supported');
  if (report.compatibility.unsupportedWxApis.length) {
    issues.push(`unsupported wx APIs: ${report.compatibility.unsupportedWxApis.join(', ')}`);
  }
  if (report.compatibility.unsupportedNativeTags.length) {
    issues.push(`unsupported native tags: ${report.compatibility.unsupportedNativeTags.join(', ')}`);
  }
  if (issues.length) throw new Error(`ProtoDock WeChat compatibility gate failed: ${issues.join('; ')}.`);
}

async function writeAdapterTsConfig(stage) {
  const compilerOptions = {
    target: 'ES2020',
    module: 'ESNext',
    moduleResolution: 'Node',
    lib: ['ES2020', 'DOM'],
    allowJs: true,
    esModuleInterop: true,
    skipLibCheck: true,
    sourceMap: true,
  };
  await writeFile(path.join(stage, 'tsconfig.json'), `${JSON.stringify({ compilerOptions, include: ['src/**/*.ts', 'src/**/*.js'] }, null, 2)}\n`);
}

async function loadFixtures(config, configPath) {
  if (!config.fixtures) return {};
  if (typeof config.fixtures === 'object') return config.fixtures;
  const base = configPath ? path.dirname(path.resolve(configPath)) : process.cwd();
  return JSON.parse(await readFile(path.resolve(base, config.fixtures), 'utf8'));
}

async function installNativeComponents(stage) {
  for (const name of NATIVE_COMPONENTS) {
    const root = path.join(stage, '__protodock', 'components', name);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'index.json'), `${JSON.stringify({ component: true, styleIsolation: 'apply-shared' }, null, 2)}\n`);
    await writeFile(path.join(root, 'index.wxml'), COMPONENT_TEMPLATES[name]);
    await writeFile(path.join(root, 'index.ts'), COMPONENT_SCRIPTS[name] || BASE_COMPONENT_SCRIPT);
    await writeFile(path.join(root, 'index.wxss'), COMPONENT_STYLES[name] || ':host{display:block;box-sizing:border-box}\n');
  }
}

async function patchComponentMappings(stage, includeNativeShims) {
  const jsonFiles = await filesRecursively(stage, (file) => file.endsWith('.json'));
  for (const file of jsonFiles) {
    let document;
    try {
      document = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      continue;
    }
    if (path.basename(file) === 'app.json' || file.includes(`${path.sep}__protodock${path.sep}`)) continue;
    document.usingComponents = { ...(document.usingComponents || {}) };
    if (includeNativeShims) {
      for (const name of NATIVE_COMPONENTS) {
        if (!document.usingComponents[name]) document.usingComponents[name] = `/__protodock/components/${name}/index`;
      }
    }
    await writeFile(file, `${JSON.stringify(document, null, 2)}\n`);
  }
}

async function normalizePageRuntimeCollections(stage, routes) {
  const collectionTypes = new Map();
  // Page definitions can live in shared registration modules, so every entry receives the safe union.
  const sourceFiles = await filesRecursively(stage, (file) => /\.(?:js|ts)$/i.test(file) && !file.includes(`${path.sep}__protodock${path.sep}`));
  for (const sourceFile of sourceFiles) {
    const content = await readFile(sourceFile, 'utf8');
    const { collections, replacements } = collectPageRuntimeCollections(content, sourceFile);
    for (const collection of collections) {
      const key = collection.path.join('.');
      const previous = collectionTypes.get(key);
      if (previous && previous !== collection.type) {
        throw new Error(`ProtoDock WeChat page field ${key} is declared as both ${previous} and ${collection.type}.`);
      }
      collectionTypes.set(key, collection.type);
    }
    if (replacements.length) {
      let normalized = content;
      for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
        normalized = `${normalized.slice(0, replacement.start)}null${normalized.slice(replacement.end)}`;
      }
      await writeFile(sourceFile, normalized);
    }
  }
  const collections = [...collectionTypes].map(([fieldPath, type]) => ({ path: fieldPath.split('.'), type }));
  return Object.fromEntries(routes.map((route) => [route, collections]));
}

export function collectPageRuntimeCollections(content, fileName = 'page.ts') {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, fileName.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const collections = [];
  const replacements = [];

  const propertyName = (node) => {
    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
    return null;
  };
  const inspectValue = (node, fieldPath) => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && ['Set', 'Map'].includes(node.expression.text)) {
      if (node.arguments?.length) {
        throw new Error(`ProtoDock WeChat only supports empty ${node.expression.text} page fields; initialize ${fieldPath.join('.')} in onLoad instead.`);
      }
      collections.push({ path: fieldPath, type: node.expression.text });
      replacements.push({ start: node.getStart(sourceFile), end: node.getEnd() });
      return;
    }
    if (!ts.isObjectLiteralExpression(node)) return;
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = propertyName(property.name);
      if (name) inspectValue(property.initializer, [...fieldPath, name]);
    }
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Page') {
      const definition = node.arguments[0];
      if (definition && ts.isObjectLiteralExpression(definition)) {
        for (const property of definition.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const name = propertyName(property.name);
          if (name && name !== 'data') inspectValue(property.initializer, [name]);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { collections, replacements };
}

async function filesRecursively(root, predicate) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (predicate(target)) result.push(target);
    }
  }
  await visit(root);
  return result;
}

async function runWebpack(stage, output) {
  await mkdir(output, { recursive: true });
  await new Promise((resolve, reject) => {
    const command = path.join(ADAPTER_ROOT, 'node_modules', 'webpack-cli', 'bin', 'cli.js');
    const child = spawn(process.execPath, [command, '--config', path.join(stage, 'webpack.config.cjs')], {
      cwd: stage,
      env: {
        ...process.env,
        NODE_PATH: path.join(ADAPTER_ROOT, 'node_modules'),
        PROTODOCK_ADAPTER_MODULES: path.join(ADAPTER_ROOT, 'node_modules'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    const timeout = setTimeout(() => child.kill('SIGTERM'), 120000);
    const collect = (chunk) => { logs += chunk; };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (logs.trim()) process.stderr.write(`${logs.trim()}\n`);
      if (code === 0) resolve();
      else reject(new Error(`Webpack compilation failed${code === null ? '' : ` with exit code ${code}`}.`));
    });
  });
  await cp(path.join(stage, 'dist'), output, { recursive: true });
}

export function normalizeCompiledCssContent(css) {
  const root = postcss.parse(css);
  const rewritePageSelector = selectorParser((selectors) => {
    selectors.walkTags((tag) => {
      if (tag.value === 'wx-page') tag.value = 'wx-glass-easel-root';
    });
  });

  root.walkRules((rule) => {
    if (!rule.selector?.includes('wx-page')) return;
    rule.selector = rewritePageSelector.processSync(rule.selector);
  });

  return root.toString().replace(/url\((['"]?)\//g, 'url($1');
}

async function normalizeCompiledCss(file) {
  const css = await readFile(file, 'utf8');
  await writeFile(file, normalizeCompiledCssContent(css));
}

async function writeEntries({ appJson, config, fixtures, output, pageMap, routes, runtimeCollectionsByRoute }) {
  const entryUrls = Object.fromEntries(Object.values(pageMap).map((pageId) => [pageId, `../${pageId}/index.html`]));
  for (const route of routes) {
    const pageId = pageMap[route];
    const directory = path.join(output, pageId);
    await mkdir(directory, { recursive: true });
    const pageConfig = {
      route,
      pageId,
      pageMap,
      entryUrls,
      tabBar: appJson.tabBar || null,
      storage: config.storage || {},
      fixtures,
      scanResult: config.scanResult || '',
      fallbackPageId: config.fallbackPages?.[route] || null,
      query: config.query?.[route] || {},
      runtimeCollections: runtimeCollectionsByRoute?.[route] || [],
    };
    await writeFile(path.join(directory, 'index.html'), pageHtml(pageConfig));
  }
}

function pageHtml(config) {
  const serialized = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <base href="../_wechat-runtime/">
  <title>微信原生页面预览</title>
  <link rel="stylesheet" href="index.css">
  <link rel="stylesheet" href="protodock-runtime.css">
  <script>window.__PROTODOCK_WECHAT__ = ${serialized};</script>
  <script data-protodock-adapter-runtime src="glass-easel.js"></script>
  <script data-protodock-adapter-runtime src="protodock-runtime.js"></script>
</head>
<body>
  <script data-protodock-adapter-runtime src="index.js"></script>
  <script data-protodock-adapter-runtime src="protodock-bootstrap.js"></script>
</body>
</html>
`;
}

async function buildReport({ source, stage, pageMap, routes }) {
  const sourceFiles = await filesRecursively(stage, (file) => /\.(?:js|ts|wxml)$/i.test(file) && !file.includes(`${path.sep}__protodock${path.sep}`));
  const apiNames = new Set();
  const unsupportedTags = new Set();
  let hasWxs = false;
  for (const file of sourceFiles) {
    const content = await readFile(file, 'utf8');
    if (/\.(?:js|ts)$/i.test(file)) {
      for (const match of content.matchAll(/\bwx\.([A-Za-z_$][\w$]*)/g)) apiNames.add(match[1]);
    }
    if (/\.wxml$/i.test(file)) {
      hasWxs ||= /<wxs\b/i.test(content);
      for (const match of content.matchAll(/<([a-z][a-z0-9-]*)\b/g)) {
        const tag = match[1];
        if (!NATIVE_COMPONENTS.has(tag) && !['block', 'slot', 'template'].includes(tag) && !tag.includes('-')) unsupportedTags.add(tag);
      }
    }
  }
  const commit = await gitCommit(source);
  return {
    adapterVersion: '0.1.0',
    generatedAt: new Date().toISOString(),
    sourceCommit: commit,
    pageCount: routes.length,
    pages: routes.map((route) => ({ route, pageId: pageMap[route], entry: `${pageMap[route]}/index.html` })),
    compatibility: {
      wxApis: [...apiNames].sort(),
      unsupportedWxApis: [...apiNames].filter((name) => !SUPPORTED_WX_APIS.has(name)).sort(),
      unsupportedNativeTags: [...unsupportedTags].sort(),
      hasWxs,
    },
  };
}

async function gitCommit(source) {
  let current = source;
  while (current !== path.dirname(current)) {
    try {
      await stat(path.join(current, '.git'));
      return await commandOutput('git', ['-C', current, 'rev-parse', 'HEAD']);
    } catch (error) {
      current = path.dirname(current);
    }
  }
  return null;
}

async function commandOutput(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.on('exit', (code) => resolve(code === 0 ? output.trim() : null));
    child.on('error', () => resolve(null));
  });
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
