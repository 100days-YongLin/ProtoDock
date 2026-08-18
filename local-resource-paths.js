(function initProtoDockLocalResourcePaths(global) {
  function filesystemPath(value) {
    const text = String(value || '');
    const queryIndex = text.indexOf('?');
    const hashIndex = text.indexOf('#');
    const suffixIndexes = [queryIndex, hashIndex].filter((index) => index >= 0);
    const end = suffixIndexes.length ? Math.min(...suffixIndexes) : text.length;
    return text.slice(0, end);
  }

  global.ProtoDockLocalResourcePaths = {
    filesystemPath
  };
})(window);
