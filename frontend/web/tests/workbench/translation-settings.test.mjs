import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Only human-readable dummy values in this isolated, in-memory browser/desktop bridge.
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://settings.test/workbench.html" });
const previous = new Map();
for (const key of ["window", "document", "localStorage", "CustomEvent"]) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
}
let snapshot = { firstRunCompleted: true, browserConfig: { ocrProvider: "local", modelApiKey: "演示凭据" }, developerConfig: { translationProvider: "custom", baseUrl: "https://model.example.test/v1", model: "demo-model", workers: 3, mathMode: "direct_typst", glossaryId: "existing" }, runtimeConfig: {} };
let ipcSaves = 0, probes = 0;
window.retainPdfDesktop = { invoke: async () => null, loadDesktopConfig: async () => structuredClone(snapshot), saveDesktopConfig: async (value) => { ipcSaves++; snapshot = { ...snapshot, ...value, browserConfig: { ...snapshot.browserConfig, ocrProvider: value.ocrProvider, modelApiKey: value.modelApiKey, translationCredentialRef: value.translationCredentialRef } }; return structuredClone(snapshot); } };
const { createHeadlessTranslationSettings } = await import("@/features/credentials/domain.js");
const { loadBrowserStoredConfig, loadDeveloperStoredConfig, savePersistedDeveloperStoredConfig } = await import("@/platform/config/persisted-config.js");
const { defaultCredentialsStatePort } = await import("@/features/credentials/domain.js");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected network request in offline settings test"); };
test.after(() => { globalThis.fetch = originalFetch; for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } dom.window.close(); });
const port = createHeadlessTranslationSettings({ validate: async () => { probes++; return { ok: true, summary: "检测通过" }; } });

test("translation reads legacy persisted configuration without triggering a probe", async () => {
  const draft = await port.load();
  assert.equal(draft.provider, "custom"); assert.equal(draft.model, "demo-model"); assert.equal(draft.workers, "3");
  assert.equal(probes, 0); assert.equal(ipcSaves, 0);
});

test("save reuses shared credential/developer persistence, desktop IPC and registered state port", async () => {
  const draft = { ...port.read(), apiKey: "演示凭据", model: "updated-model", workers: "4" };
  await savePersistedDeveloperStoredConfig({ ...loadDeveloperStoredConfig(), glossaryId: "changed-elsewhere" });
  const before = ipcSaves;
  const result = await port.save(draft);
  assert.equal(result.tone, "valid");
  assert.equal(loadBrowserStoredConfig().modelApiKey === draft.apiKey, true);
  assert.equal(defaultCredentialsStatePort.getCredentials().modelApiKey === draft.apiKey, true);
  const options = loadDeveloperStoredConfig();
  assert.equal(options.model, "updated-model"); assert.equal(options.workers, 4);
  assert.equal(options.glossaryId, "changed-elsewhere");
  assert.equal(options.translationProfiles.custom.apiKey === draft.apiKey, true);
  assert.ok(ipcSaves >= before + 2, "both legacy snapshots are awaited");
  assert.equal(probes, 0, "saving never tests a model");
});

test("validation is explicit and sends one connectivity probe", async () => {
  const result = await port.detect(port.read());
  assert.equal(result.tone, "valid"); assert.equal(probes, 1);
  await port.load(); assert.equal(probes, 1);
});

test("provider switching keeps separate profiles and empty-key save retains the current key", async () => {
  const original = port.read();
  const other = port.switchProvider("deepseek", original);
  assert.equal(other.apiKey.length, 0);
  const back = port.switchProvider("custom", other);
  assert.equal(back.apiKey === original.apiKey, true);
  const result = await port.save({ ...back, apiKey: "" });
  assert.equal(result.tone, "valid");
  assert.equal(loadBrowserStoredConfig().modelApiKey === original.apiKey, true);
});

test("invalid form prevents persistence/probes and response messages redact credential values", async () => {
  const before = ipcSaves;
  const invalid = await port.save({ ...port.read(), workers: "0" });
  assert.equal(invalid.tone, "error"); assert.equal(ipcSaves, before);
  const redacted = createHeadlessTranslationSettings({ validate: async () => ({ ok: false, summary: "不可用：演示凭据" }) });
  const draft = await redacted.load();
  const result = await redacted.detect({ ...draft, apiKey: "演示凭据" });
  assert.equal(result.message.includes("演示凭据"), false);
});
