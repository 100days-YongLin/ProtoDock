(function (global) {
  const ID = '__workspace-version-history__';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

  function records(projects) {
    const pending = [];
    const versions = new Map();
    for (const project of projects) {
      for (const entry of project.manifest?.pendingChanges || []) pending.push({...entry, project});
      for (const entry of project.manifest?.changelog || []) {
        const key = entry.version || '版本未记录';
        if (!versions.has(key)) versions.set(key, []);
        versions.get(key).push({...entry, project});
      }
    }
    const byTime = (a,b) => time(b.changedAt)-time(a.changedAt);
    return {
      pending: pending.sort(byTime),
      versions: [...versions].map(([version, entries]) => ({version, entries:entries.sort(byTime)}))
        .sort((a,b) => time(b.entries[0]?.changedAt)-time(a.entries[0]?.changedAt))
    };
  }

  function entryHtml(entry) {
    const {project} = entry;
    const detailIds = new Set((entry.pageChanges || []).map(change=>change.pageId));
    const pageIds = Array.isArray(entry.pageIds) ? [...new Set(entry.pageIds)].filter(id=>!detailIds.has(id)) : [];
    const pages = pageIds.map(id => project.manifest?.pages?.[id]
      ? `<button type="button" data-history-project="${escape(project.id)}" data-history-page="${escape(id)}">${escape(project.manifest.pages[id].title || id)} · 当前页面与 PRD</button>`
      : `<span>${escape(id)} · 当前页面已不存在</span>`).join('');
    return `<article><time>${escape(entry.changedAt || '日期未记录')}</time><pre>${escape(entry.description)}</pre>${entry.pageChanges?.length ? `<details><summary>页面变更明细（${entry.pageChanges.length}）</summary>${global.ProtoDockPageChanges.render(entry.pageChanges, project)}</details>` : ''}${pageIds.length ? `<details><summary>涉及页面（${pageIds.length}，未记录明细）</summary><div class="history-pages">${pages}</div></details>` : !detailIds.size ? '<p class="history-hint">未记录涉及页面</p>' : ''}</article>`;
  }

  function groupedHtml(entries) {
    const endpoints = new Map();
    for (const entry of entries) {
      if (!endpoints.has(entry.project.id)) endpoints.set(entry.project.id, []);
      endpoints.get(entry.project.id).push(entry);
    }
    return [...endpoints.values()].map(items=>`<section><h3>${escape(items[0].project.name)}</h3>${items.map(entryHtml).join('')}</section>`).join('');
  }

  async function render(panel, workspace, activeId, activeManifest, isCurrent) {
    panel.innerHTML = '<p>正在读取版本记录…</p>';
    const projects = await Promise.all(workspace.projects.map(async project => {
      if (project.id === activeId) return {...project, manifest:activeManifest};
      try {
        return {...project, manifest:JSON.parse(await (await project.manifestHandle.getFile()).text())};
      } catch (error) {return {...project, error:error.message, manifest:{}};}
    }));
    if (!isCurrent()) return;
    const data = records(projects);
    panel.innerHTML = `<p class="history-hint">按各端原始发布记录汇总；页面链接打开当前版本，不是历史快照。</p>
      ${projects.filter(p=>p.error).map(p=>`<p role="alert">${escape(p.name)}记录读取失败，请重新打开版本更新。</p>`).join('')}
      ${global.ProtoDockPageChanges.comparison(projects)}
      <details open><summary>待发布（${data.pending.length}）</summary>${data.pending.length ? groupedHtml(data.pending) : '<p>暂无待发布改动</p>'}</details>
      <h2>已发布</h2>${data.versions.length ? data.versions.map(v=>`<details><summary>${escape(v.version)}</summary>${groupedHtml(v.entries)}</details>`).join('') : '<p>暂无发布记录</p>'}`;
    global.ProtoDockPageChanges.bindComparison(panel, projects);
  }

  global.ProtoDockWorkspaceHistory = {ID, records, render};
})(globalThis);
