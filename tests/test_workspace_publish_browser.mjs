import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temporary = await mkdtemp(`${tmpdir()}/protodock-workspace-test-`);
const service = spawn('python3', ['-u', '-c', "import server,os; from pathlib import Path; from http.server import ThreadingHTTPServer; server.SHARES_DIR=Path(os.environ['TEST_SHARES']); s=ThreadingHTTPServer(('127.0.0.1',0),server.ProtoDockHandler); print(s.server_port,flush=True); s.serve_forever()"], {env:{...process.env, TEST_SHARES:temporary},stdio:['ignore','pipe','pipe']});
let stderr=''; service.stderr.on('data',data=>stderr+=data);
let browser;
try {
  const port = await new Promise((resolve,reject)=>{service.stdout.once('data',data=>resolve(Number(data.toString().trim().split('\n')[0])));service.once('exit',()=>reject(Error(stderr)));});
  assert.ok(port);
  const base=`http://127.0.0.1:${port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.PROTODOCK_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://uicdn.toast.com/**',route=>route.fulfill({body:'',contentType:route.request().url().endsWith('.css')?'text/css':'text/javascript'}));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
    const projects=['teacher','parent','web'].map(id=>({id,name:id,path:`projects/${id}`}));
    const files=new Map();
    files.set('protodock.workspace.json',JSON.stringify({schemaVersion:1,product:{id:'demo',name:'三端验收',version:'v0'},sharedDocs:'shared-docs',projects}));
    files.set('shared-docs/overview.md','# 产品总览\n唯一共享文档');
    for(const project of projects){
      files.set(`${project.path}/protodock.project.json`,JSON.stringify({schemaVersion:1,project:{id:project.id,name:project.name,devicePreset:'web-landscape'},pages:{home:{title:'首页',entry:'pages/home/index.html',doc:'docs/home.md'}},canvas:{nodes:[{id:'home-node',pageId:'home',x:0,y:0}],edges:[]},pendingChanges:project.id==='teacher'?[{changedAt:'2026-09-08T10:00:00Z',description:'调整首页字段',pageChanges:[{pageId:'home',title:'首页',type:'modify',summary:'合并字段',before:'两个',after:'一个'}]}]:[]}));
      files.set(`${project.path}/pages/home/index.html`,`<!doctype html><html><body><h1>${project.name} 首页</h1></body></html>`);
      files.set(`${project.path}/docs/home.md`,'# 首页\n首页说明');
    }
    const missing=()=>new DOMException('Not found','NotFoundError');
    const handle=(path='',kind='directory')=>({name:path.split('/').pop()||'test-workspace',kind,
      async queryPermission(){return 'granted';},async requestPermission(){return 'granted';},
      async getFile(){if(!files.has(path))throw missing();return new File([files.get(path)],path.split('/').pop(),{lastModified:1});},
      async getFileHandle(name){const next=[path,name].filter(Boolean).join('/');if(!files.has(next))throw missing();return handle(next,'file');},
      async getDirectoryHandle(name){const next=[path,name].filter(Boolean).join('/');if(![...files.keys()].some(key=>key.startsWith(next+'/')))throw missing();return handle(next);},
      async *entries(){const prefix=path?path+'/':'';const names=new Set([...files.keys()].filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length).split('/')[0]));for(const name of names){const next=prefix+name;yield[name,handle(next,files.has(next)?'file':'directory')];}},
      async createWritable(){let value;return{async write(text){value=text;},async close(){files.set(path,value);},async abort(){}};}
    });
    window.__files=files;
    await window.ProtoDock.openDroppedProjectDirectory(handle());
  });
  await page.locator('#openShareModal').click();
  assert.equal(await page.locator('#publishScope input:checked').inputValue(),'workspace');
  assert.match(await page.locator('#uploadShareFile').innerText(),/发布整个工作区/);
  await page.locator('#publishVersion').fill('v1');
  await page.locator('#publishCommitMessage').fill('三端统一版本验收');
  await page.locator('#publishSyncGithub').uncheck();
  assert.match(await page.locator('#publishUrlPreview').innerText(),/\/w\/demo\/v1/);
  await page.locator('#publishScope label').filter({hasText:'仅当前端'}).click();
  assert.equal(await page.locator('#workspacePublishTargetLabel').innerText(),'发布当前端');
  assert.match(await page.locator('#publishUrlPreview').innerText(),/\/s\/demo-teacher\/v0/);
  await page.locator('#publishScope label').filter({hasText:'整个工作区'}).click();
  assert.equal(await page.locator('#workspacePublishTargetLabel').innerText(),'发布工作区');
  await page.locator('#publishVersion').fill('v1');
  await page.locator('#publishCommitMessage').fill('三端统一版本验收');
  await page.locator('#publishSyncGithub').uncheck();
  await page.locator('#uploadShareFile').click();
  await page.waitForFunction(()=>document.querySelector('#shareStatus').textContent.includes('已发布'),{timeout:30000});
  const status=await page.locator('#shareStatus').innerText();
  assert.doesNotMatch(status,/未写回|失败/);
  const local=await page.evaluate(()=>[...window.__files].filter(([path])=>path.endsWith('protodock.project.json')).map(([,text])=>JSON.parse(text)));
  assert.equal(local.length,3);
  for(const manifest of local){assert.equal(manifest.changelog.at(-1).version,'v1');assert.equal(manifest.pendingChanges.length,0);}
  assert.equal(local[0].changelog.at(-1).pageChanges[0].summary,'合并字段');
  assert.equal(local[1].changelog.at(-1).pageChanges,undefined);
  await page.goto(`${base}/w/demo/latest`,{waitUntil:'domcontentloaded'});
  await page.waitForURL('**/w/demo/v1?endpoint=teacher');
  assert.equal(await page.locator('#endpointTabs button').count(),3);
  for(const id of ['teacher','parent','web']){
    await page.locator('#endpointTabs button').filter({hasText:id}).click();
    await page.frameLocator('#endpointPreview').locator('.product-page').first().waitFor();
    assert.match(await page.locator('#endpointPreview').getAttribute('src'),new RegExp(`endpoint=${id}`));
    assert.equal(await page.frameLocator('#endpointPreview').locator('.product-shared-documents').count(),0);
  }
  await page.screenshot({path:'/tmp/protodock-workspace-published.png'});
  await page.locator('#openRelease').click();
  await page.waitForFunction(()=>document.querySelector('#sharedContent').textContent.includes('三端统一版本验收'));
  await page.locator('#closeShared').click();
  await page.locator('#openShared').click();
  await page.waitForFunction(()=>document.querySelector('#sharedContent').textContent.includes('唯一共享文档'));
  await page.screenshot({path:'/tmp/protodock-workspace-shared.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,scopeSwitch:true,endpoints:3,localFinalized:3,sharedDocsOnce:true,fixedVersion:true}));
} finally {
  await browser?.close();
  service.kill('SIGTERM'); await once(service,'exit').catch(()=>{});
  await rm(temporary,{recursive:true,force:true});
}
