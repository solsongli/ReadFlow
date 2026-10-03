import test from "node:test";
import assert from "node:assert/strict";
import { mergeReaderRow } from "@/features/workbench/domain/reader-state.js";
import { createWorkbenchStore } from "@/features/workbench/domain/workbench-store.js";
import { createReaderSync } from "@/features/workbench/state/reader-sync.js";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const row = { id: ID, title: "Paper", read_status: "unread", read_page: null, read_pages: null, last_opened_at: null, notes_count: 0, annotations_count: 0, group_ids: [], translation: { status: "none" } };
function prepared() {
  const store = createWorkbenchStore();
  store.actions.listLoaded({ items: [row, { ...row, id: OTHER }], total: 2, counts: { all: 2, unread: 2, recent: 0, notes: 0 }, groups: [], tags: [] });
  store.actions.deskLoaded({ total: 2, continue_reading: [], to_read: [row], recent_items: [row], recent_annotations: [], recent_notes: [], attention: { missing_doi: [], needs_ocr: [], untranslated_titles: [] }, today: { opened: 0, notes: 0, annotations: 0 }, counts: { total: 2, translated: 0, notes: 0, annotations: 0, groups: 0 } });
  store.actions.openTab({ id: `reader:${ID}`, itemId: ID, title: row.title, status: "ready", row });
  return store;
}

test("incremental row update retains query, selection, order and sibling identity", () => {
  const store = prepared();
  store.actions.patch({ query: "Paper", selectedIds: [ID], anchorId: ID });
  const state = store.getSnapshot();
  const updated = { ...row, read_status: "reading", read_page: 25, read_pages: 32, last_opened_at: new Date(2026, 9, 2, 12).toISOString() };
  const patch = mergeReaderRow(state, updated, new Date(2026, 9, 2, 14));
  assert.equal(patch.list.result.items[1], state.list.result.items[1]);
  assert.equal(patch.list.result.counts.unread, 1);
  assert.equal(patch.desk.data.continue_reading[0].read_page, 25);
  assert.equal(patch.desk.data.to_read.length, 0);
  assert.equal(patch.desk.data.today.opened, 1);
  store.actions.patch(patch);
  assert.equal(store.getSnapshot().query, "Paper");
  assert.deepEqual(store.getSnapshot().selectedIds, [ID]);
  assert.equal(mergeReaderRow(store.getSnapshot(), updated, new Date(2026, 9, 2, 14)).desk.data.today.opened, 1);
});

test("progress writes serialize and coalesce; no list refresh is made", async () => {
  const store = prepared();
  const releases = [], calls = [];
  const sync = createReaderSync({ store, api: { markOpened: (id, value) => { calls.push(value); return new Promise((resolve) => releases.push(() => resolve({ ...row, read_status: "reading", read_page: value.page, read_pages: value.pages }))); }, list: () => assert.fail("No full list refresh") }, notify: () => {}, loadDetail: async () => {}, refreshDesk: async () => assert.fail("No desk refresh per page") });
  const send = (page) => sync.progress({ type: "readflow:reader-progress", itemId: ID, page, pages: 50 });
  const pending = send(10);
  void send(11); void send(12);
  assert.deepEqual(calls, [{ page: 10, pages: 50 }]);
  releases.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [{ page: 10, pages: 50 }, { page: 12, pages: 50 }]);
  releases.shift()(); await pending;
  assert.equal(store.getSnapshot().list.result.items[0].read_page, 12);
});

test("notes refresh only its row and selected detail, retaining newer progress", async () => {
  const store = prepared();
  store.actions.patch({ selectedIds: [ID] });
  store.actions.patch(mergeReaderRow(store.getSnapshot(), { ...row, read_page: 20, read_pages: 50 }));
  const calls = [];
  const sync = createReaderSync({ store, api: { row: async (id) => { calls.push(["row", id]); return { ...row, read_page: 2, notes_count: 4, annotations_count: 3 }; }, list: () => assert.fail("No full list refresh") }, notify: () => {}, loadDetail: async (id) => calls.push(["detail", id]), refreshDesk: async () => calls.push(["desk"]) });
  await sync.notesChanged(ID);
  assert.equal(store.getSnapshot().list.result.items[0].notes_count, 4);
  assert.equal(store.getSnapshot().list.result.items[0].read_page, 20);
  assert.deepEqual(calls, [["row", ID], ["detail", ID], ["desk"]]);
  store.actions.patch({ selectedIds: [OTHER] }); calls.splice(0);
  await sync.notesChanged(ID);
  assert.deepEqual(calls, [["row", ID], ["desk"]]);
});

test("an older progress response cannot revert fresh local star or note counts", async () => {
  const store = prepared();
  const state = store.getSnapshot();
  store.actions.patch({ list: { ...state.list, result: { ...state.list.result, items: [{ ...row, starred: true, notes_count: 5, annotations_count: 2 }, state.list.result.items[1]] } } });
  const sync = createReaderSync({ store, api: { markOpened: async () => ({ ...row, starred: false, read_page: 4, read_pages: 8, read_status: "reading" }) }, notify: () => {}, loadDetail: async () => {}, refreshDesk: async () => {} });
  await sync.progress({ type: "readflow:reader-progress", itemId: ID, page: 4, pages: 8 });
  const result = store.getSnapshot().list.result.items[0];
  assert.equal(result.starred, true);
  assert.equal(result.notes_count, 5);
  assert.equal(result.read_page, 4);
});
