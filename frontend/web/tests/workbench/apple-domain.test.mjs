import test from "node:test";
import assert from "node:assert/strict";
import { backgroundProgress, inspectorAuthors, inspectorStatus, progressPercent, rowMetadata, sectionsOf, SORT_OPTIONS, sortLabel, translationLabel } from "@/features/workbench/domain/presentation.js";
import { payloadOf } from "@/features/workbench/domain/import.js";
import { createWorkbenchStore, initialWorkbenchState, prefsOf, workbenchActions } from "@/features/workbench/domain/workbench-store.js";
import { createWorkbench } from "@/features/workbench/state/controller.js";

const row = { id: "a", authors: ["Ada Lovelace", "Alan Turing"], venue_short: "CoRL", year: "2025", title: "Paper", translation: { status: "done" }, notes_count: 3, attachment_count: 1, page_count: 32, group_ids: ["parent", "child", "other"] };
const groups = [
  { id: "parent", parent_id: null, name: "A", count: 1, direct_count: 1 },
  { id: "child", parent_id: "parent", name: "B", count: 1, direct_count: 1 },
  { id: "other", parent_id: null, name: "C", count: 1, direct_count: 1 },
];

test("Mail metadata omits absent fields; compact only contains authors and year", () => {
  assert.equal(rowMetadata(row), "Lovelace 等 · CoRL · 2025");
  assert.equal(rowMetadata(row, true), "Lovelace 等 · 2025");
  assert.equal(rowMetadata({ authors: [], venue_short: "", year: "" }), "");
  assert.equal(rowMetadata({ authors: [], venue_short: "Nature", year: "" }), "Nature");
});

test("inspector authors retain up to three names and the total", () => {
  assert.equal(inspectorAuthors([]), "作者未知");
  assert.equal(inspectorAuthors(["A", "B", "C"]), "A, B, C");
  assert.equal(inspectorAuthors(["A", "B", "C", "D"]), "A, B, C 等 4 人");
});

test("translation labels preserve pending, failed and unknown states without false claims", () => {
  assert.equal(translationLabel({ status: "none" }), "");
  assert.equal(translationLabel({ status: "none" }, true), "未翻译");
  assert.equal(translationLabel({ status: "unknown" }, true), "译文状态未知");
  assert.equal(translationLabel({ status: "done" }), "已译");
  assert.equal(translationLabel({ status: "queued" }), "排队");
  assert.equal(translationLabel({ status: "failed" }), "失败");
  assert.equal(translationLabel({ status: "running", percent: 61.7 }), "翻译中 62%");
  assert.equal(translationLabel({ status: "running", percent: null }), "翻译中");
  assert.equal(progressPercent(Infinity), null);
  assert.equal(progressPercent(-1), 0);
  assert.equal(progressPercent(112), 100);
});

test("inspector summary handles missing pages and missing PDFs", () => {
  assert.equal(inspectorStatus(row), "PDF 32 页 · 已有中文译文 · 3 条笔记");
  assert.match(inspectorStatus({ ...row, page_count: null }), /^PDF 页数未知/);
  assert.match(inspectorStatus({ ...row, attachment_count: 0 }), /^无 PDF 附件/);
});

test("grouped sections repeat each direct membership, including selected parent", () => {
  const sections = sectionsOf([row], groups, null);
  assert.deepEqual(sections.map((s) => s.id), ["parent", "child", "other"]);
  assert.ok(sections.every((s) => s.rows[0].id === "a"));
  assert.deepEqual(sectionsOf([row], groups, "parent").map((s) => s.id), ["parent", "child"]);
  assert.equal(sections[1].label, "A › B");
  const ungrouped = sectionsOf([{ ...row, group_ids: ["missing"] }], groups, null);
  assert.equal(ungrouped[0].id, "__ungrouped");
});

test("toolbar progress hides idle work and ignores completed jobs", () => {
  assert.equal(backgroundProgress([], [row]), null);
  assert.equal(backgroundProgress([{ status: "completed" }], []), null);
  const result = backgroundProgress([{ status: "running", completed_pages: 5, total_pages: 10 }], []);
  assert.deepEqual(result, { title: "OCR 5/10 页", count: 1, percent: 50 });
});

