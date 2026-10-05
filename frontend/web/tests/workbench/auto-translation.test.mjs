import test from "node:test";
import assert from "node:assert/strict";
import { createAutoTranslation } from "../../src/features/workbench/state/auto-translation.js";
import { createWorkbenchStore, prefsOf } from "../../src/features/workbench/domain/workbench-store.js";
import { parseWorkbenchPrefs } from "../../src/features/workbench/domain/preferences.js";

function fixture() {
  const store = createWorkbenchStore();
  const calls = [], notices = [];
  let status = { jobs: [] }, list = [];
  const client = {
    status: async () => status,
    start: async (body) => { calls.push(body); status = { jobs: [{ id: "job", status: "running", percent: 20 }] }; return status.jobs[0]; },
    cancel: async (id) => { calls.push({ cancel: id }); status = { jobs: [] }; },
  };
  const api = { list: async () => ({ items: list }), row: async (id) => ({ id, title: "Synthetic", attachment_id: id }) };
  const config = async () => ({ draft: { apiKey: "synthetic-private", baseUrl: "http://127.0.0.1:9/v1", model: "fake", workers: "2" }, saved: {} });
  const auto = createAutoTranslation({ store, api, config, client: () => client, now: () => 100000,
    notify: (text) => notices.push(text) });
  return { store, calls, auto, client, notices, rows: (value) => { list = value; } };
}

test("automatic translation is opt-in, idle-only, excludes duplicate imports and persists only preferences", async () => {
  const f = fixture();
  assert.equal(f.store.getSnapshot().autoTranslateImports, false);
  f.auto.enqueue("a"); await f.auto.tick(); assert.equal(f.calls.length, 0);
  f.store.actions.patch({ autoTranslateImports: true });
  f.auto.enqueue("a"); f.auto.enqueue("a");
  await f.auto.tick(false); assert.equal(f.calls.length, 0);
  await f.auto.tick(true); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].attachment_id, "a");
  assert.equal(f.calls[0].density, "balanced");
  await f.auto.cancel(); assert.deepEqual(f.calls.at(-1), { cancel: "job" });
  f.auto.enqueue("a"); await f.auto.tick(); assert.equal(f.calls.length, 2);
  const saved = prefsOf(f.store.getSnapshot());
  assert.equal(saved.autoTranslateImports, true);
  assert.equal(saved.autoTranslation, undefined);
  assert.equal(parseWorkbenchPrefs(JSON.stringify(saved)).autoTranslateImports, true);
});
test("automatic discovery ignores older library data and never resubmits existing translations", async () => {
  const f = fixture(); f.store.actions.patch({ autoTranslateImports: true });
  f.rows([{ id: "old", attachment_id: "pdf", created_at: new Date(90000).toISOString() },
    { id: "new", attachment_id: "pdf", created_at: new Date(100001).toISOString() }]);
  await f.auto.tick(); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].attachment_id, "new");
  await f.auto.cancel();
  f.client.status = async () => ({ jobs: [], has_translation: true });
  f.auto.enqueue("translated"); await f.auto.tick(); assert.equal(f.calls.length, 2);
});
test("cancel while submission is pending cancels the returned job instead of leaving it unowned", async () => {
  const f = fixture(); f.store.actions.patch({ autoTranslateImports: true });
  let resolve;
  f.client.start = () => new Promise((r) => { resolve = r; });
  f.auto.enqueue("a"); const pending = f.auto.tick();
  for (let i = 0; i < 10 && !resolve; i++) await Promise.resolve();
  assert.ok(resolve);
  await f.auto.cancel(); resolve({ id: "late-job" }); await pending;
  assert.deepEqual(f.calls, [{ cancel: "late-job" }]);
  assert.equal(f.store.getSnapshot().autoTranslation.running, false);
});
