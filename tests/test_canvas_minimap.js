const assert = require('node:assert/strict');

global.window = global;
require('../canvas-minimap.js');

const bounds = ProtoDockMinimap.boundsFor([
  { x: -200, y: 100, width: 300, height: 500 },
  { x: 700, y: 900, width: 200, height: 300 }
], 100);

assert.deepEqual(bounds, {
  x: -300,
  y: 0,
  width: 1300,
  height: 1300
});
assert.equal(ProtoDockMinimap.boundsFor([], 100), null);

const landscape = ProtoDockMinimap.fitBoundsToAspect(bounds, 2);
assert.equal(landscape.width, 2600);
assert.equal(landscape.height, 1300);
assert.equal(landscape.x, -950);

const portrait = ProtoDockMinimap.fitBoundsToAspect({ x: 0, y: 0, width: 1200, height: 400 }, 1);
assert.equal(portrait.width, 1200);
assert.equal(portrait.height, 1200);
assert.equal(portrait.y, -400);

const point = ProtoDockMinimap.pointFromClient(
  130,
  95,
  { left: 10, top: 20, width: 240, height: 150 },
  { x: -1000, y: -500, width: 2000, height: 1000 }
);
assert.deepEqual(point, { x: 0, y: 0 });

console.log('canvas minimap tests passed');
