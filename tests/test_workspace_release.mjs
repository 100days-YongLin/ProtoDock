import assert from 'node:assert/strict';
globalThis.window=globalThis;
await import('../project-changelog.js');
await import('../product-workspace.js');
await import('../workspace-release.js');
let writes=0, failName='';
function fileHandle(name, text){return{name,text,
  async getFile(){return new File([this.text],name,{lastModified:1});},
  async createWritable(){if(name===failName)throw Error('模拟写入失败');const owner=this;let value;return{async write(text){value=text;},async close(){owner.text=value;writes++;},async abort(){}};}
};}
globalThis.ProtoDockZip={async createZipFile(entries,name){return{entries,name};}};
function fixture(){
  const config={schemaVersion:1,product:{id:'demo',name:'Demo',description:'',version:'v0'},sharedDocs:'shared-docs',projects:[]};
  const projects=['teacher','parent','web'].map(id=>({id,name:id,path:id,handle:{async getDirectoryHandle(){throw new DOMException('missing','NotFoundError');}},manifestHandle:fileHandle(id,JSON.stringify({project:{id,name:id},pendingChanges:id==='teacher'?[{changedAt:'2026-09-08T00:00:00Z',description:'修改首页',pageIds:['home']}]:[]}))}));
  config.projects=projects.map(({id,name,path})=>({id,name,path}));
  const manifestText=JSON.stringify(config);
  return{config,projects,manifestText,manifestHandle:fileHandle('workspace',manifestText),sharedDocuments:[{id:'overview',title:'总览',releasePath:'docs/_shared/overview.md',fileHandle:fileHandle('overview','# 总览')}]};
}
const release={version:'v1',changedAt:'2026-09-08T01:00:00Z',description:'三端更新'};
let workspace=fixture();
let plan=await ProtoDockWorkspaceRelease.prepare(workspace,release,async()=>{});
assert.equal(writes,0,'打包不能提前清理本地记录');
assert.equal(plan.archive.entries.length,4);
for(const zip of plan.archive.entries.slice(1)){
  const manifest=JSON.parse(zip.data.entries[0].data);
  assert.equal(manifest.workspaceSnapshot.product.version,'v1');
  assert.equal(manifest.changelog.at(-1).version,'v1');
}
workspace.projects[0].manifestHandle.text+=' ';
await assert.rejects(()=>ProtoDockWorkspaceRelease.finalize(plan),/已被修改/);
assert.equal(writes,0);
workspace=fixture();plan=await ProtoDockWorkspaceRelease.prepare(workspace,release,async()=>{});
failName='web';
const originals=workspace.projects.map(project=>project.manifestHandle.text);
await assert.rejects(()=>ProtoDockWorkspaceRelease.finalize(plan),/已还原本次写回/);
assert.deepEqual(workspace.projects.map(project=>project.manifestHandle.text),originals);
failName='';
await ProtoDockWorkspaceRelease.finalize(plan);
assert.equal(JSON.parse(workspace.manifestHandle.text).product.version,'v1');
assert.deepEqual(JSON.parse(workspace.projects[0].manifestHandle.text).changelog.at(-1).pageIds,['home']);
assert.match(JSON.parse(workspace.projects[1].manifestHandle.text).changelog.at(-1).description,/无新增/);
console.log('workspace release: readonly packaging, shared snapshots, conflict protection, rollback, batch finalization passed');
