import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

// Only synthetic data, in a fresh temporary directory; never load the user's desktop config.
const dir = await mkdtemp(join(tmpdir(), "readflow-runtime-test-"));
const { createDesktopConfigStore } = createRequire(import.meta.url)("../../../desktop/src/main/desktop-config.js");
const desktop = createDesktopConfigStore({ getPath: () => dir }, { resolveCredentialSecret: () => { throw new Error("Unexpected credential lookup"); } });
desktop.saveDesktopConfig({ modelApiKey: "演示凭据", baseUrl: "https://api.deepseek.com/v1", model: "gateway-demo-model", developerConfig: {} });
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://runtime.test/workbench.html" });
const previous = new Map();
for (const key of ["window", "document", "localStorage", "CustomEvent"]) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
}
window.__FRONT_RUNTIME_CONFIG__ = desktop.buildDesktopRuntimeConfig(desktop.loadDesktopConfig());
let saves = 0, desktopFailure = false;
window.retainPdfDesktop = { invoke: async () => null,
  loadDesktopConfig: async () => desktop.buildDesktopConfigResponse(desktop.loadDesktopConfig()),
  saveDesktopConfig: async (payload) => { if (desktopFailure) throw new Error("Synthetic disk failure"); saves++; return desktop.buildDesktopConfigResponse(desktop.saveDesktopConfig(payload)); },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected network request"); };
const { createHeadlessTranslationSettings } = await import("@/features/credentials/domain.js");
const { defaultModelApiKey, defaultModelBaseUrl, defaultModelName, setRuntimeConfig } = await import("@/platform/config/runtime.js");
const { loadBrowserStoredConfig, loadDeveloperStoredConfig } = await import("@/platform/config/persisted-config.js");
test.after(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; }
  dom.window.close(); await rm(dir, { recursive: true, force: true });
});

function sameVisibleConfig(actual, expected) {
  const visible = ({ apiKey, ...fields }) => ({ ...fields, hasKey: Boolean(apiKey) });
  assert.deepEqual(visible(actual), visible(expected));
  assert.equal(actual.apiKey === expected.apiKey, true, "credential equality without printing its content");
}

test("runtime injection with empty browser storage reads the effective desktop configuration", async () => {
  assert.equal(localStorage.length, 0);
  const port = createHeadlessTranslationSettings();
  const actual = await port.load();
  assert.equal(actual.provider, "deepseek"); assert.equal(actual.baseUrl, defaultModelBaseUrl());
  assert.equal(actual.model, "gateway-demo-model"); assert.equal(actual.apiKey.length > 0, true);
  assert.equal(saves, 0);
});
test("runtime-only and unconfigured browser values use the shared default functions", async () => {
  for (const configured of [true, false]) {
    window.__FRONT_RUNTIME_CONFIG__ = { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-flash", modelApiKey: configured ? "演示凭据" : "" };
    setRuntimeConfig(window.__FRONT_RUNTIME_CONFIG__);
    const port = createHeadlessTranslationSettings({ load: async () => ({ browser: {}, developer: {} }), readDeveloper: () => ({}) });
    const actual = await port.load();
    assert.equal(actual.provider, "deepseek"); assert.equal(Boolean(actual.apiKey), configured);
    assert.equal(actual.baseUrl, defaultModelBaseUrl()); assert.equal(actual.model, defaultModelName());
  }
});
test("saved provider profiles take the same priority over runtime defaults from shared profiles", async () => {
  const browser = { modelApiKey: "演示凭据" };
  const developer = { translationProvider: "custom", baseUrl: "https://unused.example.test", model: "unused-model", workers: 12,
    translationProfiles: { custom: { apiKey: "演示服务凭据", baseUrl: "https://profile.example.test/v1", model: "profile-model", workers: 7 } } };
  const port = createHeadlessTranslationSettings({ load: async () => ({ browser, developer }), readDeveloper: () => developer });
  const actual = await port.load();
  assert.equal(actual.apiKey === developer.translationProfiles.custom.apiKey, true);
  assert.equal(actual.baseUrl, "https://profile.example.test/v1"); assert.equal(actual.model, "profile-model"); assert.equal(actual.workers, "7");
});
test("save reaches desktop persistence and changes the source of the next gateway injection", async () => {
  const port = createHeadlessTranslationSettings();
  const initial = await port.load();
  const draft = { ...initial, model: "saved-desktop-model", workers: "8", apiKey: "更新后的演示凭据" };
  const before = saves;
  const result = await port.save(draft); assert.equal(result.tone, "valid"); assert.equal(saves, before + 2);
  const injected = desktop.buildDesktopRuntimeConfig(desktop.loadDesktopConfig());
  assert.equal(injected.model, draft.model); assert.equal(injected.baseUrl, draft.baseUrl);
  assert.equal(injected.developerConfig.workers, 8); assert.equal(injected.modelApiKey === draft.apiKey, true);
  const reopened = await createHeadlessTranslationSettings().load();
});
test("desktop persistence failure cannot be reported as a successful save", async () => {
  const port = createHeadlessTranslationSettings(); const draft = await port.load();
  desktopFailure = true;
  try { assert.equal((await port.save(draft)).tone, "error"); }
  finally { desktopFailure = false; }
});
