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
  const target=page.locator('#workspaceVersionHistory button[data-history-project="teacher"]').first();
  const pageId=await target.getAttribute('data-history-page');
  await target.locator('xpath=ancestor::details[1]/summary').click();
  await target.click();
  const state=await page.evaluate(()=>window.ProtoDock.getState());
  assert.equal(state.workspaceProjectId,'teacher');
  assert.ok(state.selectedNodeId);
  await page.locator('[data-shared-document="__workspace-version-history__"]').click();
  await page.locator('#workspaceVersionHistory h2').waitFor();
  await page.screenshot({path:'/tmp/protodock-workspace-history.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,entries:4,linkedPage:pageId,endpoint:state.workspaceProjectId,screenshot:'/tmp/protodock-workspace-history.png'}));
} finally {await browser.close();}
