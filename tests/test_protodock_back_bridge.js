const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../skills/protodock-canvas/templates/protodock-back-bridge.js'),
  'utf8'
);

function createRuntime({ withApi }) {
  let clickHandler = null;
  let apiFallback = undefined;
  let postedMessage = null;
  const documentRef = {
    addEventListener(type, handler) {
      if (type === 'click') {
        clickHandler = handler;
      }
    }
  };
  const parent = {
    postMessage(message, targetOrigin) {
      postedMessage = { message, targetOrigin };
    }
  };
  const windowRef = { document: documentRef, parent };
  if (withApi) {
    windowRef.ProtoDockPreview = {
      back(fallbackPageId) {
        apiFallback = fallbackPageId;
      }
    };
  }
  vm.runInNewContext(source, { window: windowRef });
  return {
    windowRef,
    click(control) {
      let prevented = false;
      clickHandler({
        target: control,
        composedPath() {
          return [control];
        },
        preventDefault() {
          prevented = true;
        }
      });
      return prevented;
    },
    apiFallback: () => apiFallback,
    postedMessage: () => postedMessage
  };
}

function backControl(fallbackPageId) {
  return {
    nodeType: 1,
    matches(selector) {
      return selector === '[data-protodock-back]';
    },
    getAttribute(name) {
      return name === 'data-protodock-back' ? fallbackPageId : null;
    }
  };
}

const playerRuntime = createRuntime({ withApi: true });
assert.equal(playerRuntime.click(backControl('home')), true);
assert.equal(playerRuntime.apiFallback(), 'home');
assert.equal(playerRuntime.postedMessage(), null);

const shareRuntime = createRuntime({ withApi: false });
assert.equal(shareRuntime.click(backControl('home')), true);
assert.equal(shareRuntime.postedMessage().message.type, 'protodock:back');
assert.equal(shareRuntime.postedMessage().message.fallbackPageId, 'home');
assert.equal(shareRuntime.postedMessage().targetOrigin, '*');

const historyRuntime = createRuntime({ withApi: true });
historyRuntime.click(backControl(''));
assert.equal(historyRuntime.apiFallback(), null);

console.log('ProtoDock back bridge click tests passed');
