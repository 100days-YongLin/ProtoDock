(function initProtoDockProductWorkspace(global) {
  const FILE_NAME = 'protodock.workspace.json';
  const DEFAULT_SHARED_DOCS_DIR = 'shared-docs';

  function cleanText(value) {
    return String(value || '').trim();
  }

  function cleanId(value, label) {
    const id = cleanText(value);
    if (!id || !/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
      throw new Error(`${label}只能使用英文、数字、点、下划线和短横线`);
    }
    return id;
  }

  function pathParts(value, label = '路径') {
    const path = cleanText(value).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const parts = path.split('/').filter(Boolean);
    if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
      throw new Error(`${label}必须是工作区根目录内的相对路径`);
    }
    return parts;
  }

  function normalize(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`${FILE_NAME} 必须是 JSON 对象`);
    }
    if (Number(config.schemaVersion) !== 1) {
      throw new Error(`${FILE_NAME} 的 schemaVersion 必须为 1`);
    }
    const product = config.product || {};
    const normalizedProduct = {
      id: cleanId(product.id, '产品标识'),
      name: cleanText(product.name),
      description: cleanText(product.description),
      version: cleanText(product.version)
    };
    if (!normalizedProduct.name) {
      throw new Error('产品名称不能为空');
    }

    const projects = Array.isArray(config.projects) ? config.projects : [];
    if (!projects.length) {
      throw new Error('产品工作区至少需要一个原型项目');
    }
    const projectIds = new Set();
    const projectPaths = new Set();
    const normalizedProjects = projects.map((project, index) => {
      const id = cleanId(project?.id, `第 ${index + 1} 个端标识`);
      const name = cleanText(project?.name);
      const path = pathParts(project?.path, `第 ${index + 1} 个项目路径`).join('/');
      if (!name) {
        throw new Error(`第 ${index + 1} 个端名称不能为空`);
      }
      if (projectIds.has(id)) {
        throw new Error(`端标识重复：${id}`);
      }
      if (projectPaths.has(path)) {
        throw new Error(`项目路径重复：${path}`);
      }
      projectIds.add(id);
      projectPaths.add(path);
      return { id, name, path };
    });

    return {
      schemaVersion: 1,
      product: normalizedProduct,
      sharedDocs: pathParts(config.sharedDocs || DEFAULT_SHARED_DOCS_DIR, '共享文档路径').join('/'),
      projects: normalizedProjects
    };
  }

  async function directoryHandle(rootHandle, path) {
    let handle = rootHandle;
    for (const part of pathParts(path)) {
      handle = await handle.getDirectoryHandle(part);
    }
    return handle;
  }

  async function fileHandle(rootHandle, path) {
    const parts = pathParts(path);
    const name = parts.pop();
    const parent = parts.length ? await directoryHandle(rootHandle, parts.join('/')) : rootHandle;
    return parent.getFileHandle(name);
  }

  async function readText(handle) {
    return (await handle.getFile()).text();
  }

  function titleFromMarkdown(markdown, fallback) {
    const heading = String(markdown || '').match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
    return heading || cleanText(fallback) || '共享文档';
  }

  function documentId(fileName) {
    return cleanText(fileName)
      .replace(/\.md$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff._-]+/g, '-')
      .replace(/^[._-]+|[._-]+$/g, '') || 'shared-document';
  }

  async function listSharedDocuments(rootHandle, sharedDocsPath) {
    let directory;
    try {
      directory = await directoryHandle(rootHandle, sharedDocsPath);
    } catch (error) {
      if (error?.name === 'NotFoundError') {
        return [];
      }
      throw error;
    }
    const files = [];
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind === 'file' && /\.md$/i.test(name)) {
        files.push({ name, handle });
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
    const seenIds = new Set();
    const documents = [];
    for (const file of files) {
      const text = await readText(file.handle);
      const id = documentId(file.name);
      if (seenIds.has(id)) {
        throw new Error(`共享文档标识重复：${file.name}`);
      }
      seenIds.add(id);
      documents.push({
        id,
        title: titleFromMarkdown(text, file.name.replace(/\.md$/i, '')),
        path: `${sharedDocsPath}/${file.name}`,
        releasePath: `docs/_shared/${id}.md`,
        fileHandle: file.handle,
        text
      });
    }
    return documents;
  }

  async function load(rootHandle) {
    if (!rootHandle || rootHandle.kind !== 'directory') {
      throw new Error('请选择产品工作区文件夹');
    }
    const manifestHandle = await rootHandle.getFileHandle(FILE_NAME);
    const manifestText = await readText(manifestHandle);
    const config = normalize(JSON.parse(manifestText));
    const projects = [];
    for (const descriptor of config.projects) {
      let handle;
      let projectManifestHandle;
      try {
        handle = await directoryHandle(rootHandle, descriptor.path);
        projectManifestHandle = await handle.getFileHandle('protodock.project.json');
      } catch (error) {
        if (error?.name === 'NotFoundError') {
          throw new Error(`${descriptor.name} 缺少 ${descriptor.path}/protodock.project.json`);
        }
        throw error;
      }
      const projectManifestText = await readText(projectManifestHandle);
      const projectManifest = JSON.parse(projectManifestText);
      if (!projectManifest?.project?.id || !projectManifest?.pages || !projectManifest?.canvas) {
        throw new Error(`${descriptor.name} 的 protodock.project.json 不是有效项目清单`);
      }
      projects.push({
        ...descriptor,
        handle,
        manifestHandle: projectManifestHandle,
        manifestText: projectManifestText,
        manifest: projectManifest
      });
    }
    return {
      rootHandle,
      manifestHandle,
      manifestText,
      config,
      projects,
      sharedDocuments: await listSharedDocuments(rootHandle, config.sharedDocs)
    };
  }

  function snapshot(workspace, activeProject, version, sharedDocuments) {
    if (!workspace?.product || !activeProject) {
      return null;
    }
    return {
      product: {
        id: workspace.product.id,
        name: workspace.product.name,
        description: workspace.product.description || '',
        version: cleanText(version || workspace.product.version)
      },
      project: {
        id: activeProject.id,
        name: activeProject.name
      },
      sharedDocs: (sharedDocuments || []).map((document) => ({
        id: document.id,
        title: document.title,
        path: document.releasePath || `docs/_shared/${documentId(document.id)}.md`
      }))
    };
  }

  function publishProductId(workspace, activeProject) {
    if (!workspace?.product?.id || !activeProject?.id) {
      return '';
    }
    return `${workspace.product.id}-${activeProject.id}`;
  }

  global.ProtoDockProductWorkspace = {
    FILE_NAME,
    DEFAULT_SHARED_DOCS_DIR,
    normalize,
    pathParts,
    directoryHandle,
    fileHandle,
    titleFromMarkdown,
    documentId,
    listSharedDocuments,
    load,
    snapshot,
    publishProductId
  };
})(typeof window !== 'undefined' ? window : globalThis);
