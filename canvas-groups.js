(function initProtoDockGroups(global) {
  const DEFAULT_HORIZONTAL_GAP = 520;
  const DEFAULT_VERTICAL_GAP = 650;

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
    const leftPadding = padding.left ?? 34;
    const rightPadding = padding.right ?? 34;
    const topPadding = padding.top ?? 66;
    const bottomPadding = padding.bottom ?? 34;
    const minX = Math.min(...members.map((node) => node.x));
    const minY = Math.min(...members.map((node) => node.y));
    const maxX = Math.max(...members.map((node) => node.x + nodeSize.width));
    const maxY = Math.max(...members.map((node) => node.y + nodeSize.height));
    return {
      x: minX - leftPadding,
      y: minY - topPadding,
      width: maxX - minX + leftPadding + rightPadding,
      height: maxY - minY + topPadding + bottomPadding
    };
  }

  function layoutGroup(group, nodes, edges, options = {}) {
    const members = nodes.filter((node) => group.nodeIds.includes(node.id));
    if (!members.length) {
      return {};
    }
    const memberIds = new Set(members.map((node) => node.id));
    const nodeOrder = new Map(members.map((node, index) => [node.id, index]));
    const rootId = memberIds.has(group.rootNodeId) ? group.rootNodeId : members[0].id;
    const outgoing = new Map(members.map((node) => [node.id, []]));
    (edges || []).forEach((edge) => {
      if (memberIds.has(edge.from) && memberIds.has(edge.to)) {
        outgoing.get(edge.from).push(edge.to);
      }
    });
    outgoing.forEach((targets) => targets.sort((first, second) => nodeOrder.get(first) - nodeOrder.get(second)));

    const levels = new Map([[rootId, 0]]);
    const queue = [rootId];
    while (queue.length) {
      const current = queue.shift();
      const nextLevel = levels.get(current) + 1;
      outgoing.get(current).forEach((target) => {
        if (levels.has(target)) {
          return;
        }
        levels.set(target, nextLevel);
        queue.push(target);
      });
    }
    const deepestLevel = Math.max(0, ...levels.values());
    members.forEach((node) => {
      if (!levels.has(node.id)) {
        levels.set(node.id, deepestLevel + 1);
      }
    });

    const rows = new Map();
    members.forEach((node) => {
      const level = levels.get(node.id);
      if (!rows.has(level)) {
        rows.set(level, []);
      }
      rows.get(level).push(node);
    });
    rows.forEach((row) => row.sort((first, second) => nodeOrder.get(first.id) - nodeOrder.get(second.id)));

    const root = members.find((node) => node.id === rootId) || members[0];
    const horizontalGap = options.horizontalGap || DEFAULT_HORIZONTAL_GAP;
    const verticalGap = options.verticalGap || DEFAULT_VERTICAL_GAP;
    const positions = {};
    Array.from(rows.entries()).sort(([first], [second]) => first - second).forEach(([level, row]) => {
      row.forEach((node, index) => {
        positions[node.id] = {
          x: Math.round(root.x + (index - (row.length - 1) / 2) * horizontalGap),
          y: Math.round(root.y + level * verticalGap)
        };
      });
    });
    return positions;
  }

  global.ProtoDockGroups = {
    normalizeGroups,
    groupForNode,
    visibleNodeIds,
    matchesPageSearch,
    effectiveNodes,
    groupBounds,
    layoutGroup
  };
})(window);
