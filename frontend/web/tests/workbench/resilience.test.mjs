import test from "node:test";
import assert from "node:assert/strict";
import { createWorkbenchStore } from "../../src/features/workbench/domain/workbench-store.ts";
import { createServiceRecovery } from "../../src/features/workbench/state/service-recovery.ts";
import { isLibraryUnavailable, retryDelay, pdfFiles, dropDescription, workbenchTitle } from "../../src/features/workbench/domain/resilience.ts";
import { safeDiagnostics } from "../../src/features/workbench/domain/diagnostics.ts";
import { SHORTCUTS, shortcutKeys } from "../../src/features/workbench/domain/shortcuts.ts";

test("backoff is bounded and only service/network failures enter recovery", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 8].map(retryDelay), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  assert.equal(isLibraryUnavailable({ status: 503 }), true); assert.equal(isLibraryUnavailable(new TypeError("Failed to fetch")), true);
  assert.equal(isLibraryUnavailable({ status: 400 }), false); assert.equal(isLibraryUnavailable(new DOMException("Cancelled", "AbortError")), false);
});
test("recovery retries reads with fresh signals and clears itself only when failed endpoints recover", async () => {
  const store = createWorkbenchStore(); let down = true, scheduled, delay, recovered = 0;
  const raw = { list: async (_query, signal) => { assert.equal(signal?.aborted ?? false, false); if (down) throw { status: 503 }; return {}; } };
  const recovery = createServiceRecovery(raw, store, async () => { recovered++; }, { set: (fn, ms) => { scheduled = fn; delay = ms; return 1; }, clear: () => {} });
  const abort = new AbortController(); await assert.rejects(() => recovery.api.list({}, abort.signal)); abort.abort();
  assert.equal(store.getSnapshot().connection.unavailable, true); assert.equal(delay, 1000);
  await recovery.retry(); assert.equal(delay, 2000);
  down = false; await recovery.retry();
  assert.equal(store.getSnapshot().connection.unavailable, false); assert.equal(recovered, 1);
  recovery.dispose(); assert.equal(typeof scheduled, "function");
});
test("automatic service recovery never repeats a write operation", async () => {
  const store = createWorkbenchStore(); let writes = 0, probes = 0;
  const recovery = createServiceRecovery({ trash: async () => { writes++; throw { status: 502 }; }, list: async () => { probes++; return {}; } }, store, async () => {}, { set: () => 1, clear: () => {} });
  await assert.rejects(() => recovery.api.trash(["paper"])); await recovery.retry();
  assert.equal(writes, 1); assert.equal(probes, 1); assert.equal(store.getSnapshot().connection.unavailable, false); recovery.dispose();
});
test("diagnostics exclude arbitrary messages, document titles, secrets, paths and query strings", () => {
  const error = new Error("Private paper title 演示凭据 https://host.test/?token=private-value");
  const result = safeDiagnostics(error, "at ItemList (/home/person/private/path/file.tsx?secret=private-value:20:3)\nat PrivateDocumentTitle (/secret/location:2:8)");
  for (const value of ["Private paper", "演示凭据", "private-value", "/home", "PrivateDocumentTitle", "/secret"]) assert.equal(result.includes(value), false);
  assert.match(result, /错误名：Error/); assert.match(result, /at ItemList \(20:3\)/);
  assert.match(safeDiagnostics(new TypeError("Cannot read properties of undefined (reading 'private')"), ""), /missing value/);
});
test("file drops filter PDF candidates and browser titles track the active workspace", () => {
  assert.equal(pdfFiles([{ name: "a.PDF", type: "" }, { name: "b.txt", type: "text/plain" }]).length, 1);
  assert.equal(dropDescription([{ type: "application/pdf" }, { type: "application/pdf" }]), "松开以导入 2 个 PDF");
  assert.equal(dropDescription([{ name: "text.txt", type: "text/plain" }]), "仅支持 PDF 文件");
  assert.equal(workbenchTitle("library"), "文献库 — ReadFlow"); assert.equal(workbenchTitle("desk", "论文"), "论文 — ReadFlow");
});
test("shortcut definitions are shared and uniquely identify all five groups", () => {
  assert.equal(new Set(SHORTCUTS.map((entry) => entry.id)).size, SHORTCUTS.length);
  assert.deepEqual([...new Set(SHORTCUTS.map((entry) => entry.group))], ["通用", "文献库", "阅读", "复习", "画布", "笔记"]);
  assert.equal(shortcutKeys("shortcuts"), "Ctrl /"); assert.equal(shortcutKeys("settings"), "Ctrl ,");
});
