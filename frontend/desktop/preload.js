const { contextBridge, ipcRenderer } = require("electron");
const { pathToFileURL } = require("url");
const { PRODUCT_NAME, resolveBrandIcon } = require("./src/main/brand");
const { readAppVersion } = require("./src/main/app-version");

window.addEventListener("error", (event) => {
  ipcRenderer.send("desktop:renderer-issue", {
    type: "error",
    message: event?.message || "unknown renderer error",
    filename: event?.filename || "",
    lineno: event?.lineno || 0,
    colno: event?.colno || 0,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  ipcRenderer.send("desktop:renderer-issue", {
    type: "unhandledrejection",
    message: typeof reason === "string"
      ? reason
      : (reason?.message || String(reason || "unknown rejection")),
  });
});

contextBridge.exposeInMainWorld("retainPdfDesktop", {
  brand: { productName: PRODUCT_NAME, iconUrl: pathToFileURL(resolveBrandIcon(__dirname, 128)).href },
  platform: process.platform,
  appVersion: readAppVersion(process.argv),
  listInstalledFonts() {
    return ipcRenderer.invoke("desktop:invoke", "list_installed_fonts");
  },
  loadConnectorSettings() {
    return ipcRenderer.invoke("desktop:invoke", "load_connector_settings");
  },
  saveConnectorSettings(enabled) {
    return ipcRenderer.invoke("desktop:invoke", "save_connector_settings", { enabled });
  },
  restartReadFlow() {
    return ipcRenderer.invoke("desktop:invoke", "restart_readflow");
  },
  invoke(command, args = {}) {
    return ipcRenderer.invoke("desktop:invoke", command, args);
  },
  loadDesktopConfig() {
    return ipcRenderer.invoke("desktop:invoke", "load_desktop_config");
  },
  saveDesktopConfig(payload = {}) {
    return ipcRenderer.invoke("desktop:invoke", "save_desktop_config", { payload });
  },
  onStartupProgress(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("startup-progress", listener);
    return () => {
      ipcRenderer.removeListener("startup-progress", listener);
    };
  },
});

contextBridge.exposeInMainWorld("__TAURI_INTERNALS__", {
  invoke(command, args = {}) {
    return window.retainPdfDesktop.invoke(command, args);
  },
});