test("toolbar progress deduplicates papers and keeps unknown progress indeterminate", () => {
  const active = { ...row, translation: { status: "running", percent: 80 } };
  const result = backgroundProgress([{ status: "queued", completed_pages: 0, total_pages: 10 }], [active, active]);
  assert.equal(result.count, 2);
  assert.equal(result.percent, 40);
  assert.match(result.title, /翻译中 80%/);
  assert.equal(backgroundProgress([{ status: "running", completed_pages: 0, total_pages: 0 }], []).percent, null);
});

test("sort menu exposes all five server sort keys and preserves legacy opened preference", () => {
  assert.deepEqual(SORT_OPTIONS.map((option) => option.value), ["added", "title", "year", "author", "venue"]);
  assert.equal(sortLabel("author"), "作者");
  assert.equal(sortLabel("opened"), "最近阅读");
});

test("sidebar collapsed preference migrates old preferences and persists with theme", () => {
  assert.equal(initialWorkbenchState({ theme: "dark" }).sidebarCollapsed, false);
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const wb = createWorkbench({ api: {}, storage });
  wb.setPrefs({ sidebarCollapsed: true, theme: "dark" });
  const next = createWorkbench({ api: {}, storage });
  assert.equal(next.store.getSnapshot().sidebarCollapsed, true);
  assert.equal(prefsOf(next.store.getSnapshot()).theme, "dark");
});

test("changing sort keeps current filter/query and selected IDs", async () => {
  const calls = [];
  const result = { items: [row], groups, total: 1, tags: [], counts: {} };
  const wb = createWorkbench({ api: { list: async (query) => { calls.push(query); return result; }, item: async () => row } });
  wb.store.actions.patch({ main: "library", groupId: "parent", tag: "方法", query: "Paper", selectedIds: ["a"] });
  wb.setPrefs({ sort: "author", order: "asc" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls[0].sort, "author");
  assert.equal(calls[0].order, "asc");
  assert.equal(calls[0].groupId, "parent");
  assert.equal(calls[0].tag, "方法");
  assert.equal(calls[0].query, "Paper");
  assert.deepEqual(wb.store.getSnapshot().selectedIds, ["a"]);
});

test("selection toggles and range still work; closing last reader returns to library", () => {
  const store = createWorkbenchStore();
  store.actions.listLoaded({ items: [row, { ...row, id: "b" }, { ...row, id: "c" }] });
  store.actions.select("a");
  store.actions.select("c", "range");
  assert.deepEqual(store.getSnapshot().selectedIds, ["a", "b", "c"]);
  store.actions.select("b", "toggle");
  assert.deepEqual(store.getSnapshot().selectedIds, ["a", "c"]);
  const state = workbenchActions.openTab(store.getSnapshot(), { id: "reader:a", itemId: "a" });
  assert.equal(workbenchActions.closeTab(state, "reader:a").activeTab, "library");
});

test("JSON import keeps CSL and Zotero formats with invalid-file feedback", () => {
  assert.equal(payloadOf('[{"title":"A"}]', "a.json").format, "csl-json");
  const zotero = payloadOf('{"items":[{"key":"K","data":{"title":"A"}}],"collections":[{"key":"G"}]}', "z.json");
  assert.equal(zotero.format, "zotero-api");
  assert.equal(zotero.collections.length, 1);
  assert.throws(() => payloadOf("{}", "a.json"), /文件里没有文献条目/);
  assert.throws(() => payloadOf("not json", "a.json"));
});

test("undo notifications are cloneable and run once for their own notice only", () => {
  const wb = createWorkbench({ api: {} });
  let restored = 0;
  wb.notify("已移到回收站", "info", () => { restored += 1; });
  const first = wb.store.getSnapshot().notice;
  assert.equal(structuredClone(first).canUndo, true);
  wb.undoNotice(first.id);
  wb.undoNotice(first.id);
  assert.equal(restored, 1);
  assert.equal(wb.store.getSnapshot().notice, null);
  wb.notify("第二条", "info", () => { restored += 1; });
  wb.undoNotice(first.id);
  assert.equal(restored, 1, "old toast cannot invoke a replacement's callback");
  const second = wb.store.getSnapshot().notice;
  wb.dismissNotice();
  wb.undoNotice(second.id);
  assert.equal(restored, 1);
});
