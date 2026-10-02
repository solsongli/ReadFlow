const fs = require("fs");
const path = require("path");
const { productName } = require("../../package.json");

if (typeof productName !== "string" || !productName.trim()) {
  throw new Error("Desktop package.json must define productName");
}

const PRODUCT_NAME = productName.trim();

function configureDesktopIdentity(app) {
  const hasUserDataOverride = app.commandLine.hasSwitch("user-data-dir");
  const originalUserData = app.getPath("userData");
  app.setName(PRODUCT_NAME);
  // Electron already resolves --user-data-dir, including the preview launcher's
  // Chromium profile. Branding must preserve that choice in every launch mode.
  if (hasUserDataOverride && app.getPath("userData") !== originalUserData) {
    throw new Error("Electron changed --user-data-dir after setName; refusing to use a different profile");
  }
  const userData = hasUserDataOverride ? originalUserData : path.join(app.getPath("appData"), PRODUCT_NAME);
  // Electron setPath requires the directory to exist, including on first run.
  fs.mkdirSync(userData, { recursive: true, mode: 0o700 });
  if (!hasUserDataOverride) {
    app.setPath("userData", userData);
    app.setPath("sessionData", userData);
  }
  return userData;
}

function resolveBrandIcon(appRoot, size = 512) {
  const icon = path.join(appRoot, "build", "readflow", `${size}x${size}.png`);
  // The preview launcher copies assets/ but intentionally does not copy build/.
  return fs.existsSync(icon) ? icon : path.join(appRoot, "assets", "readflow.png");
}

module.exports = { PRODUCT_NAME, configureDesktopIdentity, resolveBrandIcon };
