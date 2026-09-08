(async function () {
  const byId = id => document.getElementById(id);
  const part = value => /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value) && !value.includes('..');
  async function get(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('工作区版本不存在或读取失败');
    return response;
  }
  try {
    const [, prefix, product, requested] = location.pathname.split('/');
    if (prefix !== 'w' || !part(product) || !part(requested)) throw new Error('工作区链接无效');
    const config = await (await get(`/workspace-assets/${product}/${requested}/protodock.workspace.json`)).json();
    const version = config.product.version;
    if (!part(version) || version === 'latest') throw new Error('工作区版本无效');
    // Pin all later requests, including endpoint switches, to the one resolved version.
    const base = `/workspace-assets/${product}/${version}/`;
    byId('workspaceName').textContent = config.product.name;
    byId('releaseVersion').textContent = version;
    document.title = `${config.product.name} · ${version}`;
    byId('latestVersion').href = `/w/${product}/latest`;
    const tabs = byId('endpointTabs');
    const buttons = new Map();
    function select(project) {
      for (const [id, button] of buttons) button.setAttribute('aria-current', String(id === project.id));
      byId('endpointPreview').src = `/preview.html?workspace=${encodeURIComponent(`${product}/${version}`)}&endpoint=${encodeURIComponent(project.id)}`;
      history.replaceState(null, '', `/w/${product}/${version}?endpoint=${encodeURIComponent(project.id)}`);
    }
    for (const project of config.projects) {
      if (!part(project.id)) throw new Error('产品端标识无效');
      const button = document.createElement('button');
      button.textContent = project.name;
      button.addEventListener('click', () => select(project));
      buttons.set(project.id, button); tabs.append(button);
    }
    select(config.projects.find(project => project.id === new URLSearchParams(location.search).get('endpoint')) || config.projects[0]);
    const first = config.projects[0];
    const manifest = await (await get(`${base}projects/${first.id}/protodock.project.json`)).json();
    const documents = manifest.workspaceSnapshot?.sharedDocs || [];
    const dialog = byId('sharedDialog');
    let sequence = 0, viewer;
    async function showDocument(document) {
      const current = ++sequence;
      byId('sharedContent').textContent = '正在读取…';
      try {
        const text = await (await get(`${base}projects/${first.id}/${document.path}`)).text();
        if (current !== sequence) return;
        viewer?.destroy(); byId('sharedContent').replaceChildren();
        if (window.toastui?.Editor) viewer = new window.toastui.Editor({ el: byId('sharedContent'), initialValue: text, usageStatistics: false });
        else { const pre = documentElement('pre', text); byId('sharedContent').append(pre); }
      } catch (error) { if (current === sequence) byId('sharedContent').textContent = error.message; }
    }
    for (const document of documents) {
      const button = documentElement('button', document.title);
      button.onclick = () => showDocument(document);
      byId('sharedTabs').append(button);
    }
    byId('openShared').disabled = !documents.length;
    byId('openShared').onclick = () => { byId('sharedTabs').hidden = false; dialog.querySelector('header strong').textContent = '共享产品文档'; dialog.showModal(); showDocument(documents[0]); };
    byId('openRelease').onclick = async () => {
      const current = ++sequence;
      byId('sharedTabs').hidden = true;
      dialog.querySelector('header strong').textContent = `版本更新 · ${version}`;
      dialog.showModal();
      byId('sharedContent').textContent = '正在读取…';
      try {
        const release = await (await get(`${base}release.json`)).json();
        if (current !== sequence) return;
        const content = byId('sharedContent');
        content.replaceChildren(documentElement('pre', release.description));
        for (const project of release.projects) {
          content.append(documentElement('h3', project.name), documentElement('pre', project.description));
          const button = documentElement('button', '查看本端页面与变更明细');
          button.onclick = () => { select(config.projects.find(item => item.id === project.id)); dialog.close(); };
          content.append(button);
        }
      } catch (error) { if (current === sequence) byId('sharedContent').textContent = error.message; }
    };
    byId('closeShared').onclick = () => dialog.close();
  } catch (error) {
    byId('workspaceError').hidden = false;
    byId('workspaceError').textContent = error.message;
  }
  function documentElement(tag, text) { const element = document.createElement(tag); element.textContent = text; return element; }
})();
