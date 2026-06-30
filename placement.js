(function initProtoDockPlacement(global) {
  const DEFAULT_NODE_SIZE = Object.freeze({ width: 220, height: 420 });
  const CANVAS_LIMIT = 100000;
  const MIN_HORIZONTAL_GAP = 88;
  const MIN_VERTICAL_GAP = 96;
  const MAX_REFERENCE_DISTANCE = 860;
  const OVERLAP_MARGIN = 32;

  function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampCanvasCoord(value, limit = CANVAS_LIMIT) {
    return clamp(finiteNumber(value), -limit, limit);
  }

  function normalizeSize(size = {}) {
    return {
      width: Math.max(1, finiteNumber(size.width ?? size.w, DEFAULT_NODE_SIZE.width)),
      height: Math.max(1, finiteNumber(size.height ?? size.h, DEFAULT_NODE_SIZE.height))
    };
  }

  function measuredBoxFor(nodeId, measuredBoxes = {}) {
    if (!nodeId) {
      return null;
    }
    return measuredBoxes[nodeId] || null;
  }

  function normalizeBox(node, measuredBox, fallbackSize, index) {
    const id = node?.id || `node-${index + 1}`;
    const size = normalizeSize(measuredBox || fallbackSize);
    return {
      id,
      x: finiteNumber(measuredBox?.x ?? node?.x),
      y: finiteNumber(measuredBox?.y ?? node?.y),
      width: size.width,
      height: size.height
    };
  }

  function buildBoxes(nodes, measuredBoxes, fallbackSize) {
    return (Array.isArray(nodes) ? nodes : [])
      .map((node, index) => normalizeBox(node, measuredBoxFor(node?.id, measuredBoxes), fallbackSize, index))
      .filter((box) => Number.isFinite(box.x) && Number.isFinite(box.y));
  }

  function boxBounds(boxes) {
    return boxes.reduce((bounds, box) => ({
      minX: Math.min(bounds.minX, box.x),
      minY: Math.min(bounds.minY, box.y),
      maxX: Math.max(bounds.maxX, box.x + box.width),
      maxY: Math.max(bounds.maxY, box.y + box.height)
    }), {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    });
  }

  function centerOf(box) {
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2
    };
  }

  function distanceBetween(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function rectAt(point, size) {
    return {
      x: point.x,
      y: point.y,
      width: size.width,
      height: size.height
    };
  }

  function expandRect(rect, margin) {
    return {
      x: rect.x - margin,
      y: rect.y - margin,
      width: rect.width + margin * 2,
      height: rect.height + margin * 2
    };
  }

  function overlapArea(a, b) {
    const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return width > 0 && height > 0 ? width * height : 0;
  }

  function limitDistance(point, size, reference, maxDistance, canvasLimit) {
    const candidateCenter = centerOf(rectAt(point, size));
    const referenceCenter = centerOf(reference);
    const distance = distanceBetween(candidateCenter, referenceCenter);
    if (distance <= maxDistance) {
      return {
        x: clampCanvasCoord(point.x, canvasLimit),
        y: clampCanvasCoord(point.y, canvasLimit)
      };
    }
    const ratio = maxDistance / distance;
    return {
      x: clampCanvasCoord(referenceCenter.x + (candidateCenter.x - referenceCenter.x) * ratio - size.width / 2, canvasLimit),
      y: clampCanvasCoord(referenceCenter.y + (candidateCenter.y - referenceCenter.y) * ratio - size.height / 2, canvasLimit)
    };
  }

  function positionVariants(point, stepX, stepY) {
    return [
      [0, 0],
      [0, stepY],
      [stepX, 0],
      [0, -stepY],
      [-stepX, 0],
      [stepX, stepY],
      [-stepX, stepY],
      [stepX, -stepY],
      [-stepX, -stepY],
      [0, stepY * 2],
      [stepX * 2, 0]
    ].map(([dx, dy]) => ({
      x: point.x + dx,
      y: point.y + dy
    }));
  }

  function scorePosition(point, size, boxes, reference, bounds, priority, margin) {
    const rect = rectAt(point, size);
    const expanded = expandRect(rect, margin);
    const collisionArea = boxes.reduce((total, box) => total + overlapArea(expanded, box), 0);
    const distance = distanceBetween(centerOf(rect), centerOf(reference));
    const backwardDistance = Math.max(0, bounds.minX - point.x) + Math.max(0, bounds.minY - point.y);
    const collisionPenalty = collisionArea > 0 ? 1000000 + collisionArea : 0;
    return collisionPenalty + distance + backwardDistance * 8 + priority * 180;
  }

  function centerSpread(boxes) {
    const centers = boxes.map(centerOf);
    const xs = centers.map((point) => point.x);
    const ys = centers.map((point) => point.y);
    return {
      x: Math.max(...xs) - Math.min(...xs),
      y: Math.max(...ys) - Math.min(...ys)
    };
  }

  function candidatePositions(bounds, reference, size, gaps, preferBelow) {
    const right = {
      name: 'group-right',
      x: bounds.maxX + gaps.x,
      y: reference.y
    };
    const below = {
      name: 'group-below',
      x: reference.x,
      y: bounds.maxY + gaps.y
    };
    const bottomRight = {
      name: 'group-bottom-right',
      x: bounds.maxX + gaps.x,
      y: bounds.maxY + gaps.y
    };
    const referenceRight = {
      name: 'reference-right',
      x: reference.x + reference.width + gaps.x,
      y: reference.y
    };
    const referenceBelow = {
      name: 'reference-below',
      x: reference.x,
      y: reference.y + reference.height + gaps.y
    };
    const ordered = preferBelow
      ? [below, right, bottomRight, referenceBelow, referenceRight]
      : [right, below, bottomRight, referenceRight, referenceBelow];
    return ordered.map((candidate, priority) => ({ ...candidate, priority }));
  }

  function calculateNewNodePosition(options = {}) {
    const nodes = Array.isArray(options.nodes) ? options.nodes : [];
    const nodeSize = normalizeSize(options.nodeSize);
    const canvasLimit = finiteNumber(options.canvasLimit, CANVAS_LIMIT);
    const boxes = buildBoxes(nodes, options.measuredBoxes || {}, nodeSize);
    if (!boxes.length) {
      return { x: 160, y: 160 };
    }

    const reference = boxes.find((box) => box.id === options.selectedNodeId) || boxes[boxes.length - 1];
    const bounds = boxBounds(boxes);
    const spread = centerSpread(boxes);
    const preferBelow = boxes.length > 1 && spread.y > spread.x * 1.2;
    const gaps = {
      x: Math.max(MIN_HORIZONTAL_GAP, Math.round(nodeSize.width * 0.45)),
      y: Math.max(MIN_VERTICAL_GAP, Math.round(nodeSize.height * 0.24))
    };
    const maxDistance = Math.max(MAX_REFERENCE_DISTANCE, nodeSize.width + nodeSize.height + gaps.x + gaps.y);
    const stepX = Math.max(gaps.x, Math.round(nodeSize.width + gaps.x));
    const stepY = Math.max(gaps.y, Math.round(nodeSize.height * 0.62));

    let best = null;
    candidatePositions(bounds, reference, nodeSize, gaps, preferBelow).forEach((candidate) => {
      const limited = limitDistance(candidate, nodeSize, reference, maxDistance, canvasLimit);
      positionVariants(limited, stepX, stepY).forEach((variant) => {
        const point = limitDistance(variant, nodeSize, reference, maxDistance, canvasLimit);
        const score = scorePosition(point, nodeSize, boxes, reference, bounds, candidate.priority, OVERLAP_MARGIN);
        if (!best || score < best.score) {
          best = { point, score, source: candidate.name };
        }
      });
    });

    return {
      x: clampCanvasCoord(best?.point.x ?? reference.x + reference.width + gaps.x, canvasLimit),
      y: clampCanvasCoord(best?.point.y ?? reference.y, canvasLimit),
      source: best?.source || 'fallback'
    };
  }

  global.ProtoDockPlacement = {
    calculateNewNodePosition
  };
})(globalThis);
