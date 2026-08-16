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
assert.equal(positions['child-a'].y, 750);
assert.equal(positions['child-b'].y, 750);
assert.ok(positions['child-a'].x < positions['child-b'].x);
assert.equal(positions.outside, undefined);

const normalized = ProtoDockGroups.normalizeGroups([
  { id: 'one', nodeIds: ['root', 'child-a'] },
  { id: 'two', nodeIds: ['child-a', 'child-b'] }
], nodes);
assert.deepEqual(normalized[1].nodeIds, ['child-b']);

console.log('canvas group tests passed');
