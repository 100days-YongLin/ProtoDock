(function initProtoDockGroups(global) {
  const DEFAULT_NODE_SIZE = Object.freeze({ width: 220, height: 420 });
  const DEFAULT_HORIZONTAL_GAP = 120;
  const DEFAULT_VERTICAL_GAP = 150;
  const DEFAULT_COMPONENT_GAP = 180;
  const DEFAULT_GROUP_GAP = Object.freeze({ x: 280, y: 320 });
  const DEFAULT_GROUP_PADDING = Object.freeze({ left: 34, right: 34, top: 66, bottom: 34 });
  const PACKING_ASPECT_RATIO = 1.45;

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizedNodeSize(nodeSize = {}) {
    return {
      width: Math.max(1, finiteNumber(nodeSize.width, DEFAULT_NODE_SIZE.width)),
      height: Math.max(1, finiteNumber(nodeSize.height, DEFAULT_NODE_SIZE.height))
    };
  }

  function normalizeGroups(groups, nodes = []) {
    if (!Array.isArray(groups)) {
      return [];
    }
    const validNodeIds = new Set(nodes.map((node) => node.id));
    const seenGroupIds = new Set();
    const claimedNodeIds = new Set();
    return groups.map((source, index) => {
      const group = source && typeof source === 'object' ? { ...source } : {};
      let id = String(group.id || `group-${index + 1}`).trim();
      while (seenGroupIds.has(id)) {
        id = `${id}-${index + 1}`;
      }
      seenGroupIds.add(id);
      const nodeIds = Array.isArray(group.nodeIds)
        ? group.nodeIds.filter((nodeId) => validNodeIds.has(nodeId) && !claimedNodeIds.has(nodeId))
        : [];
      nodeIds.forEach((nodeId) => claimedNodeIds.add(nodeId));
      const rootNodeId = nodeIds.includes(group.rootNodeId) ? group.rootNodeId : nodeIds[0] || '';
      return {
        ...group,
        id,
        title: String(group.title || `页面组 ${index + 1}`).trim() || `页面组 ${index + 1}`,
        rootNodeId,
        nodeIds,
        collapsed: group.collapsed !== false
      };
    }).filter((group) => group.nodeIds.length);
  }

  function groupForNode(groups, nodeId) {
    return (groups || []).find((group) => group.nodeIds.includes(nodeId)) || null;
  }

  function visibleNodeIds(groups, nodes) {
    return new Set((nodes || []).map((node) => node.id));
  }

  function matchesPageSearch(node, page, group, query) {
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return true;
    }
    return [
      page?.title,
      node?.pageId,
      page?.entry,
      page?.sourceDir,
      group?.title
    ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedQuery));
  }

  function effectiveNodes(nodes, preview) {
    if (!preview?.positions) {
      return nodes;
    }
    return nodes.map((node) => {
      const position = preview.positions[node.id];
      return position ? { ...node, ...position } : node;
    });
  }

  function groupBounds(group, nodes, nodeSize, padding = {}) {
    const members = nodes.filter((node) => group.nodeIds.includes(node.id));
    if (!members.length) {
      return null;
    }
    const size = normalizedNodeSize(nodeSize);
    const leftPadding = padding.left ?? DEFAULT_GROUP_PADDING.left;
    const rightPadding = padding.right ?? DEFAULT_GROUP_PADDING.right;
    const topPadding = padding.top ?? DEFAULT_GROUP_PADDING.top;
    const bottomPadding = padding.bottom ?? DEFAULT_GROUP_PADDING.bottom;
    const minX = Math.min(...members.map((node) => node.x));
    const minY = Math.min(...members.map((node) => node.y));
    const maxX = Math.max(...members.map((node) => node.x + size.width));
    const maxY = Math.max(...members.map((node) => node.y + size.height));
    return {
      x: minX - leftPadding,
      y: minY - topPadding,
      width: maxX - minX + leftPadding + rightPadding,
      height: maxY - minY + topPadding + bottomPadding
    };
  }

  function memberGraph(members, edges) {
    const memberIds = new Set(members.map((node) => node.id));
    const outgoing = new Map(members.map((node) => [node.id, []]));
    const incoming = new Map(members.map((node) => [node.id, []]));
    const adjacent = new Map(members.map((node) => [node.id, []]));
    (edges || []).forEach((edge) => {
      if (!memberIds.has(edge.from) || !memberIds.has(edge.to) || edge.from === edge.to) {
        return;
      }
      outgoing.get(edge.from).push(edge.to);
      incoming.get(edge.to).push(edge.from);
      adjacent.get(edge.from).push(edge.to);
      adjacent.get(edge.to).push(edge.from);
    });
    return { outgoing, incoming, adjacent };
  }

  function weakComponents(members, adjacent, nodeOrder, rootId) {
    const remaining = new Set(members.map((node) => node.id));
    const components = [];
    const seeds = [rootId, ...members.map((node) => node.id)].filter(Boolean);
    seeds.forEach((seed) => {
      if (!remaining.has(seed)) {
        return;
      }
      const queue = [seed];
      const ids = [];
      remaining.delete(seed);
      while (queue.length) {
        const current = queue.shift();
        ids.push(current);
        (adjacent.get(current) || [])
          .slice()
          .sort((first, second) => nodeOrder.get(first) - nodeOrder.get(second))
          .forEach((next) => {
            if (remaining.delete(next)) {
              queue.push(next);
            }
          });
      }
      components.push(ids);
    });
    return components;
  }

  function assignLevels(componentIds, seedId, graph, nodeOrder) {
    const componentSet = new Set(componentIds);
    const levels = new Map([[seedId, 0]]);
    const queue = [seedId];
    while (queue.length) {
      const current = queue.shift();
      const nextLevel = levels.get(current) + 1;
      (graph.outgoing.get(current) || [])
        .filter((target) => componentSet.has(target))
        .sort((first, second) => nodeOrder.get(first) - nodeOrder.get(second))
        .forEach((target) => {
          if (!levels.has(target)) {
            levels.set(target, nextLevel);
            queue.push(target);
          }
        });
    }

    // Cycles and reverse-only links still belong to the same visual component.
    // Place them one layer away from the nearest assigned node instead of
    // collecting all unresolved nodes in a very wide final row.
    while (levels.size < componentIds.length) {
      let progressed = false;
      componentIds
        .filter((nodeId) => !levels.has(nodeId))
        .sort((first, second) => nodeOrder.get(first) - nodeOrder.get(second))
        .forEach((nodeId) => {
          const linkedLevels = (graph.adjacent.get(nodeId) || [])
            .filter((linkedId) => levels.has(linkedId))
            .map((linkedId) => levels.get(linkedId));
          if (linkedLevels.length) {
            levels.set(nodeId, Math.max(...linkedLevels) + 1);
            progressed = true;
          }
        });
      if (!progressed) {
        const fallback = componentIds
          .filter((nodeId) => !levels.has(nodeId))
          .sort((first, second) => nodeOrder.get(first) - nodeOrder.get(second))[0];
        levels.set(fallback, Math.max(0, ...levels.values()) + 1);
      }
    }
    return levels;
  }

  function orderRows(rows, levels, graph, nodeOrder) {
    const orderedLevels = Array.from(rows.keys()).sort((first, second) => first - second);
    const sortByBarycenter = (level, neighborMap, neighborLevel) => {
      const neighborRow = rows.get(neighborLevel) || [];
      const neighborIndex = new Map(neighborRow.map((nodeId, index) => [nodeId, index]));
      rows.get(level).sort((first, second) => {
        const barycenter = (nodeId) => {
          const positions = (neighborMap.get(nodeId) || [])
            .filter((neighborId) => levels.get(neighborId) === neighborLevel && neighborIndex.has(neighborId))
            .map((neighborId) => neighborIndex.get(neighborId));
          return positions.length
            ? positions.reduce((total, value) => total + value, 0) / positions.length
            : Number.POSITIVE_INFINITY;
        };
        const firstCenter = barycenter(first);
        const secondCenter = barycenter(second);
        if (firstCenter !== secondCenter) {
          return firstCenter - secondCenter;
        }
        return nodeOrder.get(first) - nodeOrder.get(second);
      });
    };

    for (let pass = 0; pass < 3; pass += 1) {
      orderedLevels.slice(1).forEach((level) => sortByBarycenter(level, graph.incoming, level - 1));
      orderedLevels.slice(0, -1).reverse().forEach((level) => sortByBarycenter(level, graph.outgoing, level + 1));
    }
    return rows;
  }

  function boundsForPositions(positions, nodeIds, nodeSize) {
    const ids = nodeIds.filter((nodeId) => positions[nodeId]);
    if (!ids.length) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const minX = Math.min(...ids.map((nodeId) => positions[nodeId].x));
    const minY = Math.min(...ids.map((nodeId) => positions[nodeId].y));
    const maxX = Math.max(...ids.map((nodeId) => positions[nodeId].x + nodeSize.width));
    const maxY = Math.max(...ids.map((nodeId) => positions[nodeId].y + nodeSize.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function layoutComponent(componentIds, seedId, graph, nodeOrder, options) {
    const levels = assignLevels(componentIds, seedId, graph, nodeOrder);
    const rows = new Map();
    componentIds.forEach((nodeId) => {
      const level = levels.get(nodeId);
      if (!rows.has(level)) {
        rows.set(level, []);
      }
      rows.get(level).push(nodeId);
    });
    rows.forEach((row) => row.sort((first, second) => nodeOrder.get(first) - nodeOrder.get(second)));
    orderRows(rows, levels, graph, nodeOrder);

    const positions = {};
    const stepX = options.nodeSize.width + options.horizontalGap;
    const stepY = options.nodeSize.height + options.verticalGap;
    Array.from(rows.entries()).sort(([first], [second]) => first - second).forEach(([level, row]) => {
      const rowWidth = row.length * options.nodeSize.width + Math.max(0, row.length - 1) * options.horizontalGap;
      row.forEach((nodeId, index) => {
        positions[nodeId] = {
          x: Math.round(index * stepX - rowWidth / 2 + options.nodeSize.width / 2),
          y: Math.round(level * stepY)
        };
      });
    });
    return {
      positions,
      bounds: boundsForPositions(positions, componentIds, options.nodeSize)
    };
  }

  function planGroupLayout(group, nodes, edges, options = {}) {
    const members = nodes.filter((node) => group.nodeIds.includes(node.id));
    if (!members.length) {
      return { positions: {}, bounds: null, componentCount: 0 };
    }
    const nodeOrder = new Map(members.map((node, index) => [node.id, index]));
    const memberIds = new Set(members.map((node) => node.id));
    const rootId = memberIds.has(group.rootNodeId) ? group.rootNodeId : members[0].id;
    const root = members.find((node) => node.id === rootId) || members[0];
    const nodeSize = normalizedNodeSize(options.nodeSize);
    const horizontalGap = Math.max(80, finiteNumber(options.horizontalGap, DEFAULT_HORIZONTAL_GAP));
    const verticalGap = Math.max(100, finiteNumber(options.verticalGap, DEFAULT_VERTICAL_GAP));
    const componentGap = Math.max(120, finiteNumber(options.componentGap, DEFAULT_COMPONENT_GAP));
    const graph = memberGraph(members, edges);
    const components = weakComponents(members, graph.adjacent, nodeOrder, rootId);
    const componentPlans = components.map((componentIds) => {
      const preferredSeed = componentIds.includes(rootId)
        ? rootId
        : componentIds
          .filter((nodeId) => !(graph.incoming.get(nodeId) || []).some((source) => componentIds.includes(source)))
          .sort((first, second) => nodeOrder.get(first) - nodeOrder.get(second))[0] || componentIds[0];
      return layoutComponent(componentIds, preferredSeed, graph, nodeOrder, {
        nodeSize,
        horizontalGap,
        verticalGap
      });
    });

    const positions = {};
    const mainPlan = componentPlans[0];
    const mainWidth = mainPlan?.bounds.width || nodeSize.width;
    const targetWidth = Math.max(mainWidth, nodeSize.width * 3 + horizontalGap * 2);
    let cursorX = 0;
    let cursorY = 0;
    let rowHeight = 0;
    componentPlans.forEach((plan, index) => {
      if (index === 0) {
        cursorX = Math.max(0, (targetWidth - plan.bounds.width) / 2);
      } else if (index === 1) {
        cursorX = 0;
        cursorY = mainPlan.bounds.height + componentGap;
        rowHeight = 0;
      } else if (cursorX > 0 && cursorX + plan.bounds.width > targetWidth) {
        cursorX = 0;
        cursorY += rowHeight + componentGap;
        rowHeight = 0;
      }
      const offsetX = cursorX - plan.bounds.x;
      const offsetY = cursorY - plan.bounds.y;
      Object.entries(plan.positions).forEach(([nodeId, point]) => {
        positions[nodeId] = { x: point.x + offsetX, y: point.y + offsetY };
      });
      if (index === 0) {
        cursorX = 0;
        return;
      }
      cursorX += plan.bounds.width + componentGap;
      rowHeight = Math.max(rowHeight, plan.bounds.height);
    });

    const rootPoint = positions[rootId] || { x: 0, y: 0 };
    const offsetX = finiteNumber(options.anchorX, root.x) - rootPoint.x;
    const offsetY = finiteNumber(options.anchorY, root.y) - rootPoint.y;
    Object.values(positions).forEach((point) => {
      point.x = Math.round(point.x + offsetX);
      point.y = Math.round(point.y + offsetY);
    });
    return {
      positions,
      bounds: boundsForPositions(positions, members.map((node) => node.id), nodeSize),
      componentCount: components.length
    };
  }

  function layoutGroup(group, nodes, edges, options = {}) {
    return planGroupLayout(group, nodes, edges, options).positions;
  }

  function layoutCanvas(groups, nodes, edges, options = {}) {
    const nodeSize = normalizedNodeSize(options.nodeSize);
    const groupGap = {
      x: Math.max(160, finiteNumber(options.groupGapX, DEFAULT_GROUP_GAP.x)),
      y: Math.max(180, finiteNumber(options.groupGapY, DEFAULT_GROUP_GAP.y))
    };
    const claimed = new Set((groups || []).flatMap((group) => group.nodeIds || []));
    const layoutItems = (groups || []).map((group) => ({ group, kind: 'group' }));
    const ungroupedIds = (nodes || []).filter((node) => !claimed.has(node.id)).map((node) => node.id);
    if (ungroupedIds.length) {
      layoutItems.push({
        kind: 'ungrouped',
        group: { id: '__ungrouped__', rootNodeId: ungroupedIds[0], nodeIds: ungroupedIds }
      });
    }
    if (!layoutItems.length && nodes?.length) {
      layoutItems.push({
        kind: 'ungrouped',
        group: { id: '__all__', rootNodeId: nodes[0].id, nodeIds: nodes.map((node) => node.id) }
      });
    }

    const plans = layoutItems.map((item) => {
      const plan = planGroupLayout(item.group, nodes, edges, {
        ...options,
        nodeSize,
        anchorX: 0,
        anchorY: 0
      });
      const padding = item.kind === 'group' ? DEFAULT_GROUP_PADDING : { left: 0, right: 0, top: 0, bottom: 0 };
      return {
        ...item,
        ...plan,
        packedBounds: {
          x: plan.bounds.x - padding.left,
          y: plan.bounds.y - padding.top,
          width: plan.bounds.width + padding.left + padding.right,
          height: plan.bounds.height + padding.top + padding.bottom
        }
      };
    }).filter((plan) => plan.bounds);

    const totalArea = plans.reduce((total, plan) => total + plan.packedBounds.width * plan.packedBounds.height, 0);
    const widest = Math.max(0, ...plans.map((plan) => plan.packedBounds.width));
    const targetWidth = Math.max(widest, Math.sqrt(totalArea * PACKING_ASPECT_RATIO));
    const originX = finiteNumber(options.originX, Math.min(0, ...(nodes || []).map((node) => node.x)));
    const originY = finiteNumber(options.originY, Math.min(0, ...(nodes || []).map((node) => node.y)));
    const positions = {};
    let cursorX = originX;
    let cursorY = originY;
    let rowHeight = 0;
    plans.forEach((plan) => {
      if (cursorX > originX && cursorX + plan.packedBounds.width > originX + targetWidth) {
        cursorX = originX;
        cursorY += rowHeight + groupGap.y;
        rowHeight = 0;
      }
      const offsetX = cursorX - plan.packedBounds.x;
      const offsetY = cursorY - plan.packedBounds.y;
      Object.entries(plan.positions).forEach(([nodeId, point]) => {
        positions[nodeId] = {
          x: Math.round(point.x + offsetX),
          y: Math.round(point.y + offsetY)
        };
      });
      cursorX += plan.packedBounds.width + groupGap.x;
      rowHeight = Math.max(rowHeight, plan.packedBounds.height);
    });
    const bounds = boundsForPositions(positions, Object.keys(positions), nodeSize);
    return {
      positions,
      bounds,
      groupCount: (groups || []).length,
      ungroupedNodeCount: ungroupedIds.length,
      componentCount: plans.reduce((total, plan) => total + plan.componentCount, 0)
    };
  }

  global.ProtoDockGroups = {
    normalizeGroups,
    groupForNode,
    visibleNodeIds,
    matchesPageSearch,
    effectiveNodes,
    groupBounds,
    planGroupLayout,
    layoutGroup,
    layoutCanvas
  };
})(window);
