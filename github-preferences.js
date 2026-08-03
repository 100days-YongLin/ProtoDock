(() => {
  const STORAGE_KEY = 'protodock.githubPreferences.v1';

  function readPreferences() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (error) {
      return {};
    }
  }

  function writePreferences(preferences) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      return true;
    } catch (error) {
      return false;
    }
  }

  function cleanText(value, maxLength = 512) {
    return String(value || '').trim().slice(0, maxLength);
  }

  function cleanRepoUrl(value) {
    const repoUrl = cleanText(value, 2048);
    if (!/^https?:\/\//i.test(repoUrl)) {
      return repoUrl;
    }
    try {
      const parsed = new URL(repoUrl);
      parsed.username = '';
      parsed.password = '';
      return parsed.toString();
    } catch (error) {
      return repoUrl;
    }
  }

  function pushTargetKey(projectId) {
    return projectId ? `project:${cleanText(projectId, 256)}` : '';
  }

  function getOpenProject() {
    const value = readPreferences().openProject;
    return value && typeof value === 'object' ? { ...value } : {};
  }

  function setOpenProject(value = {}) {
    const preferences = readPreferences();
    preferences.openProject = {
      repoUrl: cleanRepoUrl(value.repoUrl),
      branch: cleanText(value.branch),
      projectPath: cleanText(value.projectPath)
    };
    return writePreferences(preferences);
  }

  function getPushTarget(projectId) {
    const key = pushTargetKey(projectId);
    if (!key) {
      return {};
    }
    const targets = readPreferences().pushTargets;
    const value = targets && typeof targets === 'object' ? targets[key] : null;
    return value && typeof value === 'object' ? { ...value } : {};
  }

  function setPushTarget(projectId, value = {}) {
    const key = pushTargetKey(projectId);
    if (!key) {
      return false;
    }
    const preferences = readPreferences();
    const targets = preferences.pushTargets && typeof preferences.pushTargets === 'object'
      ? preferences.pushTargets
      : {};
    targets[key] = {
      productName: cleanText(value.productName, 64),
      version: cleanText(value.version, 64)
    };
    preferences.pushTargets = targets;
    return writePreferences(preferences);
  }

  window.ProtoDockGithubPreferences = Object.freeze({
    getOpenProject,
    setOpenProject,
    getPushTarget,
    setPushTarget
  });
})();
