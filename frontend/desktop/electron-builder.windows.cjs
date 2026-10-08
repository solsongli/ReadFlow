// Protected Windows release: NSIS installer, hardened Electron fuses and bundled licence notices.
// Used only by the Windows release workflow:  electron-builder --win nsis --x64 --config electron-builder.windows.cjs
// The Linux release keeps package.json "build" unchanged (its acceptance tooling needs inspect/run-as-node).
const base = require("./package.json").build;

module.exports = {
  ...base,
  directories: { ...base.directories, output: "dist-win" },
  win: {
    ...base.win,
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    ...base.nsis,
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "ReadFlow",
    deleteAppDataOnUninstall: false,
  },
  extraResources: [
    ...base.extraResources,
    { from: "build/windows-licenses", to: "licenses" },
  ],
  // Fuses are flipped in the Electron binary itself and cannot be changed after packaging.
  electronFuses: {
    runAsNode: false, // ELECTRON_RUN_AS_NODE can no longer turn ReadFlow.exe into a Node interpreter.
    enableNodeOptionsEnvironmentVariable: false, // NODE_OPTIONS cannot inject code (--require).
    enableNodeCliInspectArguments: false, // --inspect / --inspect-brk cannot attach a debugger.
    enableEmbeddedAsarIntegrityValidation: true, // A modified app.asar refuses to load.
    onlyLoadAppFromAsar: true, // Code is only loaded from the verified app.asar.
    enableCookieEncryption: true,
    loadBrowserProcessSpecificV8Snapshot: false,
  },
};
