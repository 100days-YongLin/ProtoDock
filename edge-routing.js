(function initProtoDockEdgeRouting(global) {
  const LANE_GAP = 18;
  const LABEL_HEIGHT = 22;
  const LABEL_GAP = 8;

  function isVerticalSide(side) {
    return side === 'top' || side === 'bottom';
  }

  function isHorizontalSide(side) {
    return side === 'left' || side === 'right';
  }

  function intervalsOverlap(a, b, margin = 8) {
    return Math.min(a.max, b.max) - Math.max(a.min, b.min) > margin;
  }

  function laneCandidates(base) {
    const candidates = [base];
    for (let step = 1; step <= 8; step += 1) {
      candidates.push(base + step * LANE_GAP, base - step * LANE_GAP);
    }
    return candidates;
  }

  function chooseLane(base, interval, occupied) {
    return laneCandidates(base).find((candidate) => !occupied.some((item) => (
      intervalsOverlap(interval, item.interval)
      && Math.abs(candidate - item.lane) < LANE_GAP - 2
    ))) ?? base;
  }

  function estimateLabelWidth(label) {
    const textWidth = Array.from(String(label || '')).reduce((width, character) => (
      width + (character.charCodeAt(0) > 255 ? 12 : 7)
    ), 0);
    return Math.max(58, Math.min(220, textWidth + 30));
  }

  function targetLabelPoint(edge, targetIndex) {
    const width = estimateLabelWidth(edge.label);
    const offset = 72 + targetIndex * (LABEL_HEIGHT + LABEL_GAP);
    if (edge.toSide === 'top') {
      return { x: edge.to.x, y: edge.to.y - offset, direction: 'down', width };
    }
    if (edge.toSide === 'bottom') {
      return { x: edge.to.x, y: edge.to.y + offset, direction: 'up', width };
    }
    if (edge.toSide === 'left') {
      return {
        x: edge.to.x - width / 2 - 24 - targetIndex * (width + 12),
        y: edge.to.y,
        direction: 'right',
        width
      };
    }
    return {
      x: edge.to.x + width / 2 + 24 + targetIndex * (width + 12),
      y: edge.to.y,
      direction: 'left',
      width
    };
  }

  function routePath(edge, occupiedVertical, occupiedHorizontal) {
    const verticalPair = isVerticalSide(edge.fromSide) && isVerticalSide(edge.toSide);
    const horizontalPair = isHorizontalSide(edge.fromSide) && isHorizontalSide(edge.toSide);
    if (verticalPair) {
      if (Math.abs(edge.from.x - edge.to.x) <= 4) {
        return `M ${edge.from.x} ${edge.from.y} L ${edge.to.x} ${edge.to.y}`;
      }
      const interval = {
        min: Math.min(edge.from.x, edge.to.x),
        max: Math.max(edge.from.x, edge.to.x)
      };
      const lane = chooseLane((edge.from.y + edge.to.y) / 2, interval, occupiedVertical);
      occupiedVertical.push({ interval, lane });
      return `M ${edge.from.x} ${edge.from.y} L ${edge.from.x} ${lane} L ${edge.to.x} ${lane} L ${edge.to.x} ${edge.to.y}`;
    }
    if (horizontalPair) {
      if (Math.abs(edge.from.y - edge.to.y) <= 4) {
        return `M ${edge.from.x} ${edge.from.y} L ${edge.to.x} ${edge.to.y}`;
      }
      const interval = {
        min: Math.min(edge.from.y, edge.to.y),
        max: Math.max(edge.from.y, edge.to.y)
      };
      const lane = chooseLane((edge.from.x + edge.to.x) / 2, interval, occupiedHorizontal);
      occupiedHorizontal.push({ interval, lane });
      return `M ${edge.from.x} ${edge.from.y} L ${lane} ${edge.from.y} L ${lane} ${edge.to.y} L ${edge.to.x} ${edge.to.y}`;
    }
    const dx = Math.max(80, Math.abs(edge.to.x - edge.from.x) * 0.42);
    return `M ${edge.from.x} ${edge.from.y} C ${edge.from.x + dx} ${edge.from.y}, ${edge.to.x - dx} ${edge.to.y}, ${edge.to.x} ${edge.to.y}`;
  }

  function routeEdges(edges = []) {
    const occupiedVertical = [];
    const occupiedHorizontal = [];
    const targetCounts = new Map();
    return edges.map((edge) => {
      const targetKey = `${edge.toId || ''}:${edge.toSide || ''}`;
      const targetIndex = targetCounts.get(targetKey) || 0;
      targetCounts.set(targetKey, targetIndex + 1);
      const label = targetLabelPoint(edge, targetIndex);
      return {
        ...edge,
        path: routePath(edge, occupiedVertical, occupiedHorizontal),
        labelX: label.x,
        labelY: label.y,
        labelWidth: label.width,
        labelHeight: LABEL_HEIGHT,
        labelDirection: label.direction
      };
    });
  }

  global.ProtoDockEdgeRouting = {
    estimateLabelWidth,
    routeEdges
  };
})(globalThis);
