import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.argv[2]);
const browser = await chromium.launch({headless:true, executablePath:process.env.PROTODOCK_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.route('https://uicdn.toast.com/**', route=>route.fulfill({body:'',contentType:route.request().url().endsWith('.css')?'text/css':'text/javascript'}));
  await page.exposeFunction('readWorkspaceFile', async (relative, operation) => {
    const target=path.resolve(root,relative);
    if (target!==root && !target.startsWith(root+path.sep)) throw Error('Outside workspace');
    if (relative.split('/').some(part=>['.git','.secrets','node_modules','backups'].includes(part)) || relative.endsWith('protodock.local.json')) throw Error('Excluded path');
    if (operation==='list') return (await readdir(target,{withFileTypes:true})).filter(x=>!x.name.startsWith('.')).map(x=>({name:x.name,kind:x.isDirectory()?'directory':'file'}));
    if (operation==='stat') return (await stat(target)).isDirectory()?'directory':'file';
    return (await readFile(target)).toString('base64');
  });
  await page.goto(process.env.PROTODOCK_TEST_URL || 'http://127.0.0.1:6080', {waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
    const handle=(name,relative='',kind='directory')=>({name,kind,
      async queryPermission(){return 'granted';},
      async getFile(){return new File([Uint8Array.from(atob(await window.readWorkspaceFile(relative,'read')), c=>c.charCodeAt(0))],name);},
      async getFileHandle(child){const p=[relative,child].filter(Boolean).join('/');if(await window.readWorkspaceFile(p,'stat')!=='file')throw Error('Not file');return handle(child,p,'file');},
      async getDirectoryHandle(child){const p=[relative,child].filter(Boolean).join('/');if(await window.readWorkspaceFile(p,'stat')!=='directory')throw Error('Not directory');return handle(child,p);},
      async *entries(){for(const x of await window.readWorkspaceFile(relative,'list'))yield[x.name,handle(x.name,[relative,x.name].filter(Boolean).join('/'),x.kind)];}
    });
    await window.ProtoDock.openDroppedProjectDirectory(handle('workspace-history-test'));
  });
  await page.locator('[data-shared-document="__workspace-version-history__"]').click();
  await page.locator('#workspaceVersionHistory h2').waitFor();
  assert.equal(await page.locator('[data-shared-document]').count(),4);
  assert.match(await page.locator('#workspaceVersionHistory').innerText(),/不是历史快照/);
  assert.equal(await page.locator('#nodeInspectorPanel .field:visible').count(),0);
  const target=page.locator('#workspaceVersionHistory > details:not(.history-comparison) button[data-history-project="teacher"]').first();
  const pageId=await target.getAttribute('data-history-page');
  await target.evaluate(button=>{for(let p=button.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
  await target.click();
  const state=await page.evaluate(()=>window.ProtoDock.getState());
  assert.equal(state.workspaceProjectId,'teacher');
  assert.ok(state.selectedNodeId);
  await page.locator('[data-shared-document="__workspace-version-history__"]').click();
  await page.locator('#workspaceVersionHistory h2').waitFor();
  await page.screenshot({path:'/tmp/protodock-workspace-history.png'});
  await page.locator('.history-comparison > summary').click();
  await page.locator('[data-compare-project]').selectOption('1');
  assert.ok((await page.locator('[data-compare-result]').innerText()).length);
  await page.evaluate(()=>{
    window.__detailResult = null;
    window.ProtoDockChangeLogDialog.open({pages:{home:{title:'首页'}}}).then(result=>window.__detailResult=result);
  });
  await page.locator('#changeLogModal summary').click();
  await page.getByRole('button',{name:'添加页面变更',exact:true}).click();
  await page.getByRole('textbox',{name:'具体变更',exact:true}).fill('合并输入框');
  await page.getByRole('textbox',{name:'修改前',exact:true}).fill('两个输入框');
  await page.getByRole('textbox',{name:'修改后',exact:true}).fill('一个输入框');
  await page.locator('#confirmChangeLog').click();
  const recorded = await page.evaluate(()=>window.__detailResult);
  assert.equal(recorded.pageChanges[0].pageId,'home');
  assert.equal(recorded.pageChanges[0].after,'一个输入框');
  assert.equal('status' in recorded.pageChanges[0],false);
  const published = await page.evaluate(entry=>window.ProtoDockChangeLog.releaseSnapshot({project:{id:'history-test',name:'版本明细验收',devicePreset:'web-landscape'},pages:{home:{title:'首页',entry:'pages/home/index.html',doc:'docs/home.md'}},canvas:{nodes:[{id:'home-node',pageId:'home',x:0,y:0}],edges:[]},pendingChanges:[entry]}, {version:'v1',changedAt:entry.changedAt,description:'合并字段'}).manifest,recorded);
  await page.route('**/shares/history-test/v1/**', route=>{
    const url=route.request().url();
    route.fulfill({contentType:url.endsWith('.json')?'application/json':url.endsWith('.md')?'text/plain':'text/html',body:url.endsWith('.json')?JSON.stringify(published):url.endsWith('.md')?'# 首页\n一个输入框':'<!doctype html><h1>首页</h1><input aria-label="合并字段">'});
  });
  await page.goto('http://127.0.0.1:6080/preview.html?share=history-test/v1');
  await page.locator('.release-page-details > summary').click();
  assert.match(await page.locator('.release-page-details').innerText(),/合并输入框/);
  await page.locator('.release-page-details .page-change-item details > summary').click();
  assert.match(await page.locator('.release-page-details').innerText(),/两个输入框/);
  await page.screenshot({path:'/tmp/protodock-release-page-details.png'});
  await page.locator('.release-page-details [data-history-page]').click();
  await page.waitForFunction(()=>document.querySelector('[data-page-id="home"]')?.getBoundingClientRect().top < 200);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,entries:4,linkedPage:pageId,endpoint:state.workspaceProjectId,screenshot:'/tmp/protodock-workspace-history.png'}));
} finally {await browser.close();}
