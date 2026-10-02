import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);

test("window, tray and load/crash dialogs share the brand without launching Electron", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-windows-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "app/frontend"), { recursive: true });
  fs.writeFileSync(path.join(root, "app/frontend/workbench.html"), "fixture");
  let window;
  const errors = [];
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      window = this;
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
    }
    loadURL(url) { this.url = url; }
  }
  class Tray extends EventEmitter {
    setToolTip(value) { this.tooltip = value; }
    setContextMenu() {}
  }
  const electron = {
    BrowserWindow, Tray, Menu: { buildFromTemplate: (items) => items },
    dialog: { showErrorBox: (...args) => errors.push(args) }, shell: {},
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(new URL("./desktop-windows.js", import.meta.url), "utf8"), {
    module, process, console, URL,
    require: (name) => name === "electron" ? electron : require(name),
  });
  const desktop = module.exports.createDesktopWindows({ isPackaged: true, getVersion: () => "0.9.0" }, {
    appRoot: root, logDesktop() {}, logDesktopError() {}, getFrontendBaseUrl: () => "http://127.0.0.1:40001",
  });
  desktop.createWindow();
  assert.equal(window.options.title, "ReadFlow");
  assert.equal(window.options.webPreferences.additionalArguments[0], "--readflow-app-version=0.9.0");
  assert.equal(window.url, "http://127.0.0.1:40001/workbench.html");
  let prevented = false;
  window.emit("page-title-updated", { preventDefault() { prevented = true; } }, "Legacy title");
  assert.equal(prevented, true);
  assert.equal(desktop.createTray().tooltip, "ReadFlow");
  window.webContents.emit("did-fail-load", {}, -2, "fixture failure", "http://localhost");
  window.webContents.emit("render-process-gone", {}, { reason: "fixture crash", exitCode: 1 });
  assert.deepEqual(errors.map(([title]) => title), ["ReadFlow 页面加载失败", "ReadFlow 渲染进程异常退出"]);
});
