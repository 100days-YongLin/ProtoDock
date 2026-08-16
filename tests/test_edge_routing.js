const assert = require('node:assert/strict');

global.window = global;
require('../edge-routing.js');

const routed = ProtoDockEdgeRouting.routeEdges([
  {
    id: 'weekly',
    toId: 'weekly-page',
    label: '打开周报',
    from: { x: 200, y: 100 },
    to: { x: 200, y: 500 },
    fromSide: 'bottom',
    toSide: 'top'
  },
  {
    id: 'full-weekly',
    toId: 'daily-page',
    label: '查看完整周报',
    from: { x: 200, y: 100 },
    to: { x: 800, y: 500 },
    fromSide: 'bottom',
    toSide: 'top'
  },
  {
    id: 'daily',
    toId: 'daily-page',
    label: '查看今日日报',
    from: { x: 800, y: 100 },
    to: { x: 800, y: 500 },
    fromSide: 'bottom',
    toSide: 'top'
  }
]);

assert.equal(routed.length, 3);
assert.equal(routed[0].labelX, 200);
assert.equal(routed[0].labelY, 428);
assert.equal(routed[0].labelDirection, 'down');
assert.equal(routed[1].labelX, 800);
assert.equal(routed[1].labelY, 428);
assert.equal(routed[2].labelX, 800);
assert.equal(routed[2].labelY, 398);
assert.notEqual(routed[1].labelY, routed[2].labelY);

const lanes = ProtoDockEdgeRouting.routeEdges([
  {
    id: 'one',
    toId: 'a',
    label: 'A',
    from: { x: 100, y: 100 },
    to: { x: 500, y: 500 },
    fromSide: 'bottom',
    toSide: 'top'
  },
  {
    id: 'two',
    toId: 'b',
    label: 'B',
    from: { x: 180, y: 100 },
    to: { x: 580, y: 500 },
    fromSide: 'bottom',
    toSide: 'top'
  }
]);

assert.match(lanes[0].path, / L 100 300 L 500 300 /);
assert.match(lanes[1].path, / L 180 318 L 580 318 /);
assert.ok(ProtoDockEdgeRouting.estimateLabelWidth('查看完整周报') > ProtoDockEdgeRouting.estimateLabelWidth('周报'));

console.log('edge routing tests passed');
