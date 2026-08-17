const assert = require('node:assert/strict');

global.window = global;
require('../capture.js');

function element({ scrollHeight, clientHeight, offsetHeight = clientHeight, top = 0 }) {
  return {
    scrollHeight,
    clientHeight,
    offsetHeight,
    getBoundingClientRect() {
      return { top };
    }
  };
}

const root = element({ scrollHeight: 830, clientHeight: 830 });
const body = element({ scrollHeight: 830, clientHeight: 830 });
const nestedScroller = element({ scrollHeight: 2460, clientHeight: 720, top: 90 });
const documentRef = {
  documentElement: root,
  body,
  scrollingElement: root,
  defaultView: { scrollY: 0 },
  querySelectorAll: () => [nestedScroller]
};

assert.equal(ProtoDockCapture.measureFullPageHeight(documentRef, 830), 2550);
assert.equal(ProtoDockCapture.measureFullPageHeight(documentRef, 830, 2000), 2000);

const preset = {
  width: 390,
  height: 830,
  frameWidth: 428,
  frameHeight: 868
};
const fixed = ProtoDockCapture.captureGeometry(preset, {
  safeAreaEnabled: true,
  safeAreaTop: 59,
  safeAreaBottom: 34
});
assert.deepEqual(fixed, {
  safeTop: 59,
  safeBottom: 34,
  screenWidth: 390,
  screenHeight: 830,
  contentHeight: 737,
  frameWidth: 428,
  frameHeight: 868
});

const full = ProtoDockCapture.captureGeometry(preset, {
  safeAreaEnabled: true,
  safeAreaTop: 59,
  safeAreaBottom: 34,
  fullPage: true
}, 2550);
assert.equal(full.contentHeight, 2550);
assert.equal(full.screenHeight, 2643);
assert.equal(full.frameHeight, 2681);

function styleRecorder() {
  const values = new Map();
  return {
    values,
    setProperty(name, value) {
      values.set(name, value);
    }
  };
}

const sourceChild = element({ scrollHeight: 200, clientHeight: 200 });
const sourceRoot = element({ scrollHeight: 1200, clientHeight: 830 });
sourceRoot.querySelectorAll = () => [sourceChild];
const cloneChild = { style: styleRecorder() };
const cloneRoot = {
  style: styleRecorder(),
  querySelectorAll: () => [cloneChild]
};
ProtoDockCapture.expandScrollableClones({ documentElement: sourceRoot }, cloneRoot);
assert.equal(cloneRoot.style.values.get('height'), '1200px');
assert.equal(cloneChild.style.values.has('height'), false);

console.log('capture tests passed');
