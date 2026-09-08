/* Whole-workspace packaging is read-only. Local release records change only after publication. */
(function (global) {
  const MANIFEST = 'protodock.project.json';
  const json = value => `${JSON.stringify(value, null, 2)}\n`;
  const read = async handle => (await handle.getFile()).text();
  async function write(handle, text) {
    const stream = await handle.createWritable();
    try { await stream.write(text); await stream.close(); }
    catch (error) { await stream.abort?.().catch(() => {}); throw error; }
  }
  async function check(plan) {
    for (const item of plan.records) {
      if (await read(item.handle) !== item.before) throw new Error(`发布期间 ${item.name} 已被修改，请重新打包`);
    }
    for (const item of plan.files) {
      const file = await item.handle.getFile();
      if (file.size !== item.size || file.lastModified !== item.lastModified) throw new Error(`发布期间 ${item.name} 已被修改，请重新打包`);
    }
  }
  async function prepare(workspace, release, collect, onProgress = () => {}) {
    const configText = await read(workspace.manifestHandle);
    if (configText !== workspace.manifestText) throw new Error('工作区清单已被其他工具修改，请重新打开工作区');
    const config = structuredClone(workspace.config);
    config.product.version = release.version;
    const plan = { records: [], files: [], workspace, release };
    const documents = [];
    for (const document of workspace.sharedDocuments) {
      const text = await read(document.fileHandle);
      documents.push({ ...document, text });
      plan.records.push({ handle: document.fileHandle, before: text, name: document.title });
    }
    const entries = [];
    for (const project of workspace.projects) {
      onProgress({ phase: 'collecting', current: entries.length, total: workspace.projects.length });
      const before = await read(project.manifestHandle);
      const source = JSON.parse(before);
      const pendingDescription = global.ProtoDockChangeLog.pendingDescription(source);
      const description = source.pendingChanges?.length
        ? (pendingDescription && pendingDescription.length <= 1200 ? pendingDescription : release.description)
        : '随工作区版本归档，本端无新增待发布变更。';
      const local = global.ProtoDockChangeLog.releaseSnapshot(source, { ...release, description }).manifest;
      const archive = structuredClone(local);
      archive.workspaceSnapshot = global.ProtoDockProductWorkspace.snapshot(config, project, release.version, documents);
      const endpointEntries = [{ path: MANIFEST, data: json(archive) }, ...documents.map(doc => ({ path: doc.releasePath, data: doc.text }))];
      const paths = new Set(endpointEntries.map(item => item.path));
      const files = [];
      for (const root of ['pages', 'docs', 'assets']) {
        try { await collect(await project.handle.getDirectoryHandle(root), root, files); }
        catch (error) { if (error.name !== 'NotFoundError') throw error; }
      }
      for (const item of files) {
        if (paths.has(item.path)) continue;
        const file = await item.handle.getFile();
        endpointEntries.push({ path: item.path, data: file, lastModified: file.lastModified });
        plan.files.push({ handle: item.handle, size: file.size, lastModified: file.lastModified, name: `${project.name}/${item.path}` });
      }
      plan.records.push({ handle: project.manifestHandle, before, after: json(local), name: project.name });
      entries.push({ path: `projects/${project.id}.zip`, data: await global.ProtoDockZip.createZipFile(endpointEntries, `${project.id}.zip`) });
    }
    plan.records.push({ handle: workspace.manifestHandle, before: configText, after: json(config), name: '工作区清单' });
    entries.unshift({ path: 'protodock.workspace.json', data: json(config) });
    await check(plan);
    plan.archive = await global.ProtoDockZip.createZipFile(entries, `${config.product.id}-${release.version}.zip`, { onProgress });
    return plan;
  }
  async function finalize(plan) {
    if (!plan) throw new Error('缺少本次工作区发布快照');
    await check(plan);
    const written = [];
    try {
      for (const item of plan.records.filter(item => item.after !== undefined && item.after !== item.before)) {
        if (await read(item.handle) !== item.before) throw new Error(`${item.name} 已修改，停止写回`);
        await write(item.handle, item.after);
        written.push(item);
      }
    } catch (error) {
      const failed = [];
      for (const item of written.reverse()) {
        try {
          if (await read(item.handle) !== item.after) throw new Error('文件已再次修改');
          await write(item.handle, item.before);
        } catch (_) { failed.push(item.name); }
      }
      throw new Error(`${error.message}${failed.length ? `；以下记录未能还原，需人工核对：${failed.join('、')}` : '；已还原本次写回'}`);
    }
  }
  global.ProtoDockWorkspaceRelease = Object.freeze({ prepare, finalize, check });
})(window);
