const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../prototype-presentation.js');

const presentation = globalThis.ProtoDockPresentation;

assert.deepEqual(presentation.presetFor('iphone-portrait'), {
  deviceClass: 'device-iphone-14-pro device-black',
  width: 390,
  height: 830,
  frameWidth: 428,
  frameHeight: 868,
  safeTop: 59,
  safeBottom: 34
});
assert.equal(presentation.presetFor('web-landscape').width, 1440);
assert.equal(presentation.presetFor('unknown').width, 390);

assert.equal(presentation.firstAvailablePageId([
  { id: 'missing' },
  { id: 'home' }
], (pageId) => pageId === 'home' ? { src: '/pages/home/index.html' } : {}), 'home');
assert.equal(presentation.firstAvailablePageId([], () => ({})), '');

assert.equal(
  presentation.sourceWithSuffix(
    { src: 'http://localhost/pages/home/index.html' },
    '?tab=weekly#today'
  ).src,
  'http://localhost/pages/home/index.html?tab=weekly#today'
);
assert.equal(presentation.sourceWithSuffix({ srcdoc: '<main>Home</main>' }, '?tab=weekly').srcdoc, '<main>Home</main>');

for (const fileName of ['product-document.html', 'preview.html']) {
  const html = fs.readFileSync(path.join(__dirname, '..', fileName), 'utf8');
  assert.match(html, /id="openPresentation"/);
  assert.match(html, /prototype-presentation\.js\?v=\d+/);
  assert.ok(html.indexOf('openPresentation') > html.indexOf('returnToCanvas'));
}

console.log('prototype presentation tests passed');
