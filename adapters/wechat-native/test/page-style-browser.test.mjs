import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ADAPTER_ROOT = path.dirname(TEST_ROOT);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    const bundledPlaywright = path.join(
      process.env.HOME || '',
      '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
    );
    return require(bundledPlaywright);
  }
}

function staticServer(root) {
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
      const filePath = path.resolve(root, pathname.replace(/^\/+/, ''));
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
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

test('page styles and variables reach the real glass-easel root', { timeout: 45000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'protodock-wechat-style-'));
  const server = staticServer(output);
  let browser;

  try {
    await run(process.execPath, [
      path.join(ADAPTER_ROOT, 'build.mjs'),
      '--source', path.join(TEST_ROOT, 'fixtures', 'miniprogram'),
      '--output', output,
    ]);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PROTODOCK_CHROME_PATH
        || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 830 } });
    const address = server.address();
    await page.goto(`http://127.0.0.1:${address.port}/wx-pages-index-index/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('wx-glass-easel-root [data-style-probe="panel"]');

    const styles = await page.evaluate(() => {
      const root = document.querySelector('wx-glass-easel-root');
      const mask = document.querySelector('[data-style-probe="mask"]');
      const panel = document.querySelector('[data-style-probe="panel"]');
      const rootStyle = getComputedStyle(root);
      const maskStyle = getComputedStyle(mask);
      const panelStyle = getComputedStyle(panel);
      return {
        rootBackground: rootStyle.backgroundColor,
        rootMinHeight: rootStyle.minHeight,
        rootMaskToken: rootStyle.getPropertyValue('--hm-color-mask').trim(),
        inheritedMaskToken: maskStyle.getPropertyValue('--hm-color-mask').trim(),
        inheritedSurfaceToken: panelStyle.getPropertyValue('--hm-color-surface-warm').trim(),
        maskBackground: maskStyle.backgroundColor,
        panelBackground: panelStyle.backgroundColor,
        panelColor: panelStyle.color,
      };
    });

    assert.equal(styles.rootBackground, 'rgb(255, 250, 242)');
    assert.equal(styles.rootMinHeight, '830px');
    assert.match(styles.rootMaskToken, /^rgba\(26,\s*28,\s*35,\s*0\.42\)$/);
    assert.equal(styles.inheritedMaskToken, styles.rootMaskToken);
    assert.equal(styles.inheritedSurfaceToken, '#fff6e6');
    assert.equal(styles.maskBackground, 'rgba(26, 28, 35, 0.42)');
    assert.equal(styles.panelBackground, 'rgb(255, 246, 230)');
    assert.equal(styles.panelColor, 'rgb(26, 28, 35)');
  } finally {
    await browser?.close();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(output, { recursive: true, force: true });
  }
});
