import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch (error) {
  const bundledPlaywright = path.join(
    process.env.HOME || '',
    '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
  );
  try {
    playwright = require(bundledPlaywright);
  } catch (bundledError) {
    throw new Error('本地工作区浏览器门禁需要 Playwright；请安装 playwright 或设置 NODE_PATH。');
  }
}
const { chromium } = playwright;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterRoot = path.join(repoRoot, 'adapters', 'wechat-native');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function staticServer() {
  return createServer(async (request, response) => {
    try {
      const requestPath = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
      if (requestPath === '/favicon.ico') {
        response.writeHead(204).end();
        return;
      }
      const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
      const filePath = path.resolve(repoRoot, relativePath);
      if (filePath !== repoRoot && !filePath.startsWith(`${repoRoot}${path.sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
      response.end(body);
    } catch (error) {
      response.writeHead(404).end('Not found');
    }
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Adapter build failed (${code}):\n${output}`));
    });
  });
}

async function readGeneratedFiles(root, prefix) {
  const result = {};
  async function visit(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryRelative = path.posix.join(relative, entry.name);
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target, entryRelative);
      else if (!entry.name.endsWith('.map')) result[`${prefix}${entryRelative}`] = await readFile(target, 'utf8');
    }
  }
  await visit(root);
  return result;
}

const manifest = {
  version: 1,
  project: {
    id: 'local-wechat-preview-gate',
    name: '本地微信预览门禁',
    description: '验证共享运行时目录解析',
    devicePreset: 'iphone-portrait'
  },
  pages: {
    home: {
      title: '首页',
      kind: '微信原生页面',
      entry: 'pages/wx-pages-index-index/index.html',
      doc: 'docs/home.md'
    }
  },
  canvas: {
    nodes: [{ id: 'home-node', pageId: 'home', x: 80, y: 80, width: 390, height: 830 }],
    edges: [],
    notes: [],
    groups: []
  }
};

const projectPrefix = 'prototypes/mobile/';
const teacherProjectPrefix = 'prototypes/teacher/';
const adapterOutput = await mkdtemp(path.join(os.tmpdir(), 'protodock-local-wechat-preview-'));
await run(process.execPath, [
  path.join(adapterRoot, 'build.mjs'),
  '--source', path.join(adapterRoot, 'test', 'fixtures', 'miniprogram'),
  '--output', adapterOutput
]);
const files = {
  'protodock.workspace.json': `${JSON.stringify({
    schemaVersion: 1,
    product: { id: 'local-workspace-gate', name: '本地工作区门禁', version: 'v1.0.0' },
    sharedDocs: 'shared-docs',
    projects: [
      { id: 'mobile', name: '移动端', path: 'prototypes/mobile' },
      { id: 'teacher', name: '教师端', path: 'prototypes/teacher' }
    ]
  })}\n`,
  [`${projectPrefix}protodock.project.json`]: `${JSON.stringify(manifest)}\n`,
  [`${projectPrefix}docs/home.md`]: '# 首页\n\n本地微信预览浏览器门禁。\n',
  ...await readGeneratedFiles(adapterOutput, `${projectPrefix}pages/`),
  [`${teacherProjectPrefix}protodock.project.json`]: `${JSON.stringify({
    ...manifest,
    project: { ...manifest.project, id: 'local-wechat-preview-gate-teacher', name: '教师端本地门禁' }
  })}\n`,
  [`${teacherProjectPrefix}docs/home.md`]: '# 首页\n\n教师端本地微信预览浏览器门禁。\n',
  ...Object.fromEntries(Object.entries(await readGeneratedFiles(adapterOutput, `${teacherProjectPrefix}pages/`))
    .map(([filePath, text]) => [filePath, text.replaceAll('适配前', '教师端适配前')]))
};

