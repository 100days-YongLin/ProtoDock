(() => {
  const MAX_FULL_PAGE_HEIGHT = 12000;

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function absolutizeUrl(value, baseUrl) {
    if (!value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('blob:')) {
      return value;
    }
    try {
      return new URL(value, baseUrl).toString();
    } catch (error) {
      return value;
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('无法读取图片资源'));
      reader.readAsDataURL(blob);
    });
  }

  async function resourceToDataUrl(value, baseUrl, cache) {
    if (!value || value.startsWith('#') || value.startsWith('data:')) {
      return value;
    }
    const url = absolutizeUrl(value, baseUrl);
    if (cache.has(url)) {
      return Promise.resolve(cache.get(url));
    }
    const pending = (async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`资源读取失败：${url}`);
      }
      return blobToDataUrl(await response.blob());
    })().catch((error) => {
      console.warn('ProtoDock: capture asset inline failed', url, error);
      return url;
    });
    cache.set(url, pending);
    const result = await pending;
    cache.set(url, result);
    return result;
  }

  async function inlineCssUrls(cssText, baseUrl, cache) {
    const matches = Array.from(String(cssText || '').matchAll(/url\(\s*(['"]?)([^"')]+)\1\s*\)/g));
    let output = String(cssText || '');
    for (const match of matches) {
      const raw = match[2].trim();
      if (!raw || raw.startsWith('#') || raw.startsWith('data:')) {
        continue;
      }
      const dataUrl = await resourceToDataUrl(raw, baseUrl, cache);
      output = output.split(match[0]).join(`url("${dataUrl}")`);
    }
    return output;
  }

  async function inlineSrcset(value, baseUrl, cache) {
    const items = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
    const rewritten = [];
    for (const item of items) {
      const parts = item.split(/\s+/);
      const url = parts.shift();
      if (!url) {
        continue;
      }
      rewritten.push([await resourceToDataUrl(url, baseUrl, cache), ...parts].join(' '));
    }
    return rewritten.join(', ');
  }

  async function cssTextForDocument(documentRef, cache) {
    const chunks = [];
    for (const sheet of Array.from(documentRef.styleSheets || [])) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        const baseUrl = sheet.href || documentRef.baseURI || documentRef.location?.href || window.location.href;
        chunks.push(await inlineCssUrls(rules.map((rule) => rule.cssText).join('\n'), baseUrl, cache));
      } catch (error) {
        // Cross-origin sheets are ignored; local ProtoDock previews rewrite assets to same-origin/blob URLs.
      }
    }
    return chunks.filter(Boolean).join('\n');
  }

  async function inlineElementAssets(clone, documentRef, cache) {
    const baseUrl = documentRef.baseURI || documentRef.location?.href || window.location.href;

    for (const element of Array.from(clone.querySelectorAll('[src], [href], [poster], [srcset], [style]'))) {
      if (element.hasAttribute('src')) {
        element.setAttribute('src', await resourceToDataUrl(element.getAttribute('src'), baseUrl, cache));
      }
      if (element.hasAttribute('poster')) {
        element.setAttribute('poster', await resourceToDataUrl(element.getAttribute('poster'), baseUrl, cache));
      }
      if (element.hasAttribute('srcset')) {
        element.setAttribute('srcset', await inlineSrcset(element.getAttribute('srcset'), baseUrl, cache));
      }
      if (element.hasAttribute('style')) {
        element.setAttribute('style', await inlineCssUrls(element.getAttribute('style'), baseUrl, cache));
      }

      const tagName = element.tagName.toLowerCase();
      if (tagName === 'image' && element.hasAttribute('href')) {
        element.setAttribute('href', await resourceToDataUrl(element.getAttribute('href'), baseUrl, cache));
      } else if (tagName !== 'a' && element.hasAttribute('href')) {
        element.setAttribute('href', absolutizeUrl(element.getAttribute('href'), baseUrl));
      }
    }
  }

  function elementExtent(element, documentRef) {
    const height = Math.max(
      Number(element?.scrollHeight || 0),
      Number(element?.offsetHeight || 0),
      Number(element?.clientHeight || 0)
    );
    if (!height) {
      return 0;
    }
    try {
      const rect = element.getBoundingClientRect?.();
      const scrollTop = Number(documentRef.defaultView?.scrollY || documentRef.scrollingElement?.scrollTop || 0);
      return Math.max(0, Number(rect?.top || 0) + scrollTop) + height;
    } catch (error) {
      return height;
    }
  }

  function measureFullPageHeight(documentRef, viewportHeight, maxHeight = MAX_FULL_PAGE_HEIGHT) {
    const minimum = Math.max(1, Number(viewportHeight || 1));
    const elements = [
      documentRef?.documentElement,
      documentRef?.body,
      ...Array.from(documentRef?.querySelectorAll?.('*') || [])
    ].filter(Boolean);
    const measured = elements.reduce(
      (height, element) => Math.max(height, elementExtent(element, documentRef)),
      minimum
    );
    return Math.min(Math.max(minimum, Math.ceil(measured)), Math.max(minimum, Number(maxHeight || MAX_FULL_PAGE_HEIGHT)));
  }

  function expandScrollableClones(documentRef, clone) {
    const sourceElements = [
      documentRef.documentElement,
      ...Array.from(documentRef.documentElement?.querySelectorAll?.('*') || [])
    ];
    const clonedElements = [clone, ...Array.from(clone.querySelectorAll?.('*') || [])];
    const sourceIndexes = new Map(sourceElements.map((element, index) => [element, index]));
    const expandedAncestors = new Set();
    sourceElements.forEach((source, index) => {
      const target = clonedElements[index];
      const scrollHeight = Number(source.scrollHeight || 0);
      const clientHeight = Number(source.clientHeight || 0);
      let overflowY = '';
      try {
        const computed = documentRef.defaultView?.getComputedStyle?.(source);
        overflowY = String(computed?.overflowY || computed?.overflow || '').toLowerCase();
      } catch (error) {
        overflowY = '';
      }
      const isDocumentScroller = source === documentRef.scrollingElement;
      const isScrollableOverflow = ['auto', 'scroll', 'overlay'].includes(overflowY);
      if (
        !target?.style
        || !clientHeight
        || scrollHeight <= clientHeight + 1
        || (!isDocumentScroller && !isScrollableOverflow)
      ) {
        return;
      }
      target.style.setProperty('height', `${scrollHeight}px`, 'important');
      target.style.setProperty('max-height', 'none', 'important');
      target.style.setProperty('overflow-y', 'visible', 'important');

      for (let ancestor = source.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor === documentRef.body || ancestor === documentRef.documentElement) {
          break;
        }
        const ancestorIndex = sourceIndexes.get(ancestor);
        const clonedAncestor = clonedElements[ancestorIndex];
        if (!clonedAncestor?.style || expandedAncestors.has(clonedAncestor)) {
          continue;
        }
        expandedAncestors.add(clonedAncestor);
        clonedAncestor.style.setProperty('height', 'auto', 'important');
        clonedAncestor.style.setProperty('max-height', 'none', 'important');
        clonedAncestor.style.setProperty('overflow-y', 'visible', 'important');
      }
    });
  }

  async function prepareHtmlForSvg(documentRef, width, height, assetCache = new Map(), options = {}) {
    const clone = documentRef.documentElement.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    if (options.fullPage) {
      expandScrollableClones(documentRef, clone);
    }
    clone.querySelectorAll('script').forEach((script) => script.remove());
    clone.querySelectorAll('link[rel~="stylesheet" i]').forEach((link) => link.remove());

    await inlineElementAssets(clone, documentRef, assetCache);

    const head = clone.querySelector('head') || clone.insertBefore(documentRef.createElement('head'), clone.firstChild);
    const style = documentRef.createElement('style');
    style.textContent = `
      ${await cssTextForDocument(documentRef, assetCache)}
      html, body {
        width: ${width}px !important;
        min-width: ${width}px !important;
        height: ${height}px !important;
        min-height: ${height}px !important;
        margin: 0 !important;
        overflow: hidden !important;
      }
      * {
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
      }
    `;
    head.append(style);
    return new XMLSerializer().serializeToString(clone);
  }

  function loadImageFromSvgText(svgText) {
    return new Promise((resolve, reject) => {
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      const image = new Image();
      image.onload = () => {
        resolve(image);
      };
      image.onerror = () => reject(new Error('无法渲染页面截图'));
      image.src = url;
    });
  }

  async function iframeToImage(iframe, width, height, assetCache, options = {}) {
    const documentRef = iframe.contentDocument;
    if (!documentRef?.documentElement) {
      throw new Error('无法读取页面预览');
    }
    if (documentRef.fonts?.ready) {
      await documentRef.fonts.ready.catch(() => {});
    }
    const html = await prepareHtmlForSvg(documentRef, width, height, assetCache, options);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <foreignObject x="0" y="0" width="${width}" height="${height}">
          ${html}
        </foreignObject>
      </svg>
    `;
    return loadImageFromSvgText(svg);
  }

  function drawIphoneShell(ctx, pageImage, metrics) {
    const { x, y, frameWidth, frameHeight, screenWidth, screenHeight, safeTop, safeBottom } = metrics;
    const screenX = x + (frameWidth - screenWidth) / 2;
    const screenY = y + (frameHeight - screenHeight) / 2;
    const contentHeight = screenHeight - safeTop - safeBottom;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.24)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, x, y, frameWidth, frameHeight, 68);
    ctx.fillStyle = '#09090a';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, x + 1, y + 1, frameWidth - 2, frameHeight - 2, 66);
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#5c5956';
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#5c5956';
    roundRect(ctx, x - 2, y + 115, 3, 32, 2);
    ctx.fill();
    roundRect(ctx, x - 2, y + 175, 3, 62, 2);
    ctx.fill();
    roundRect(ctx, x - 2, y + 255, 3, 62, 2);
    ctx.fill();
    roundRect(ctx, x + frameWidth - 1, y + 200, 3, 100, 2);
    ctx.fill();

    ctx.save();
    roundRect(ctx, screenX, screenY, screenWidth, screenHeight, 49);
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(screenX, screenY, screenWidth, screenHeight);
    ctx.drawImage(pageImage, screenX, screenY + safeTop, screenWidth, contentHeight);
    ctx.restore();

    ctx.fillStyle = '#010101';
    roundRect(ctx, x + frameWidth / 2 - 60, y + 29, 120, 35, 20);
    ctx.fill();
    roundRect(ctx, x + frameWidth / 2 - 60, y + 30, 74, 33, 17);
    ctx.fill();
    const lens = ctx.createRadialGradient(x + frameWidth / 2 + 40, y + 46, 1, x + frameWidth / 2 + 40, y + 46, 7);
    lens.addColorStop(0, '#6074bf');
    lens.addColorStop(0.45, '#24555e');
    lens.addColorStop(1, '#010101');
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(x + frameWidth / 2 + 40, y + 46, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTabletShell(ctx, pageImage, metrics) {
    const { x, y, frameWidth, frameHeight, screenWidth, screenHeight, safeTop, safeBottom } = metrics;
    const screenX = x + (frameWidth - screenWidth) / 2;
    const screenY = y + (frameHeight - screenHeight) / 2;
    const contentHeight = screenHeight - safeTop - safeBottom;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, x, y, frameWidth, frameHeight, 34);
    ctx.fillStyle = '#242426';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, screenX, screenY, screenWidth, screenHeight, 18);
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(screenX, screenY, screenWidth, screenHeight);
    ctx.drawImage(pageImage, screenX, screenY + safeTop, screenWidth, contentHeight);
    ctx.restore();
  }

  function drawWebShell(ctx, pageImage, metrics) {
    const { x, y, frameWidth, frameHeight, screenWidth, screenHeight } = metrics;
    const barHeight = 44;

    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, x, y, frameWidth, frameHeight, 14);
    ctx.fillStyle = '#f7f9fc';
    ctx.fill();
    ctx.restore();

    roundRect(ctx, x, y, frameWidth, frameHeight, 14);
    ctx.strokeStyle = '#cfd6e1';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#eef2f7';
    ctx.fillRect(x, y + barHeight - 1, frameWidth, 1);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((color, index) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 20 + index * 18, y + 22, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.drawImage(pageImage, x, y + barHeight, screenWidth, screenHeight);
  }

  function drawScreenOnly(ctx, pageImage, metrics) {
    const { screenWidth, screenHeight, safeTop, safeBottom } = metrics;
    const contentHeight = Math.max(1, screenHeight - safeTop - safeBottom);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    ctx.drawImage(pageImage, 0, safeTop, screenWidth, contentHeight);
  }

  function createCanvas(width, height) {
    const ratio = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    return { canvas, ctx };
  }

  function captureGeometry(preset, options = {}, measuredPageHeight = 0) {
    const safeTop = options.safeAreaEnabled ? Math.max(0, Number(options.safeAreaTop || 0)) : 0;
    const safeBottom = options.safeAreaEnabled ? Math.max(0, Number(options.safeAreaBottom || 0)) : 0;
    const baseScreenWidth = Number(preset.width || 390);
    const baseScreenHeight = Number(preset.height || 830);
    const baseContentHeight = Math.max(1, baseScreenHeight - safeTop - safeBottom);
    const measuredHeight = Math.min(MAX_FULL_PAGE_HEIGHT, Math.max(0, Number(measuredPageHeight || 0)));
    const contentHeight = options.fullPage && measuredHeight > baseScreenHeight + 1
      ? measuredHeight
      : baseContentHeight;
    const screenHeight = contentHeight + safeTop + safeBottom;
    const baseFrameHeight = Number(preset.frameHeight || baseScreenHeight);
    return {
      safeTop,
      safeBottom,
      screenWidth: baseScreenWidth,
      screenHeight,
      contentHeight,
      frameWidth: Number(preset.frameWidth || baseScreenWidth),
      frameHeight: baseFrameHeight + (screenHeight - baseScreenHeight)
    };
  }

  function canvasToBlob(canvas, mimeType = 'image/png', quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('无法生成截图'));
        }
      }, mimeType, quality);
    });
  }

  function resetCanvas(ctx, width, height, backgroundColor = '') {
    ctx.clearRect(0, 0, width, height);
    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }
  }

  async function capturePageImage(options) {
    const preset = options.preset;
    const mimeType = options.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const quality = mimeType === 'image/jpeg' ? Number(options.quality || 0.88) : undefined;
    const backgroundColor = mimeType === 'image/jpeg' ? (options.backgroundColor || '#fff') : '';
    const measuredPageHeight = options.fullPage
      ? measureFullPageHeight(options.iframe.contentDocument, Number(preset.height || 830))
      : 0;
    const geometry = captureGeometry(preset, options, measuredPageHeight);
    const {
      safeTop,
      safeBottom,
      screenWidth,
      screenHeight,
      contentHeight,
      frameWidth,
      frameHeight
    } = geometry;
    const pageImage = await iframeToImage(
      options.iframe,
      screenWidth,
      contentHeight,
      options.assetCache,
      { fullPage: !!options.fullPage }
    );

    if (options.includeFrame === false) {
      const { canvas, ctx } = createCanvas(screenWidth, screenHeight);
      resetCanvas(ctx, screenWidth, screenHeight, backgroundColor);
      drawScreenOnly(ctx, pageImage, {
        screenWidth,
        screenHeight,
        safeTop,
        safeBottom
      });
      return canvasToBlob(canvas, mimeType, quality);
    }

    const isDevice = !!preset.deviceClass;
    const margin = isDevice ? 34 : 22;
    const barHeight = isDevice ? 0 : 44;
    const outputWidth = frameWidth + margin * 2;
    const outputHeight = frameHeight + margin * 2 + barHeight;
    const { canvas, ctx } = createCanvas(outputWidth, outputHeight);
    const metrics = {
      x: margin,
      y: margin,
      frameWidth,
      frameHeight: frameHeight + barHeight,
      screenWidth,
      screenHeight,
      safeTop,
      safeBottom
    };

    resetCanvas(ctx, outputWidth, outputHeight, backgroundColor);
    if (preset.deviceClass?.includes('iphone')) {
      drawIphoneShell(ctx, pageImage, metrics);
    } else if (preset.deviceClass?.includes('ipad')) {
      drawTabletShell(ctx, pageImage, metrics);
    } else {
      drawWebShell(ctx, pageImage, {
        ...metrics,
        frameWidth: screenWidth,
        frameHeight: screenHeight + barHeight
      });
    }
    return canvasToBlob(canvas, mimeType, quality);
  }

  async function capturePagePng(options) {
    return capturePageImage({ ...options, mimeType: 'image/png' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyPngBlob(blob, filename = 'protodock-page.png') {
    if (window.isSecureContext && navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return { copied: true };
    }
    downloadBlob(blob, filename);
    return { copied: false, downloaded: true };
  }

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.ProtoDockCapture = {
    capturePageImage,
    capturePagePng,
    copyPngBlob,
    captureGeometry,
    measureFullPageHeight,
    expandScrollableClones
  };
})();
