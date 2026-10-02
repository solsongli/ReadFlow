const VERSION_ARGUMENT = "--readflow-app-version=";

function appVersionArguments(app, { offlinePreview = false } = {}) {
  // Preview launches a packaged Electron runtime too; that is not a release.
  const version = app.isPackaged && !offlinePreview ? app.getVersion() : "";
  return [VERSION_ARGUMENT + encodeURIComponent(version)];
}

function readAppVersion(argv) {
  // Main's additionalArguments come last, overriding any user-supplied flag.
  const argument = argv.filter((value) => value.startsWith(VERSION_ARGUMENT)).at(-1);
  if (!argument) return "";
  try {
    return decodeURIComponent(argument.slice(VERSION_ARGUMENT.length)).trim();
  } catch {
    return "";
  }
}

module.exports = { appVersionArguments, readAppVersion };
