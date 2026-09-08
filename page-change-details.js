(function (global) {
  const types = {add:'新增', modify:'修改', remove:'删除', copy:'文案', docs:'PRD'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function render(changes, project) {
    if (!changes?.length) return '<p class="history-hint">未记录页面级变更明细</p>';
    return `<div class="page-change-list">${changes.map(change => {
      const page = project.manifest?.pages?.[change.pageId];
      const title = escape(change.title || page?.title || change.pageId);
      return `<section class="page-change-item"><header><strong>${title}</strong><span>${escape(types[change.type] || change.type)}</span></header>
        <p>${escape(change.summary)}</p><details><summary>修改前 / 修改后</summary>
        <dl><dt>修改前</dt><dd>${escape(change.before)}</dd><dt>修改后</dt><dd>${escape(change.after)}</dd></dl></details>
        ${page ? `<button type="button" data-history-project="${escape(project.id)}" data-history-page="${escape(change.pageId)}">打开当前页面与 PRD</button>` : '<p class="history-hint">当前页面已不存在；保留变更记录</p>'}</section>`;
    }).join('')}</div>`;
  }

  // Compare a release interval, not guessed snapshots. Keep every edit in recorded order.
  function compare(manifest, from, to) {
    const history = manifest.changelog || [];
    const start = from === 'start' ? -1 : Number(from);
    const end = to === 'pending' ? history.length : Number(to);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < -1 || end > history.length || start >= end) return null;
    const entries = history.slice(start + 1, Math.min(end + 1, history.length));
    if (to === 'pending') entries.push(...(manifest.pendingChanges || []));
    const missing = entries.filter(entry => !entry.pageChanges?.length || (entry.pageIds || []).some(id=>!entry.pageChanges.some(change=>change.pageId===id))).length;
    return {entries, changes:entries.flatMap(entry => entry.pageChanges || []), missing};
  }

  function comparison(projects) {
    return `<details class="history-comparison"><summary>版本对比</summary><p class="history-hint">对比选定版本之间记录的页面变更，不是 PRD 全文或原型快照差异。</p>
      <label>产品端<select data-compare-project>${projects.map((project,index)=>`<option value="${index}">${escape(project.name)}</option>`).join('')}</select></label>
      <label>从<select data-compare-from></select></label><label>到<select data-compare-to></select></label><div data-compare-result></div></details>`;
  }

  function bindComparison(panel, projects) {
    const endpoint = panel.querySelector('[data-compare-project]');
    const from = panel.querySelector('[data-compare-from]');
    const to = panel.querySelector('[data-compare-to]');
    if (!endpoint) return;
    const update = () => {
      const project = projects[Number(endpoint.value)];
      const result = compare(project.manifest, from.value, to.value);
      panel.querySelector('[data-compare-result]').innerHTML = !result ? '<p>请选择早于目标版本的起始版本。</p>' :
        `${result.missing ? `<p class="history-hint">此区间有 ${result.missing} 条记录缺少页面明细，以下不是完整变更清单。</p>` : ''}${result.entries.length ? render(result.changes, project) : '<p>此区间没有变更记录。</p>'}`;
    };
    const selectEndpoint = () => {
      const project = projects[Number(endpoint.value)];
      const history = project.manifest.changelog || [];
      const options = history.map((entry,index)=>`<option value="${index}">${escape(entry.version)}</option>`).join('');
      from.innerHTML = '<option value="start">首个记录之前</option>' + options;
      to.innerHTML = options + '<option value="pending">当前待发布</option>';
      to.value = project.manifest.pendingChanges?.length || !history.length ? 'pending' : String(history.length-1);
      from.value = to.value === 'pending' && history.length ? String(history.length-1) : history.length>1 ? String(history.length-2) : 'start';
      update();
    };
    endpoint.onchange = selectEndpoint;
    from.onchange = update;
    to.onchange = update;
    selectEndpoint();
  }

  global.ProtoDockPageChanges = {types, render, compare, comparison, bindComparison};
})(globalThis);
