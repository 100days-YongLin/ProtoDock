const assert = require('node:assert/strict');
require('../project-changelog.js');
require('../workspace-version-history.js');
require('../page-change-details.js');
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

const change = {pageId:'home',title:'首页',type:'modify',summary:'合并输入框',before:'两个字段',after:'一个字段'};
const detailed = {pages:manifest.pages,changelog:result.manifest.changelog,pendingChanges:[{...pending,pageChanges:[change]}]};
const released=log.releaseSnapshot(detailed,{version:'v1.3',changedAt:'2026-09-09T00:00:00Z',description:'字段合并'});
assert.deepEqual(released.entry.pageChanges,[change]);
assert.deepEqual(log.normalize(released.manifest.changelog).at(-1).pageChanges,[change]);
released.entry.pageChanges[0].title='不应改动原数据';
assert.equal(detailed.pendingChanges[0].pageChanges[0].title,'首页');
const compare=globalThis.ProtoDockPageChanges.compare;
assert.deepEqual(compare(detailed,'0','pending').changes,[change]);
assert.equal(compare(detailed,'start','pending').missing,1);
assert.equal(compare(detailed,'0','0'),null);
const safe = globalThis.ProtoDockPageChanges.render([{...change,title:'<img src=x onerror=alert(1)>',before:'<script>x</script>'}],{id:'teacher',manifest:detailed});
assert.ok(!safe.includes('<img'));
assert.ok(safe.includes('&lt;script&gt;'));
const deletion={...change,pageId:'old',type:'remove'};
const removed=log.releaseSnapshot({pendingChanges:[{...pending,pageChanges:[deletion]}]},{version:'v2',changedAt:pending.changedAt,description:'删除旧页'});
assert.deepEqual(removed.entry.pageChanges,[deletion]);
assert.match(globalThis.ProtoDockPageChanges.render([deletion],{manifest}),/当前页面已不存在/);
console.log('Page change detail persistence, release comparison, removal and escaping passed');
