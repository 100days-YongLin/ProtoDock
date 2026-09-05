import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { normalizeWxmlLists } from '../wxml-lists.mjs';
import {
  assertCompatible,
  collectComponentStyleIsolation,
  collectPageRuntimeCollections,
  collectRoutes,
  normalizeCompiledCssContent,
  normalizePreviewDate,
  pageIdForRoute,
  parseArguments,
} from '../build.mjs';

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ADAPTER_ROOT = path.dirname(TEST_ROOT);

test('optional WXML lists normalize only nullish values in real attributes', () => {
  const source = '<!-- <view wx:for="{{ignore}}" /> --><view wx:for="{{report.items}}" wx:key="id" /><text>unchanged</text>';
  const output = normalizeWxmlLists(source);
  assert.match(output, /wx:for="\{\{\(report.items\) == null \? \[\] : \(report.items\)\}\}"/);
  assert.ok(output.startsWith('<!-- <view wx:for="{{ignore}}" /> -->'));
  assert.ok(output.endsWith('<text>unchanged</text>'));
});

test('collectRoutes includes main and subpackage pages', () => {
  assert.deepEqual(collectRoutes({
    pages: ['pages/home/index'],
    subpackages: [{ root: 'packages/admin', pages: ['detail/index'] }],
  }), ['pages/home/index', 'packages/admin/detail/index']);
});

test('pageIdForRoute creates stable manifest-safe ids', () => {
  assert.equal(pageIdForRoute('pages/moments/detail/index', 'parent'), 'parent-pages-moments-detail-index');
});

test('parseArguments handles paths and flags', () => {
  assert.deepEqual(parseArguments(['--source', '/tmp/src', '--output', '/tmp/out', '--keep-stage']), {
    source: '/tmp/src',
    output: '/tmp/out',
    keepStage: true,
  });
});

test('compatibility gate rejects unsupported runtime features', () => {
  assert.throws(() => assertCompatible({
    compatibility: {
      hasWxs: true,
      unsupportedWxApis: ['openDocument'],
      unsupportedNativeTags: [],
    },
  }), /WXS is not supported; unsupported wx APIs: openDocument/);
});

test('compiled page selectors target the real glass-easel page root', () => {
  const css = normalizeCompiledCssContent(`
    wx-page { --hm-color-mask: rgba(26, 28, 35, 0.42); min-height: 100vh; }
    wx-page[data-theme="warm"] .panel, .untouched { background: white; }
    .gender-control view, .form-label > text, .select-control + image { display: flex; }
    input.form-control, wx-button, custom-card { color: black; }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .wx-page-label { color: red; }
  `);

  assert.match(css, /wx-glass-easel-root\s*\{/);
  assert.match(css, /wx-glass-easel-root\[data-theme="warm"\]\s+\.panel/);
  assert.match(css, /\.wx-page-label\s*\{/);
  assert.match(css, /\.gender-control wx-view/);
  assert.match(css, /\.form-label\s*>\s*wx-text/);
  assert.match(css, /\.select-control\s*\+\s*wx-image/);
  assert.match(css, /wx-input\.form-control, wx-button, custom-card/);
  assert.match(css, /@keyframes fade\s*\{\s*from\s*\{/);
  assert.doesNotMatch(css, /(^|[\s,>+~])wx-page(?=[\s.{[:])/m);
});

test('runtime collection scan only captures Page instance fields and nested fields', () => {
  const source = `
    const unrelated = new Set(['keep']);
    Page<Model, Methods>({
      cache: new Map<string, string>(),
      nested: { visited: new Set<number>() },
      onLoad() { const local = new Map(); },
    });
  `;
  const result = collectPageRuntimeCollections(source);
  assert.deepEqual(result.collections, [
    { path: ['cache'], type: 'Map' },
    { path: ['nested', 'visited'], type: 'Set' },
  ]);
  assert.equal(result.replacements.length, 2);
});

test('runtime collection scan rejects non-empty instance initializers', () => {
  assert.throws(
    () => collectPageRuntimeCollections(`Page({ cache: new Set(['value']) })`),
    /initialize cache in onLoad/,
  );
});

test('previewDate requires an explicit timezone and normalizes the instant', () => {
  assert.equal(normalizePreviewDate(undefined), null);
  assert.equal(normalizePreviewDate('2026-09-04T10:00:00+08:00'), '2026-09-04T02:00:00.000Z');
  assert.throws(() => normalizePreviewDate('2026-09-04'), /explicit timezone/);
  assert.throws(() => normalizePreviewDate('2026-09-04T10:00:00'), /explicit timezone/);
});

test('component style isolation is read from the Component options object', () => {
  assert.equal(collectComponentStyleIsolation(`
    Component({ options: { styleIsolation: 'apply-shared' }, data: {} });
  `), 'apply-shared');
  assert.equal(collectComponentStyleIsolation(`
    export default Component({ options: { styleIsolation: \`shared\` } });
  `), 'shared');
  assert.equal(collectComponentStyleIsolation(`Component({ options: { styleIsolation: dynamicValue } })`), null);
});

test('builds an interactive browser entry from a native mini program', { timeout: 30000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'protodock-wechat-test-'));
  const configPath = path.join(output, 'protodock.wechat.json');
  await writeFile(configPath, JSON.stringify({ previewDate: '2026-09-04T10:00:00+08:00' }));
  await run(process.execPath, [
    path.join(ADAPTER_ROOT, 'build.mjs'),
    '--source', path.join(TEST_ROOT, 'fixtures', 'miniprogram'),
    '--output', output,
    '--config', configPath,
  ]);

  const report = JSON.parse(await readFile(path.join(output, '_wechat-adapter-report.json'), 'utf8'));
  assert.equal(report.pageCount, 2);
  assert.equal(report.pages[0].pageId, 'wx-pages-index-index');
  assert.equal(report.pages[1].pageId, 'wx-packages-facebank-add-index');
  assert.equal(report.previewDate, '2026-09-04T02:00:00.000Z');
  assert.deepEqual(report.compatibility.unsupportedWxApis, []);
  const html = await readFile(path.join(output, 'wx-pages-index-index', 'index.html'), 'utf8');
  assert.match(html, /protodock-bootstrap\.js/);
  assert.match(html, /pages\/index\/index/);
  assert.match(html, /"navigationBarTitleText":"适配器测试"/);
  assert.match(html, /"previewDate":"2026-09-04T02:00:00\.000Z"/);
  assert.match(html, /"runtimeCollections":\[\]/);
});

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ADAPTER_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
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
