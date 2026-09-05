import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    const configPath = path.join(output, 'protodock.wechat.json');
    await writeFile(configPath, JSON.stringify({ previewDate: '2026-09-04T10:00:00+08:00' }));
    await run(process.execPath, [
      path.join(ADAPTER_ROOT, 'build.mjs'),
      '--source', path.join(TEST_ROOT, 'fixtures', 'miniprogram'),
      '--output', output,
      '--config', configPath,
    ]);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PROTODOCK_CHROME_PATH
        || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 830 } });
    const address = server.address();
    await page.goto(`http://127.0.0.1:${address.port}/wx-pages-index-index/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('wx-glass-easel-root [data-style-probe="panel"]');
    await page.waitForSelector('.protodock-wechat-tabbar');

    const clock = await page.evaluate(() => ({
      implicitIso: new Date().toISOString(),
      implicitNow: Date.now(),
      callableMatches: Date() === new Date('2026-09-04T02:00:00.000Z').toString(),
      explicitIso: new Date('2020-01-02T03:04:05.000Z').toISOString(),
      parsed: Date.parse('2020-01-02T03:04:05.000Z'),
      utc: Date.UTC(2020, 0, 2, 3, 4, 5),
    }));
    assert.equal(clock.implicitIso, '2026-09-04T02:00:00.000Z');
    assert.equal(clock.implicitNow, 1788487200000);
    assert.equal(clock.callableMatches, true);
    assert.equal(clock.explicitIso, '2020-01-02T03:04:05.000Z');
    assert.equal(clock.parsed, 1577934245000);
    assert.equal(clock.utc, 1577934245000);

    await page.evaluate(() => wx.showToast({ title: '发布失败，请稍后重试', duration: 800 }));
    const toast = await page.locator('.protodock-wechat-toast').evaluate((element) => ({
      text: element.textContent,
      role: element.getAttribute('role'),
      pointerEvents: getComputedStyle(element).pointerEvents,
    }));
    assert.equal(toast.text, '发布失败，请稍后重试');
    assert.equal(toast.role, 'status');
    assert.equal(toast.pointerEvents, 'none');
    await page.waitForSelector('.protodock-wechat-toast', { state: 'detached', timeout: 2500 });

    const styles = await page.evaluate(() => {
      const root = document.querySelector('wx-glass-easel-root');
      const mask = document.querySelector('[data-style-probe="mask"]');
      const panel = document.querySelector('[data-style-probe="panel"]');
      const scrollHost = document.querySelector('[data-scroll-probe="true"]');
      const scrollContainer = scrollHost?.querySelector('.pd-scroll');
      const outerScrollHost = document.querySelector('[data-nested-scroll-outer="true"]');
      const outerScrollContainer = outerScrollHost?.querySelector('.pd-scroll');
      const innerScrollHost = document.querySelector('[data-nested-scroll-inner="true"]');
      const innerScrollContainer = innerScrollHost?.querySelector('.pd-scroll');
      const rootStyle = getComputedStyle(root);
      const maskStyle = getComputedStyle(mask);
      const panelStyle = getComputedStyle(panel);
      const scrollStyle = getComputedStyle(scrollContainer);
      const scrollbarStyle = getComputedStyle(scrollContainer, '::-webkit-scrollbar');
      scrollContainer.scrollTop = 20;
      window.scrollTo(0, 100);
      return {
        rootBackground: rootStyle.backgroundColor,
        rootMinHeight: rootStyle.minHeight,
        rootMaskToken: rootStyle.getPropertyValue('--hm-color-mask').trim(),
        inheritedMaskToken: maskStyle.getPropertyValue('--hm-color-mask').trim(),
        inheritedSurfaceToken: panelStyle.getPropertyValue('--hm-color-surface-warm').trim(),
        maskBackground: maskStyle.backgroundColor,
        panelBackground: panelStyle.backgroundColor,
        panelColor: panelStyle.color,
        documentScrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
        scrollContainerScrollbarWidth: scrollStyle.scrollbarWidth,
        scrollContainerWebkitDisplay: scrollbarStyle.display,
        scrollContainerCanScroll: scrollContainer.scrollHeight > scrollContainer.clientHeight,
        scrollContainerScrollTop: scrollContainer.scrollTop,
        pageCanScroll: document.documentElement.scrollHeight > window.innerHeight,
        pageScrollTop: window.scrollY,
        viewportWidth: window.innerWidth,
        outerHostWidth: outerScrollHost.getBoundingClientRect().width,
        outerClientWidth: outerScrollContainer.clientWidth,
        outerScrollWidth: outerScrollContainer.scrollWidth,
        innerHostWidth: innerScrollHost.getBoundingClientRect().width,
        innerClientWidth: innerScrollContainer.clientWidth,
        innerScrollWidth: innerScrollContainer.scrollWidth,
        tabbarMounted: !!document.querySelector('.protodock-wechat-tabbar'),
        navbarMounted: !!document.querySelector('.protodock-wechat-navbar'),
        navbarTitle: document.querySelector('.protodock-wechat-navbar__title')?.textContent || '',
        navbarHasBack: !!document.querySelector('.protodock-wechat-navbar__back'),
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
    assert.equal(styles.documentScrollbarWidth, 'none');
    assert.equal(styles.scrollContainerScrollbarWidth, 'none');
    assert.equal(styles.scrollContainerWebkitDisplay, 'none');
    assert.equal(styles.scrollContainerCanScroll, true);
    assert.ok(styles.scrollContainerScrollTop > 0);
    assert.equal(styles.pageCanScroll, true);
    assert.ok(styles.pageScrollTop > 0);
    assert.equal(styles.viewportWidth, 430);
    assert.equal(styles.outerHostWidth, styles.viewportWidth);
    assert.equal(styles.outerClientWidth, styles.viewportWidth);
    assert.ok(styles.outerScrollWidth <= styles.outerClientWidth);
    assert.equal(styles.innerHostWidth, styles.viewportWidth);
    assert.equal(styles.innerClientWidth, styles.viewportWidth);
    assert.ok(styles.innerScrollWidth > styles.innerClientWidth);
    assert.equal(styles.tabbarMounted, true);
    assert.equal(styles.navbarMounted, true);
    assert.equal(styles.navbarTitle, '适配器测试');
    assert.equal(styles.navbarHasBack, false);

    await page.goto(`http://127.0.0.1:${address.port}/wx-packages-facebank-add-index/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.protodock-wechat-navbar');
    await page.waitForSelector('[data-gender-option="true"]');
    const addPage = await page.evaluate(() => {
      const navbar = document.querySelector('.protodock-wechat-navbar');
      const content = document.querySelector('[data-add-page="true"]');
      const genderOption = document.querySelector('[data-gender-option="true"]');
      const formLabelText = document.querySelector('[data-form-label="true"] > wx-text');
      const selectControl = document.querySelector('[data-select-control="true"]');
      const fieldNote = document.querySelector('[data-field-note="true"]');
      const genderStyle = getComputedStyle(genderOption);
      return {
        title: document.querySelector('.protodock-wechat-navbar__title')?.textContent || '',
        hasBack: !!document.querySelector('.protodock-wechat-navbar__back'),
        hasTabbar: !!document.querySelector('.protodock-wechat-tabbar'),
        bodyPaddingTop: getComputedStyle(document.body).paddingTop,
        navbarBottom: navbar.getBoundingClientRect().bottom,
        contentTop: content.getBoundingClientRect().top,
        genderDisplay: genderStyle.display,
        genderAlign: genderStyle.alignItems,
        genderJustify: genderStyle.justifyContent,
        genderMinHeight: genderStyle.minHeight,
        labelWeight: getComputedStyle(formLabelText).fontWeight,
        selectDisplay: getComputedStyle(selectControl).display,
        selectWidth: getComputedStyle(selectControl).width,
        noteColor: getComputedStyle(fieldNote).color,
      };
    });
    assert.equal(addPage.title, '新增人脸');
    assert.equal(addPage.hasBack, true);
    assert.equal(addPage.hasTabbar, false);
    assert.equal(addPage.bodyPaddingTop, '88px');
    assert.ok(addPage.contentTop >= addPage.navbarBottom);
    assert.equal(addPage.genderDisplay, 'flex');
    assert.equal(addPage.genderAlign, 'center');
    assert.equal(addPage.genderJustify, 'center');
    assert.ok(Number.parseFloat(addPage.genderMinHeight) > 30);
    assert.equal(addPage.labelWeight, '700');
    assert.equal(addPage.selectDisplay, 'block');
    assert.ok(Number.parseFloat(addPage.selectWidth) > 15);
    assert.ok(Number.parseFloat(addPage.selectWidth) < 25);
    assert.equal(addPage.noteColor, 'rgb(22, 130, 232)');
  } finally {
    await browser?.close();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(output, { recursive: true, force: true });
  }
});