const server = staticServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PROTODOCK_CHROME_PATH
    || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined)
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const failedResponses = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
});
await page.route('https://uicdn.toast.com/**', (route) => route.fulfill({
  contentType: route.request().url().endsWith('.css') ? 'text/css' : 'text/javascript',
  body: ''
}));

try {
  await page.goto(`http://127.0.0.1:${address.port}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (projectFiles) => {
    const readCounts = new Map();
    const failureBudgets = new Map();
    const makeFileHandle = (name, filePath) => ({
      kind: 'file',
      name,
      async getFile() {
        const readCount = (readCounts.get(filePath) || 0) + 1;
        readCounts.set(filePath, readCount);
        const failures = failureBudgets.get(filePath) || 0;
        if (failures > 0) {
          failureBudgets.set(filePath, failures - 1);
          throw new DOMException('Simulated local file read failure', 'NotFoundError');
        }
        return new File([projectFiles[filePath]], name, { type: name.endsWith('.json') ? 'application/json' : 'text/plain' });
      },
      async createWritable() {
        return { async write() {}, async close() {} };
      }
    });
    const makeDirectoryHandle = (name, prefix = '') => ({
      kind: 'directory',
      name,
      async queryPermission() { return 'granted'; },
      async getDirectoryHandle(childName) {
        const childPrefix = `${prefix}${childName}/`;
        if (!Object.keys(projectFiles).some((filePath) => filePath.startsWith(childPrefix))) {
          throw new DOMException('Missing directory', 'NotFoundError');
        }
        return makeDirectoryHandle(childName, childPrefix);
      },
      async getFileHandle(fileName) {
        const filePath = `${prefix}${fileName}`;
        if (!(filePath in projectFiles)) {
          throw new DOMException('Missing file', 'NotFoundError');
        }
        return makeFileHandle(fileName, filePath);
      }
    });
    window.__previewGate = {
      failNext(filePath, count = 1) { failureBudgets.set(filePath, count); },
      failuresLeft(filePath) { return failureBudgets.get(filePath) || 0; },
      replaceText(filePath, before, after) {
        projectFiles[filePath] = projectFiles[filePath].replaceAll(before, after);
      }
    };
    await window.ProtoDock.openDroppedProjectDirectory(makeDirectoryHandle('local-workspace-preview-gate'));
  }, files);

  await page.waitForFunction(() => document.querySelector('iframe.prototype-frame')?.dataset.previewReady === 'true');
  await page.waitForFunction(() => document.querySelector('iframe.prototype-frame')?.contentDocument
    ?.querySelector('img')?.src.startsWith('blob:'));
  await page.waitForTimeout(21000);
  const result = await page.evaluate(() => {
    const frame = document.querySelector('iframe.prototype-frame');
    const frameDocument = frame.contentDocument;
    return {
      bodyText: frameDocument.body.innerText,
      dynamicAssetUrl: frameDocument.querySelector('img')?.src || '',
      previewReady: frame.dataset.previewReady || '',
      runtimeRootTag: frameDocument.querySelector('wx-glass-easel-root')?.tagName || '',
      previewError: document.querySelector('[data-preview-node] .preview-error')?.textContent || ''
    };
  });

  assert.match(result.bodyText, /适配前/);
  assert.match(result.dynamicAssetUrl, /^blob:/);
  assert.equal(result.previewReady, 'true');
  assert.equal(result.runtimeRootTag, 'WX-GLASS-EASEL-ROOT');
  assert.equal(result.previewError, '');

  const mobileEntryPath = `${projectPrefix}pages/wx-pages-index-index/index.html`;
  await page.evaluate((filePath) => window.__previewGate.failNext(filePath), mobileEntryPath);
  await page.click('#playFlow');
  await page.waitForFunction(() => document.querySelector('iframe.playback-frame')?.contentDocument
    ?.querySelector('wx-glass-easel-root'));
  const playbackResult = await page.evaluate(() => {
    const frame = document.querySelector('iframe.playback-frame');
    return {
      bodyText: frame?.contentDocument?.body?.innerText || '',
      runtimeRootTag: frame?.contentDocument?.querySelector('wx-glass-easel-root')?.tagName || '',
      previewError: document.querySelector('[data-playback-preview] .preview-error')?.textContent || ''
    };
  });
  assert.match(playbackResult.bodyText, /适配前/);
  assert.equal(playbackResult.runtimeRootTag, 'WX-GLASS-EASEL-ROOT');
  assert.equal(playbackResult.previewError, '');
  assert.equal(await page.evaluate((filePath) => window.__previewGate.failuresLeft(filePath), mobileEntryPath), 1);

  await page.click('#closePlayback');
  await page.click('#playFlow');
  await page.waitForFunction(() => document.querySelector('iframe.playback-frame')?.contentDocument
    ?.querySelector('wx-glass-easel-root'));
  assert.equal(await page.locator('iframe.playback-frame').evaluate((frame) => frame.contentDocument.body.innerText.includes('适配前')), true);
  assert.equal(await page.evaluate((filePath) => window.__previewGate.failuresLeft(filePath), mobileEntryPath), 1);
  await page.evaluate((filePath) => window.__previewGate.failNext(filePath, 0), mobileEntryPath);
  await page.click('#closePlayback');

  const teacherEntryPath = `${teacherProjectPrefix}pages/wx-pages-index-index/index.html`;
  await page.evaluate((filePath) => window.__previewGate.failNext(filePath), teacherEntryPath);
  await page.click('[data-workspace-project="teacher"]');
  await page.waitForFunction(() => document.querySelector('[data-workspace-project="teacher"]')?.getAttribute('aria-selected') === 'true');
  await page.waitForFunction(() => document.querySelector('[data-preview-node] .preview-error')?.textContent.includes('无法预览'));
  assert.equal(await page.evaluate((filePath) => window.__previewGate.failuresLeft(filePath), teacherEntryPath), 0);

  await page.click('#reloadProject');
  await page.waitForFunction(() => document.querySelector('iframe.prototype-frame')?.dataset.previewReady === 'true');
  await page.waitForFunction(() => document.querySelector('iframe.prototype-frame')?.contentDocument?.body.innerText.includes('教师端适配前'));

  const teacherBundlePath = `${teacherProjectPrefix}pages/_wechat-runtime/index.js`;
  await page.evaluate(({ filePath, before, after }) => window.__previewGate.replaceText(filePath, before, after), {
    filePath: teacherBundlePath,
    before: '教师端适配前',
    after: '教师端已更新'
  });
  await page.click('#reloadProject');
  await page.waitForFunction(() => document.querySelector('iframe.prototype-frame')?.dataset.previewReady === 'true');
  await page.waitForFunction(() => document.querySelector('iframe.prototype-frame')?.contentDocument?.body.innerText.includes('教师端已更新'));
  await page.click('#playFlow');
  await page.waitForFunction(() => document.querySelector('iframe.playback-frame')?.contentDocument?.body.innerText.includes('教师端已更新'));

  await page.click('#closePlayback');
  await page.click('[data-workspace-project="mobile"]');
  await page.waitForFunction(() => document.querySelector('[data-workspace-project="mobile"]')?.getAttribute('aria-selected') === 'true');
  await page.waitForFunction(() => document.querySelector('iframe.prototype-frame')?.contentDocument?.body.innerText.includes('适配前'));
  assert.equal(await page.locator('iframe.prototype-frame').evaluate((frame) => frame.contentDocument.body.innerText.includes('教师端已更新')), false);

  const relevantConsoleErrors = consoleErrors.filter((message) => (
    !message.includes('uicdn.toast.com')
    && !message.includes('Simulated local file read failure')
  ));
  assert.equal(relevantConsoleErrors.length, 0, [...relevantConsoleErrors, ...failedResponses].join('\n'));
  console.log('local workspace browser preview gate passed');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(adapterOutput, { recursive: true, force: true });
}
