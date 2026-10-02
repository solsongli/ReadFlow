import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { appVersionArguments, readAppVersion } from "./app-version.js";

test("release version comes only from Electron app.getVersion and reaches preload", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const require = createRequire(path.join(root, "preload.js"));
  let reads = 0;
  const argv = appVersionArguments({ isPackaged: true, getVersion() { reads++; return "1.2.3-beta.4"; } });
  const exposed = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, "preload.js"), "utf8"), {
    __dirname: root, process: { platform: "linux", argv: ["electron", ...argv] },
    window: { addEventListener() {} },
    require: (name) => name === "electron"
      ? { contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value; } }, ipcRenderer: {} }
      : require(name),
  });
  assert.equal(reads, 1);
  assert.equal(exposed.retainPdfDesktop.appVersion, "1.2.3-beta.4");
});

test("packaged preview and development do not expose a release version", () => {
  const getVersion = () => { throw new Error("Preview must not read the runtime's version"); };
  for (const [isPackaged, offlinePreview] of [[true, true], [false, false], [false, true]]) {
    const argv = appVersionArguments({ isPackaged, getVersion }, { offlinePreview });
    assert.equal(readAppVersion(argv), "");
    assert.equal(readAppVersion(["--readflow-app-version=9.9.9", ...argv]), "");
  }
  const main = fs.readFileSync(new URL("../../main.js", import.meta.url), "utf8");
  assert.match(main, /offlinePreview: process\.env\.RETAIN_PDF_OFFLINE_LIBRARY_PREVIEW === "1"/);
});

test("missing or malformed version arguments fall back to development", () => {
  assert.equal(readAppVersion(["electron"]), "");
  assert.equal(readAppVersion(["--readflow-app-version=%broken"]), "");
});
