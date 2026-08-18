const assert = require('node:assert/strict');

global.window = global;
require('../capture.js');

assert.equal(typeof ProtoDockCapture.capturePageImage, 'function');

function element({ scrollHeight, clientHeight, offsetHeight = clientHeight, top = 0, overflowY = 'visible' }) {
  return {
    scrollHeight,
    clientHeight,
    offsetHeight,
    overflowY,
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
  defaultView: {
    scrollY: 0,
    getComputedStyle: (target) => ({ overflowY: target.overflowY })
  },
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

const sourceScroller = element({ scrollHeight: 1200, clientHeight: 700, overflowY: 'auto' });
const sourceVisualOverflow = element({ scrollHeight: 980, clientHeight: 140, overflowY: 'visible' });
const sourceWrapper = element({ scrollHeight: 700, clientHeight: 700 });
const sourceBody = element({ scrollHeight: 700, clientHeight: 700 });
const sourceRoot = element({ scrollHeight: 830, clientHeight: 830 });
sourceScroller.parentElement = sourceWrapper;
sourceWrapper.parentElement = sourceBody;
sourceBody.parentElement = sourceRoot;
sourceVisualOverflow.parentElement = sourceWrapper;
sourceRoot.querySelectorAll = () => [sourceBody, sourceWrapper, sourceScroller, sourceVisualOverflow];
const cloneBody = { style: styleRecorder() };
const cloneWrapper = { style: styleRecorder() };
const cloneScroller = { style: styleRecorder() };
const cloneVisualOverflow = { style: styleRecorder() };
const cloneRoot = {
  style: styleRecorder(),
  querySelectorAll: () => [cloneBody, cloneWrapper, cloneScroller, cloneVisualOverflow]
};
ProtoDockCapture.expandScrollableClones({
  documentElement: sourceRoot,
  body: sourceBody,
  defaultView: {
    getComputedStyle: (target) => ({ overflowY: target.overflowY })
  }
}, cloneRoot);
assert.equal(cloneScroller.style.values.get('height'), '1200px');
assert.equal(cloneScroller.style.values.get('overflow-y'), 'visible');
assert.equal(cloneWrapper.style.values.get('height'), 'auto');
assert.equal(cloneWrapper.style.values.get('overflow-y'), 'visible');
assert.equal(cloneBody.style.values.has('height'), false);
assert.equal(cloneRoot.style.values.has('height'), false);
assert.equal(cloneVisualOverflow.style.values.has('height'), false);

console.log('capture tests passed');
