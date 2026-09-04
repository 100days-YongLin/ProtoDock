import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertCompatible, collectPageRuntimeCollections, collectRoutes, pageIdForRoute, parseArguments } from '../build.mjs';

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ADAPTER_ROOT = path.dirname(TEST_ROOT);

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

test('builds an interactive browser entry from a native mini program', { timeout: 30000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'protodock-wechat-test-'));
  await run(process.execPath, [
    path.join(ADAPTER_ROOT, 'build.mjs'),
    '--source', path.join(TEST_ROOT, 'fixtures', 'miniprogram'),
    '--output', output,
  ]);

  const report = JSON.parse(await readFile(path.join(output, '_wechat-adapter-report.json'), 'utf8'));
  assert.equal(report.pageCount, 1);
  assert.equal(report.pages[0].pageId, 'wx-pages-index-index');
  assert.deepEqual(report.compatibility.unsupportedWxApis, []);
  const html = await readFile(path.join(output, 'wx-pages-index-index', 'index.html'), 'utf8');
  assert.match(html, /protodock-bootstrap\.js/);
  assert.match(html, /pages\/index\/index/);
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
