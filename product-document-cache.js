(function initProductDocumentScreenshotCache(global) {
  const CACHE_VERSION = 'prd-shot-v1';
  const DATABASE_NAME = 'protodock-cache';
  const DATABASE_VERSION = 1;
  const STORE_NAME = 'product-document-screenshots';

  function splitPath(value) {
    const stack = [];
    String(value || '').replace(/\\/g, '/').split('/').forEach((part) => {
      if (!part || part === '.') {
        return;
      }
      if (part === '..') {
        stack.pop();
        return;
      }
      stack.push(part);
    });
    return stack;
  }

  function dirname(value) {
    const parts = splitPath(value);
    parts.pop();
    return parts.join('/');
  }

  function hashString(value) {
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x85ebca6b);
    }
    return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('截图缓存读取失败'));
    });
  }

  function openDatabase(indexedDb) {
    if (!indexedDb?.open) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  function createScreenshotCache(options = {}) {
    const memory = new Map();
    const databasePromise = openDatabase(options.indexedDB ?? global.indexedDB);

    return {
      async get(key) {
        if (!key) {
          return null;
        }
        if (memory.has(key)) {
          return memory.get(key);
        }
        try {
          const database = await databasePromise;
          if (!database) {
            return null;
          }
          const transaction = database.transaction(STORE_NAME, 'readonly');
          const record = await requestResult(transaction.objectStore(STORE_NAME).get(key));
          const screenshot = record?.screenshot || null;
          if (screenshot) {
            memory.set(key, screenshot);
          }
          return screenshot;
        } catch (error) {
          console.warn('ProtoDock: screenshot cache read failed', error);
          return null;
        }
      },
      async set(key, screenshot) {
        if (!key || !screenshot) {
          return;
        }
        memory.set(key, screenshot);
        try {
          const database = await databasePromise;
          if (!database) {
            return;
          }
          const transaction = database.transaction(STORE_NAME, 'readwrite');
          await requestResult(transaction.objectStore(STORE_NAME).put({
            key,
            screenshot,
            updatedAt: Date.now()
          }));
        } catch (error) {
          console.warn('ProtoDock: screenshot cache write failed', error);
        }
      },
      clearMemory() {
        memory.clear();
      }
    };
  }

  async function directoryHandleAt(rootHandle, path) {
    let handle = rootHandle;
    for (const part of splitPath(path)) {
      handle = await handle.getDirectoryHandle(part);
    }
    return handle;
  }

  async function directoryFingerprint(rootHandle, path) {
    if (!rootHandle || !path) {
      return 'none';
    }
    let directory;
    try {
      directory = await directoryHandleAt(rootHandle, path);
    } catch (error) {
      if (error?.name === 'NotFoundError') {
        return 'missing';
      }
      throw error;
    }

    const entries = [];
    async function visit(handle, prefix) {
      const children = [];
      for await (const [name, child] of handle.entries()) {
        children.push({ name, child });
      }
      children.sort((left, right) => left.name.localeCompare(right.name));
      for (const item of children) {
        const childPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.child.kind === 'directory') {
          await visit(item.child, childPath);
        } else {
          const file = await item.child.getFile();
          entries.push(`${childPath}:${file.size}:${file.lastModified}`);
        }
      }
    }
    await visit(directory, '');
    return hashString(entries.join('|'));
  }

  async function remoteEntryFingerprint(fetchImpl, projectBaseUrl, entry, fallback) {
    if (!fetchImpl || !projectBaseUrl || !entry) {
      return fallback || 'unknown';
    }
    try {
      const response = await fetchImpl(new URL(entry, projectBaseUrl), {
        method: 'HEAD',
        cache: 'no-store'
      });
      if (!response.ok) {
        return fallback || `status-${response.status}`;
      }
      return [
        response.headers.get('etag') || '',
        response.headers.get('last-modified') || '',
        response.headers.get('content-length') || ''
      ].join(':') || fallback || 'remote';
    } catch (error) {
      return fallback || 'remote';
    }
  }

  function createProjectRevisionSession(options = {}) {
    const directoryFingerprints = new Map();
    const shareRevision = options.shareId
      ? `share:${options.shareId}:${options.manifestHash || 'unknown'}`
      : '';
    const sharedAssetsRevision = options.shareId
      ? Promise.resolve(shareRevision)
      : options.projectHandle
        ? directoryFingerprint(options.projectHandle, 'assets')
        : Promise.resolve(options.manifestHash || options.projectBaseUrl || 'remote');

    function localDirectoryRevision(path) {
      if (!directoryFingerprints.has(path)) {
        directoryFingerprints.set(path, directoryFingerprint(options.projectHandle, path));
      }
      return directoryFingerprints.get(path);
    }

    async function pageRevision(page) {
      if (options.shareId) {
        return shareRevision;
      }
      if (options.projectHandle) {
        return localDirectoryRevision(dirname(page.entry));
      }
      return remoteEntryFingerprint(
        options.fetch || global.fetch?.bind(global),
        options.projectBaseUrl,
        page.entry,
        options.manifestHash
      );
    }

    return {
      async keyForPage(page, captureProfile = {}) {
        const payload = {
          version: CACHE_VERSION,
          project: options.projectId || '',
          source: options.shareId
            ? `${options.projectBaseUrl || ''}|${shareRevision}`
            : options.projectDirectoryName || options.projectBaseUrl || '',
          pageId: page.id || page.pageId || '',
          entry: page.entry || '',
          pageRevision: await pageRevision(page),
          assetsRevision: await sharedAssetsRevision,
          captureProfile
        };
        return `${CACHE_VERSION}:${hashString(JSON.stringify(payload))}`;
      }
    };
  }

  global.ProtoDockProductDocumentCache = {
    CACHE_VERSION,
    createScreenshotCache,
    createProjectRevisionSession,
    screenshotCache: createScreenshotCache()
  };
})(typeof window !== 'undefined' ? window : globalThis);
