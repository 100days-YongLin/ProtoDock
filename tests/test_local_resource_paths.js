const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(require.resolve('../local-resource-paths.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);

const { filesystemPath } = context.window.ProtoDockLocalResourcePaths;

assert.equal(filesystemPath('assets/admin.js?v=1.1.2'), 'assets/admin.js');
assert.equal(filesystemPath('assets/icon.svg#logo'), 'assets/icon.svg');
assert.equal(filesystemPath('assets/app.css?v=2#theme'), 'assets/app.css');
assert.equal(filesystemPath('pages/home/index.html'), 'pages/home/index.html');
assert.equal(filesystemPath(''), '');

console.log('local resource path tests passed');
