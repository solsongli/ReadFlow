import test from "node:test";
import assert from "node:assert/strict";
import { createWorkbench } from "@/features/workbench/state/controller.js";
import { formatStorageBytes, moduleSources, librarySettingsStats, safeSettingsMessage, agentSettingsReadError } from "@/features/workbench/domain/settings.js";
import { agentSettingsDraft, agentSettingsPayload, agentRestartPending, createHeadlessAgentSettings } from "@/features/credentials/domain.js";

test("settings navigation preserves reader/library return target and services are lazy", () => {
  let builds = 0;
  const wb = createWorkbench({ api: {}, createSettingsServices: () => { builds++; return {}; } });
  wb.store.actions.openTab({ id: "reader:paper", itemId: "paper" });
  wb.openSettings("translation");
  assert.equal(wb.store.getSnapshot().main, "settings");
  assert.equal(wb.store.getSnapshot().settingsSection, "translation");
  wb.openSettings("glossaries"); wb.closeSettings();
  assert.equal(wb.store.getSnapshot().activeTab, "reader:paper");
  assert.equal(builds, 0);
  assert.equal(wb.settingsServices(), wb.settingsServices());
  assert.equal(builds, 1);
  wb.openSettings(); wb.closeTab("reader:paper"); wb.closeSettings();
  assert.equal(wb.store.getSnapshot().activeTab, "library");
});

test("startup view and density round-trip through the existing preference storage", () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  const wb = createWorkbench({ api: {}, storage });
  wb.setPrefs({ startView: "library", density: "compact", theme: "dark" });
  const next = createWorkbench({ api: {}, storage }).store.getSnapshot();
  assert.equal(next.main, "library"); assert.equal(next.density, "compact"); assert.equal(next.theme, "dark");
});

test("module confirmation describes actual size and source origins without URL parameters", () => {
  assert.equal(formatStorageBytes(1024 ** 2 * 12), "12.0 MB");
  assert.equal(formatStorageBytes(0), "0 B");
  assert.equal(formatStorageBytes(-1), "未知");
  assert.deepEqual(moduleSources([{ url: "https://downloads.example.test/a?mirror=public" }, { url: "https://downloads.example.test/b" }]), ["https://downloads.example.test"]);
});

test("library settings count attachments and all note records without changing library state", () => {
  assert.deepEqual(librarySettingsStats([{ attachment_count: 2, notes_count: 3 }, { attachment_count: 1, notes_count: 0 }], 4), { papers: 2, attachments: 3, notes: 3, groups: 4 });
  assert.equal(safeSettingsMessage("响应含演示凭据", ["演示凭据"]), "响应含[已隐藏]");
});

const config = { configured_runtime: "python", active_runtime: "python_markdown", agent_confirmation_mode: "explicit", configured_revision: 7, active_revision: 7, restart_state: "active", restart_required: false, llm_base_url: "https://model.example.test/v1", llm_model: "demo", llm_api_key_configured: true, fx_gateway_api_key_configured: true, fx_gateway_base_url: "", fx_model: "" };
test("AI settings preserve all runtime modes, confirmation and revision semantics", () => {
  const draft = agentSettingsDraft(config);
  for (const mode of ["python", "openai", "fx"]) {
    const payload = agentSettingsPayload({ ...draft, mode, confirmation: "green_light", gatewayUrl: "http://127.0.0.1:9001", gatewayModel: "demo" }, config);
    assert.equal(payload.agent_runtime, mode); assert.equal(payload.expected_revision, 7); assert.equal(payload.agent_confirmation_mode, "green_light");
    assert.equal(Object.hasOwn(payload, "llm_api_key"), false, "empty fields preserve saved credentials");
    assert.equal(Object.hasOwn(payload, "fx_gateway_api_key"), false);
  }
  assert.equal(agentRestartPending(config), false);
  assert.equal(agentRestartPending({ ...config, active_revision: 6 }), true);
  assert.throws(() => agentSettingsPayload(draft, { ...config, llm_api_key_configured: false }), /配置/);
});

test("AI runtime adapter uses the existing endpoints only on explicit load/save", async () => {
  const calls = [];
  const service = createHeadlessAgentSettings({ read: async () => { calls.push("load"); return config; }, update: async (payload) => { calls.push(["save", payload.agent_runtime]); return config; }, announce: () => calls.push("changed") });
  assert.deepEqual(calls, []);
  await service.load(); await service.save(agentSettingsDraft(config), config);
  assert.deepEqual(calls, ["load", ["save", "python"], "changed"]);
});

test("AI read failures distinguish unreachable services from other failures without echoing response content", () => {
  const unavailable = "本地 AI 服务未运行。AI 伴读需要它在后台运行；正式版启动时会自动开启。";
  for (const failure of [new Error("Request failed (502)"), new Error("Request failed (503)"), { status: 503 }, new TypeError("Failed to fetch"), new TypeError("fetch failed"), new TypeError("Load failed"), { name: "NetworkError" }]) {
    assert.equal(agentSettingsReadError(failure), unavailable);
  }
  for (const failure of [new Error("Unauthorized (401)"), new SyntaxError("Invalid JSON"), new Error("Unexpected schema"), new TypeError("Invalid argument"), new Error("Contains 502 but is a different error (400)")]) {
    assert.equal(agentSettingsReadError(failure), "AI 运行时设置读取失败，请重试。");
  }
});
