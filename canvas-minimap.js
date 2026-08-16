(function initProtoDockMinimap(global) {
  function finite(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function normalizeRect(rect) {
    const x = finite(rect?.x);
    const y = finite(rect?.y);
    return {
      ...rect,
      x,
      y,
      width: Math.max(0, finite(rect?.width)),
      height: Math.max(0, finite(rect?.height))
    };
  }

  function boundsFor(rects, padding = 0) {
    const normalized = (rects || []).map(normalizeRect).filter((rect) => rect.width || rect.height);
    if (!normalized.length) {
      return null;
    }
    const minX = Math.min(...normalized.map((rect) => rect.x));
    const minY = Math.min(...normalized.map((rect) => rect.y));
    const maxX = Math.max(...normalized.map((rect) => rect.x + rect.width));
    const maxY = Math.max(...normalized.map((rect) => rect.y + rect.height));
    return {
      x: minX - padding,
      y: minY - padding,
      width: Math.max(1, maxX - minX + padding * 2),
      height: Math.max(1, maxY - minY + padding * 2)
    };
  }

  function fitBoundsToAspect(bounds, aspectRatio) {
    if (!bounds) {
      return null;
    }
    const aspect = Math.max(0.01, finite(aspectRatio, 1));
    const currentAspect = bounds.width / bounds.height;
    if (Math.abs(currentAspect - aspect) < 0.0001) {
      return { ...bounds };
    }
    if (currentAspect > aspect) {
      const height = bounds.width / aspect;
      return {
        x: bounds.x,
        y: bounds.y - (height - bounds.height) / 2,
        width: bounds.width,
        height
      };
    }
    const width = bounds.height * aspect;
    return {
      x: bounds.x - (width - bounds.width) / 2,
      y: bounds.y,
      width,
      height: bounds.height
    };
  }

  function pointFromClient(clientX, clientY, clientRect, viewBox) {
    const width = Math.max(1, clientRect.width);
    const height = Math.max(1, clientRect.height);
    return {
      x: viewBox.x + ((clientX - clientRect.left) / width) * viewBox.width,
      y: viewBox.y + ((clientY - clientRect.top) / height) * viewBox.height
    };
  }

  function rectMarkup(className, rect, extraClass = '') {
    const value = normalizeRect(rect);
    return `<rect class="${className}${extraClass ? ` ${extraClass}` : ''}" x="${value.x}" y="${value.y}" width="${value.width}" height="${value.height}" rx="12" ry="12"></rect>`;
  }

  function create(options = {}) {
    const root = options.root;
    const svg = options.svg;
    const fitButton = options.fitButton;
    if (!root || !svg) {
      return null;
    }

    let currentViewBox = null;
    let currentContentBounds = null;
    let activePointerId = null;

    function navigate(event) {
      if (!currentViewBox) {
        return;
      }
      const point = pointFromClient(event.clientX, event.clientY, svg.getBoundingClientRect(), currentViewBox);
      options.onNavigate?.(point);
    }

    function handlePointerDown(event) {
      if (event.button !== 0) {
        return;
      }
      activePointerId = event.pointerId;
      svg.setPointerCapture?.(event.pointerId);
      root.classList.add('is-dragging');
      navigate(event);
      event.preventDefault();
      event.stopPropagation();
    }

    function handlePointerMove(event) {
      if (activePointerId !== event.pointerId) {
        return;
      }
      navigate(event);
      event.preventDefault();
      event.stopPropagation();
    }

    function finishPointer(event) {
      if (activePointerId !== event.pointerId) {
        return;
      }
      activePointerId = null;
      root.classList.remove('is-dragging');
      event.stopPropagation();
    }

    function render(scene) {
      if (!scene) {
        root.hidden = true;
        svg.innerHTML = '';
        currentViewBox = null;
        currentContentBounds = null;
        return;
      }
      const contentRects = [...(scene.groups || []), ...(scene.nodes || []), ...(scene.notes || [])];
      currentContentBounds = boundsFor(contentRects, finite(scene.padding, 100));
      if (!currentContentBounds) {
        root.hidden = true;
        svg.innerHTML = '';
        currentViewBox = null;
        return;
      }
      const width = root.clientWidth || 240;
      const height = root.clientHeight || 150;
      currentViewBox = fitBoundsToAspect(currentContentBounds, width / height);
      svg.setAttribute('viewBox', `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);
      svg.innerHTML = [
        ...(scene.groups || []).map((rect) => rectMarkup('canvas-minimap-group', rect)),
        ...(scene.edges || []).map((edge) => `<path class="canvas-minimap-edge" d="${String(edge.path || '')}"></path>`),
        ...(scene.notes || []).map((rect) => rectMarkup('canvas-minimap-note', rect)),
        ...(scene.nodes || []).map((rect) => rectMarkup('canvas-minimap-node', rect, rect.selected ? 'is-selected' : '')),
        scene.viewport ? rectMarkup('canvas-minimap-viewport', scene.viewport) : ''
      ].join('');
      root.hidden = false;
    }

    function handleFit(event) {
      options.onFit?.(currentContentBounds);
      event.preventDefault();
      event.stopPropagation();
    }

    svg.addEventListener('pointerdown', handlePointerDown);
    svg.addEventListener('pointermove', handlePointerMove);
    svg.addEventListener('pointerup', finishPointer);
    svg.addEventListener('pointercancel', finishPointer);
    svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });
    fitButton?.addEventListener('click', handleFit);
    fitButton?.addEventListener('pointerdown', (event) => event.stopPropagation());

    return {
      render,
      getContentBounds: () => currentContentBounds ? { ...currentContentBounds } : null,
      getViewBox: () => currentViewBox ? { ...currentViewBox } : null
    };
  }

  global.ProtoDockMinimap = {
    boundsFor,
    fitBoundsToAspect,
    pointFromClient,
    create
  };
})(window);
