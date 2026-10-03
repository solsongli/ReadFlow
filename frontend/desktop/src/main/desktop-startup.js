function resolveStartPage() {
  return "workbench.html";
}

function requiresIsolatedBackend({ isPackaged = false, offlinePreview = false } = {}) {
  // A process name or an HTTP health response cannot prove profile ownership.
  // Installed apps and the preview allocate fresh ports and own their children.
  return isPackaged || offlinePreview;
}

module.exports = { resolveStartPage, requiresIsolatedBackend };
