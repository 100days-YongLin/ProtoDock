const assert = require('node:assert/strict');
require('../project-changelog.js');
require('../workspace-version-history.js');
const log = globalThis.ProtoDockChangeLog;
const pending = {changedAt:'2026-09-08T10:00:00+08:00', description:'更新页面', pageIds:['home']};
const manifest = {pages:{home:{title:'首页'}}, pendingChanges:[pending], changelog:[]};
assert.deepEqual(log.normalizePending(manifest.pendingChanges)[0].pageIds,['home']);
const result=log.releaseSnapshot(manifest,{version:'v1.2',changedAt:pending.changedAt,description:'发布页面'});
assert.deepEqual(result.entry.pageIds,['home']);
assert.deepEqual(result.manifest.pendingChanges,[]);
assert.deepEqual(manifest.pendingChanges,[pending]);
assert.deepEqual(log.normalize(result.manifest.changelog)[0].pageIds,['home']);
const data=globalThis.ProtoDockWorkspaceHistory.records([
  {id:'a',name:'家长端',manifest:result.manifest},
  {id:'b',name:'幼师端',manifest:{pendingChanges:[pending],changelog:[{version:'1.2',changedAt:'2026-09-09T00:00:00Z',description:'另一端原版本'}]}}
]);
assert.deepEqual(data.versions.map(x=>x.version),['1.2','v1.2']);
assert.equal(data.pending[0].project.id,'b');
assert.equal(data.versions[1].entries[0].project.id,'a');
console.log('Workspace version history: explicit pages, publish merge, original versions and ordering passed');
