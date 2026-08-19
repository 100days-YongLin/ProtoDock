const assert = require('node:assert/strict');

global.window = global;
require('../canvas-groups.js');

const nodes = [
  { id: 'root', x: -200, y: 100 },
  { id: 'child-a', x: 400, y: 200 },
  { id: 'child-b', x: 900, y: 200 },
  { id: 'outside', x: 1400, y: 100 }
];
const groups = ProtoDockGroups.normalizeGroups([{
  id: 'life',
  title: '生活记录详情',
  rootNodeId: 'root',
  nodeIds: ['root', 'child-a', 'child-b'],
  collapsed: false
}], nodes);

assert.equal(groups.length, 1);
assert.deepEqual(ProtoDockGroups.normalizeGroups(undefined, nodes), []);
assert.deepEqual(Array.from(ProtoDockGroups.visibleNodeIds(groups, nodes)), ['root', 'child-a', 'child-b', 'outside']);

groups[0].collapsed = true;
assert.deepEqual(Array.from(ProtoDockGroups.visibleNodeIds(groups, nodes)), ['root', 'child-a', 'child-b', 'outside']);

assert.equal(ProtoDockGroups.matchesPageSearch(
  nodes[1],
  { title: '进餐详情', entry: 'pages/meal-detail/index.html' },
  groups[0],
  '进餐'
), true);
assert.equal(ProtoDockGroups.matchesPageSearch(
  nodes[1],
  { title: '进餐详情', entry: 'pages/meal-detail/index.html' },
  groups[0],
  '生活记录'
), true);
assert.equal(ProtoDockGroups.matchesPageSearch(
  nodes[1],
  { title: '进餐详情', entry: 'pages/meal-detail/index.html' },
  groups[0],
  '午睡'
), false);

const positions = ProtoDockGroups.layoutGroup(groups[0], nodes, [
  { from: 'root', to: 'child-a' },
  { from: 'root', to: 'child-b' }
]);
assert.equal(positions.root.x, -200);
assert.equal(positions.root.y, 100);
assert.equal(positions['child-a'].y, 670);
assert.equal(positions['child-b'].y, 670);
assert.ok(positions['child-a'].x < positions['child-b'].x);
assert.equal(positions.outside, undefined);

const disconnectedNodes = [
  { id: 'main-root', x: 100, y: 200 },
  { id: 'main-child', x: 900, y: 900 },
  { id: 'secondary-root', x: 4000, y: -2000 },
  { id: 'secondary-child', x: 5000, y: -2000 }
];
const disconnectedGroup = {
  id: 'disconnected',
  rootNodeId: 'main-root',
  nodeIds: disconnectedNodes.map((node) => node.id)
};
const disconnectedPlan = ProtoDockGroups.planGroupLayout(disconnectedGroup, disconnectedNodes, [
  { from: 'main-root', to: 'main-child' },
  { from: 'secondary-root', to: 'secondary-child' }
]);
assert.equal(disconnectedPlan.componentCount, 2);
assert.equal(disconnectedPlan.positions['main-root'].x, 100);
assert.equal(disconnectedPlan.positions['main-root'].y, 200);
assert.ok(disconnectedPlan.positions['secondary-root'].y > disconnectedPlan.positions['main-child'].y);
assert.ok(disconnectedPlan.bounds.width < 1000);

const packedNodes = [
  { id: 'a-root', x: -6000, y: -5000 },
  { id: 'a-child', x: -5400, y: -4200 },
  { id: 'b-root', x: 7000, y: 8000 },
  { id: 'b-child', x: 7800, y: 8800 }
];
const packedGroups = [
  { id: 'a-group', rootNodeId: 'a-root', nodeIds: ['a-root', 'a-child'] },
  { id: 'b-group', rootNodeId: 'b-root', nodeIds: ['b-root', 'b-child'] }
];
const packedPlan = ProtoDockGroups.layoutCanvas(packedGroups, packedNodes, [
  { from: 'a-root', to: 'a-child' },
  { from: 'b-root', to: 'b-child' }
], { nodeSize: { width: 480, height: 348 } });
assert.deepEqual(Object.keys(packedPlan.positions).sort(), packedNodes.map((node) => node.id).sort());
assert.equal(packedPlan.groupCount, 2);
assert.equal(packedPlan.ungroupedNodeCount, 0);
const packedEffectiveNodes = ProtoDockGroups.effectiveNodes(packedNodes, packedPlan);
const firstBounds = ProtoDockGroups.groupBounds(packedGroups[0], packedEffectiveNodes, { width: 480, height: 348 });
const secondBounds = ProtoDockGroups.groupBounds(packedGroups[1], packedEffectiveNodes, { width: 480, height: 348 });
const groupsOverlap = firstBounds.x < secondBounds.x + secondBounds.width
  && firstBounds.x + firstBounds.width > secondBounds.x
  && firstBounds.y < secondBounds.y + secondBounds.height
  && firstBounds.y + firstBounds.height > secondBounds.y;
assert.equal(groupsOverlap, false);

const normalized = ProtoDockGroups.normalizeGroups([
  { id: 'one', nodeIds: ['root', 'child-a'] },
  { id: 'two', nodeIds: ['child-a', 'child-b'] }
], nodes);
assert.deepEqual(normalized[1].nodeIds, ['child-b']);

console.log('canvas group tests passed');
