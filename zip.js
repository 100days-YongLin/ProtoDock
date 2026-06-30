(() => {
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[index] = value >>> 0;
  }

  function writeUint16(target, offset, value) {
    target[offset] = value & 0xff;
    target[offset + 1] = (value >>> 8) & 0xff;
  }

  function writeUint32(target, offset, value) {
    target[offset] = value & 0xff;
    target[offset + 1] = (value >>> 8) & 0xff;
    target[offset + 2] = (value >>> 16) & 0xff;
    target[offset + 3] = (value >>> 24) & 0xff;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(input) {
    const date = input ? new Date(input) : new Date();
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  async function entryBytes(data) {
    if (typeof data === 'string') {
      return encoder.encode(data);
    }
    if (data instanceof Uint8Array) {
      return data;
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (data?.arrayBuffer) {
      return new Uint8Array(await data.arrayBuffer());
    }
    throw new Error('zip 条目数据不可读取');
  }

  function normalizePath(path) {
    const normalized = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalized.split('/').filter(Boolean);
    if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
      throw new Error(`zip 条目路径非法：${path}`);
    }
    return parts.join('/');
  }

  function assertZip32Size(size) {
    if (size > 0xffffffff) {
      throw new Error('zip 文件过大');
    }
  }

  async function createZipFile(entries, fileName = 'protodock-project.zip') {
    if (!Array.isArray(entries) || !entries.length) {
      throw new Error('没有可打包的文件');
    }

    const parts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
      const path = normalizePath(entry.path);
      const nameBytes = encoder.encode(path);
      const data = await entryBytes(entry.data);
      const size = data.byteLength;
      assertZip32Size(size);
      assertZip32Size(offset);

      const checksum = crc32(data);
      const stamp = dosDateTime(entry.lastModified);
      const localHeader = new Uint8Array(30);

      writeUint32(localHeader, 0, 0x04034b50);
      writeUint16(localHeader, 4, 20);
      writeUint16(localHeader, 6, 0x0800);
      writeUint16(localHeader, 8, 0);
      writeUint16(localHeader, 10, stamp.time);
      writeUint16(localHeader, 12, stamp.date);
      writeUint32(localHeader, 14, checksum);
      writeUint32(localHeader, 18, size);
      writeUint32(localHeader, 22, size);
      writeUint16(localHeader, 26, nameBytes.byteLength);
      writeUint16(localHeader, 28, 0);

      parts.push(localHeader, nameBytes, data);

      const centralHeader = new Uint8Array(46);
      writeUint32(centralHeader, 0, 0x02014b50);
      writeUint16(centralHeader, 4, 20);
      writeUint16(centralHeader, 6, 20);
      writeUint16(centralHeader, 8, 0x0800);
      writeUint16(centralHeader, 10, 0);
      writeUint16(centralHeader, 12, stamp.time);
      writeUint16(centralHeader, 14, stamp.date);
      writeUint32(centralHeader, 16, checksum);
      writeUint32(centralHeader, 20, size);
      writeUint32(centralHeader, 24, size);
      writeUint16(centralHeader, 28, nameBytes.byteLength);
      writeUint16(centralHeader, 30, 0);
      writeUint16(centralHeader, 32, 0);
      writeUint16(centralHeader, 34, 0);
      writeUint16(centralHeader, 36, 0);
      writeUint32(centralHeader, 38, 0);
      writeUint32(centralHeader, 42, offset);
      centralParts.push(centralHeader, nameBytes);

      offset += localHeader.byteLength + nameBytes.byteLength + size;
    }

    const centralOffset = offset;
    const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
    assertZip32Size(centralOffset);
    assertZip32Size(centralSize);
    if (entries.length > 0xffff) {
      throw new Error('zip 条目过多');
    }

    const endRecord = new Uint8Array(22);
    writeUint32(endRecord, 0, 0x06054b50);
    writeUint16(endRecord, 4, 0);
    writeUint16(endRecord, 6, 0);
    writeUint16(endRecord, 8, entries.length);
    writeUint16(endRecord, 10, entries.length);
    writeUint32(endRecord, 12, centralSize);
    writeUint32(endRecord, 16, centralOffset);
    writeUint16(endRecord, 20, 0);

    const blob = new Blob([...parts, ...centralParts, endRecord], { type: 'application/zip' });
    if (typeof File === 'function') {
      return new File([blob], fileName, { type: 'application/zip' });
    }
    blob.name = fileName;
    return blob;
  }

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.ProtoDockZip = { createZipFile };
})();
