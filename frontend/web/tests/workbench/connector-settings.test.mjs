import assert from "node:assert/strict";
import test from "node:test";
import { connectorConnection, connectorPreferences, connectorStatusText } from "@/features/workbench/domain/connector.js";
import { createSettingsConnector } from "@/features/workbench/state/settings-connector.js";

test("Connector displays all public statuses and actual custom ports", () => {
  assert.equal(connectorStatusText(connectorConnection({ status: "listening", port: 23119 })), "正在接收 · 127.0.0.1:23119");
  assert.equal(connectorStatusText(connectorConnection({ status: "listening", port: 23219 })), "正在接收 · 127.0.0.1:23219");
  assert.equal(connectorStatusText(connectorConnection({ status: "busy", port: 23119 })), "端口已被占用（Zotero 可能正在运行），未启用");
  assert.equal(connectorStatusText(connectorConnection({ status: "disabled" })), "已关闭");
  assert.equal(connectorStatusText(connectorConnection({ status: "error", message: "无法绑定端口。" })), "出错：无法绑定端口。");
});

test("old service statuses remain readable and invalid payloads cannot claim listening", () => {
  assert.equal(connectorConnection({ status: "experimental", port: 23119 }).status, "listening");
  assert.equal(connectorConnection({ status: "coexist", port: 23119 }).status, "busy");
  assert.equal(connectorConnection({ status: "unsupported" }).status, "error");
  for (const value of [null, {}, { status: "unknown" }, { status: "listening" }, { status: "listening", port: "23119" }, { status: "listening", port: 90000 }]) {
    assert.equal(connectorConnection(value).status, "error");
  }
});

test("browser settings read status without offering preference writes or restart", async () => {
  let reads = 0;
  const service = createSettingsConnector({ bridge: () => null, readStatus: async () => { reads++; return { status: "listening", port: 23119 }; } });
  assert.equal(service.desktop(), false);
  const result = await service.load();
  assert.equal(result.preferences, null); assert.equal(result.connection.status, "listening"); assert.equal(reads, 1);
  await assert.rejects(service.save(false), /桌面版/); await assert.rejects(service.restart(), /桌面版/);
});

test("desktop switch persists through its targeted bridge without changing the live connection", async () => {
  const calls = [];
  let enabled = true;
  const preferences = () => ({ enabled, overridden: false, effectivePort: 23119, restartRequired: !enabled });
  const service = createSettingsConnector({ readStatus: async () => ({ status: "listening", port: 23119 }), bridge: () => ({
    loadConnectorSettings: async () => preferences(),
    saveConnectorSettings: async value => { calls.push(["save", value]); enabled = value; return preferences(); },
    restartReadFlow: async () => { calls.push(["restart"]); },
  }) });
  assert.equal(service.desktop(), true);
  await service.load(); assert.deepEqual(calls, []);
  const saved = await service.save(false);
  assert.equal(saved.restartRequired, true);
  const reopened = await service.load();
  assert.equal(reopened.preferences.enabled, false);
  assert.equal(reopened.connection.status, "listening");
  assert.deepEqual(calls, [["save", false]]);
  await service.restart(); assert.deepEqual(calls, [["save", false], ["restart"]]);
});

test("connection or preference read failures preserve the independently available half", async () => {
  const bridge = { loadConnectorSettings: async () => ({ enabled: true }), saveConnectorSettings: async () => ({}), restartReadFlow: async () => {} };
  const offline = createSettingsConnector({ bridge: () => bridge, readStatus: async () => { throw new Error("fixture network failure"); } });
  const result = await offline.load();
  assert.equal(result.connection.status, "error"); assert.equal(result.preferences.enabled, true);
  const brokenPrefs = createSettingsConnector({ bridge: () => ({ ...bridge, loadConnectorSettings: async () => { throw new Error("fixture storage failure"); } }), readStatus: async () => ({ status: "busy", port: 23119, occupant: "Zotero" }) });
  const next = await brokenPrefs.load();
  assert.equal(next.connection.occupant, "Zotero"); assert.equal(next.preferences, null); assert.match(next.preferenceError, /重试/);
});

test("preferences retain restart and environment override flags without accepting non-booleans", () => {
  assert.deepEqual(connectorPreferences({ enabled: false, overridden: true, effectivePort: 23219, restartRequired: true }), { enabled: false, overridden: true, effectivePort: 23219, restartRequired: true });
  for (const value of [null, {}, { enabled: "false" }, { enabled: 0 }]) assert.throws(() => connectorPreferences(value), /读取失败/);
});
