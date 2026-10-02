const fs = require("fs");
const path = require("path");

function resolveStartPage({ frontendRoot, isPackaged = false, startPage } = {}) {
  const fallback = isPackaged ? "workbench.html" : "index.html";
  const requested = ["index.html", "workbench.html"].includes(startPage) ? startPage : fallback;
  return fs.existsSync(path.join(frontendRoot, requested)) ? requested : "index.html";
}

function requiresIsolatedBackend({ isPackaged = false, offlinePreview = false } = {}) {
  // A process name or an HTTP health response cannot prove profile ownership.
  // Installed apps and the preview allocate fresh ports and own their children.
  return isPackaged || offlinePreview;
}

module.exports = { resolveStartPage, requiresIsolatedBackend };
