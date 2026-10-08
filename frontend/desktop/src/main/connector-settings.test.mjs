import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createConnectorSettings, resolveConnectorPort } from "./connector-settings.js";
import { createDesktopConfigStore } from "./desktop-config.js";
import { installDesktopShutdown } from "./desktop-shutdown.js";

test("Connector defaults on, explicit environment (including empty) overrides saved preference", () => {
  assert.deepEqual(resolveConnectorPort({}), { port: 23119, overridden: false });
  assert.equal(resolveConnectorPort({ zoteroConnector: { enabled: false } }).port, null);
  for (const enabled of [true, false]) {
    assert.deepEqual(resolveConnectorPort({ zoteroConnector: { enabled } }, { RETAIN_PDF_RESEARCH_CONNECTOR_PORT: "23219" }), { port: 23219, overridden: true });
    assert.deepEqual(resolveConnectorPort({ zoteroConnector: { enabled } }, { RETAIN_PDF_RESEARCH_CONNECTOR_PORT: "" }), { port: null, overridden: true });
  }
  for (const value of ["0", "65536", "broken", "1e4"]) {
    const result = resolveConnectorPort({}, { RETAIN_PDF_RESEARCH_CONNECTOR_PORT: value });
    assert.equal(result.port, null); assert.ok(result.message);
  }
});

function setup(options = {}) {
  let config = { zoteroConnector: { enabled: true } };
  const calls = [];
  const service = createConnectorSettings({ app: {}, env: {},
    loadDesktopConfig: () => config,
    saveDesktopConfig: (patch) => { calls.push(patch); config = { ...config, ...patch }; return config; },
    canConnectToPort: async (...args) => { calls.push(args); return false; },
    getPortOccupant: async () => { throw new Error("No occupant lookup on a free port"); }, ...options,
  });
  return { service, calls };
}

test("busy port is skipped without reclaiming or signalling even a known backend image", async () => {
  for (const image of ["zotero", "rust_api", "readflow"]) {
    const { service } = setup({ canConnectToPort: async (host, port) => { assert.equal(host, "127.0.0.1"); assert.equal(port, 23119); return true; },
      getPortOccupant: async () => ({ image, pid: "1234" }) });
    const plan = await service.prepare();
    assert.equal(plan.connectorPort, null);
    assert.deepEqual(plan.connectorState, { status: "busy", port: 23119, occupant: `${image}（PID 1234）` });
    assert.equal(service.preferences().restartRequired, false);
  }
});

test("unknown occupant and failed probe remain visible without blocking library startup", async () => {
  const { service } = setup({ canConnectToPort: async () => true, getPortOccupant: async () => { throw new Error("fixture denied"); } });
  assert.deepEqual((await service.prepare()).connectorState, { status: "busy", port: 23119, occupant: null });
  const { service: failed } = setup({ canConnectToPort: async () => { throw new Error("fixture failed"); } });
  const plan = await failed.prepare();
  assert.equal(plan.connectorPort, null); assert.equal(plan.connectorState.status, "error");
});

test("disabled and invalid configuration never probes a port; free ports are handed to Python", async () => {
  for (const value of ["", "invalid"]) {
    const { service, calls } = setup({ env: { RETAIN_PDF_RESEARCH_CONNECTOR_PORT: value } });
    const plan = await service.prepare();
    assert.equal(plan.connectorPort, null); assert.deepEqual(calls, []);
    assert.equal(plan.connectorState.status, value ? "error" : "disabled");
  }
  const { service, calls } = setup();
  assert.equal((await service.prepare()).connectorPort, 23119);
  assert.deepEqual(calls, [["127.0.0.1", 23119]]);
});

test("saved preference persists in the existing store and unrelated saves preserve it", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-connector-settings-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = { getPath: () => root };
  const store = createDesktopConfigStore(app);
  assert.deepEqual(store.createDefaultDesktopConfig().zoteroConnector, { enabled: true });
  // An existing 0.9.0 configuration has no Connector property.
  fs.writeFileSync(store.resolveDesktopConfigPath(), JSON.stringify({ model: "fixture-model" }));
  assert.equal(store.loadDesktopConfig().zoteroConnector.enabled, true);
  const service = createConnectorSettings({ ...store, app, env: {}, canConnectToPort: async () => false });
  await service.prepare();
  assert.equal(service.save(false).restartRequired, true);
  assert.equal(service.preferences().enabled, false);
  store.saveDesktopConfig({ model: "new-fixture-model" });
  const reopened = createDesktopConfigStore(app).loadDesktopConfig();
  assert.equal(reopened.zoteroConnector.enabled, false);
  assert.equal(reopened.model, "new-fixture-model");
  assert.equal(service.save(true).restartRequired, false);
  assert.throws(() => service.save("false"), /布尔值/);
  assert.deepEqual(Object.keys(service.preferences()).sort(), ["effectivePort", "enabled", "overridden", "restartRequired"]);
});

test("restart schedules one relaunch and waits for the existing ordered cleanup before exiting", async () => {
  const app = new EventEmitter(), processEvents = new EventEmitter(), events = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  app.relaunch = () => events.push("relaunch");
  app.quit = () => {
    let prevented = false;
    app.emit("before-quit", { preventDefault() { prevented = true; } });
    if (!prevented) { events.push("exit"); app.emit("will-quit"); }
  };
  const shutdown = installDesktopShutdown({ app, processEvents, markStopping: () => events.push("stopping"),
    cleanup: async () => { events.push("cleanup"); await gate; events.push("children-stopped"); } });
  const { service } = setup({ app });
  service.restart(); service.restart();
  await Promise.resolve();
  assert.deepEqual(events, ["relaunch", "stopping", "cleanup"]);
  release(); await shutdown.requestShutdown();
  assert.deepEqual(events, ["relaunch", "stopping", "cleanup", "children-stopped", "exit"]);
});

test("preload exposes targeted Connector, restart and fullscreen commands", async () => {
  const preload = new URL("../../preload.js", import.meta.url);
  const require = createRequire(preload), calls = [], exposed = {};
  vm.runInNewContext(fs.readFileSync(preload, "utf8"), {
    __dirname: path.dirname(preload.pathname), process: { platform: "linux", argv: [] }, window: { addEventListener() {} },
    require: name => name === "electron" ? { contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value; } },
      ipcRenderer: { invoke: async (...args) => { calls.push(JSON.parse(JSON.stringify(args))); } } } : require(name),
  });
  const bridge = exposed.retainPdfDesktop;
  await bridge.loadConnectorSettings(); await bridge.saveConnectorSettings(false); await bridge.restartReadFlow();
  await bridge.setFullScreen(true);
  assert.deepEqual(calls, [["desktop:invoke", "load_connector_settings"], ["desktop:invoke", "save_connector_settings", { enabled: false }], ["desktop:invoke", "restart_readflow"], ["desktop:invoke", "set_fullscreen", { enabled: true }]]);
});
