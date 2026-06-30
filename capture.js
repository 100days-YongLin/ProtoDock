(() => {
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

  function cssTextForDocument(documentRef) {
    const chunks = [];
    for (const sheet of Array.from(documentRef.styleSheets || [])) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        chunks.push(rules.map((rule) => rule.cssText).join('\n'));
      } catch (error) {
        // Cross-origin sheets are ignored; local ProtoDock previews rewrite assets to same-origin/blob URLs.
      }
    }
    return chunks.filter(Boolean).join('\n');
  }

  function prepareHtmlForSvg(documentRef, width, height) {
    const clone = documentRef.documentElement.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    clone.querySelectorAll('script').forEach((script) => script.remove());
    clone.querySelectorAll('link[rel~="stylesheet" i]').forEach((link) => link.remove());

    const baseUrl = documentRef.baseURI || documentRef.location?.href || window.location.href;
    clone.querySelectorAll('[src], [href], [poster]').forEach((element) => {
      for (const attr of ['src', 'href', 'poster']) {
        if (element.hasAttribute(attr)) {
          element.setAttribute(attr, absolutizeUrl(element.getAttribute(attr), baseUrl));
        }
      }
    });

    const head = clone.querySelector('head') || clone.insertBefore(documentRef.createElement('head'), clone.firstChild);
    const style = documentRef.createElement('style');
    style.textContent = `
      ${cssTextForDocument(documentRef)}
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

  async function iframeToImage(iframe, width, height) {
    const documentRef = iframe.contentDocument;
    if (!documentRef?.documentElement) {
      throw new Error('无法读取页面预览');
    }
    if (documentRef.fonts?.ready) {
      await documentRef.fonts.ready.catch(() => {});
    }
    const html = prepareHtmlForSvg(documentRef, width, height);
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

  function createCanvas(width, height) {
    const ratio = Math.min(2, Math.max(1, Math.floor(2200 / Math.max(width, height))));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    return { canvas, ctx };
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('无法生成 PNG'));
        }
      }, 'image/png');
    });
  }

  async function capturePagePng(options) {
    const preset = options.preset;
    const safeTop = options.safeAreaEnabled ? Math.max(0, Number(options.safeAreaTop || 0)) : 0;
    const safeBottom = options.safeAreaEnabled ? Math.max(0, Number(options.safeAreaBottom || 0)) : 0;
    const screenWidth = Number(preset.width || 390);
    const screenHeight = Number(preset.height || 830);
    const contentHeight = Math.max(1, screenHeight - safeTop - safeBottom);
    const pageImage = await iframeToImage(options.iframe, screenWidth, contentHeight);

    const frameWidth = Number(preset.frameWidth || screenWidth);
    const frameHeight = Number(preset.frameHeight || screenHeight);
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

    ctx.clearRect(0, 0, outputWidth, outputHeight);
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
    return canvasToPngBlob(canvas);
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
    capturePagePng,
    copyPngBlob
  };
})();
