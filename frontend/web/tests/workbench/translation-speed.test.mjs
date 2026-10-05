import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { translationCacheKey } from "../../src/features/reader-assistance/domain/assistance.js";
import { fallbackMessages } from "../../src/features/paper-blocks/domain/status.js";
import { parseWorkbenchPrefs } from "../../src/features/workbench/domain/preferences.js";
import { DEFAULT_PREFS, createWorkbenchStore, prefsOf } from "../../src/features/workbench/domain/workbench-store.js";

test("speed preferences are safe, persistent and excluded from selection translation cache identity", () => {
  assert.equal(DEFAULT_PREFS.translationDisableThinking, true);
  const store = createWorkbenchStore();
  store.actions.patch({ translationDisableThinking: false });
  assert.equal(parseWorkbenchPrefs(JSON.stringify(prefsOf(store.getSnapshot()))).translationDisableThinking, false);
  assert.equal(parseWorkbenchPrefs('{"translationDisableThinking":"false"}').translationDisableThinking, undefined);
  const config = { base_url: "https://api.deepseek.com/v1", model: "offline" };
  assert.equal(translationCacheKey("source", config), translationCacheKey("source", {
    ...config, disable_thinking: false, workers: 16,
  }));
});

test("unsupported speed parameter is a compatibility notice, not a translation failure", () => {
  const messages = fallbackMessages(null, { id: "job", notices: ["thinking_unsupported"] });
  assert.deepEqual(messages.map((value) => value.kind), ["thinking"]);
  assert.match(messages[0].text, /自动兼容重试/);
});

test("credential defaults use 8/4, preserve explicit concurrency and clamp old values to 16", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://fixture.test" });
  const before = new Map();
  for (const key of ["window", "document", "localStorage", "CustomEvent"]) {
    before.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  }
  try {
    const { createHeadlessTranslationSettings } = await import("@/features/credentials/domain.js");
    for (const [provider, saved, expected] of [
      ["deepseek", {}, "8"], ["custom", {}, "4"], ["deepseek", { workers: 5 }, "5"],
      ["deepseek", { workers: 50 }, "16"],
      ["deepseek", { translationProfiles: { deepseek: { workers: 7, apiKey: "fixture-only" } } }, "7"],
    ]) {
      const developer = { translationProvider: provider, baseUrl: provider === "deepseek"
        ? "https://api.deepseek.com/v1" : "http://fixture.invalid/v1", model: "offline", ...saved };
      const settings = createHeadlessTranslationSettings({
        load: async () => ({ browser: { modelApiKey: "fixture-only" }, developer }),
        readDeveloper: () => developer,
      });
      assert.equal((await settings.load()).workers, expected);
    }
  } finally {
    for (const [key, descriptor] of before) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  }
});
