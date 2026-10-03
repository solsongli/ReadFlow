import test from "node:test";
import assert from "node:assert/strict";
import { createNotesController } from "../../src/features/workbench/state/notes-controller.ts";
import { createWorkbenchStore } from "../../src/features/workbench/domain/workbench-store.ts";
import { editableNote, emptyNote } from "../../src/features/workbench/domain/notes.ts";
import { createReaderActions } from "../../src/features/workbench/state/reader-actions.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(overrides = {}) {
  const store = createWorkbenchStore();
  const one = { ...emptyNote({ id: "paper", title: "Paper" }, "one", new Date()), body: "Original" };
  const rows = [one, { ...one, id: "two", body: "Another" }];
  const changes = [], writes = [], notifications = [], timer = { run: null, ms: 0 };
  const api = {
    notes: async () => ({ items: structuredClone(rows), total: rows.length, counts: { total: rows.length, notes: rows.length, annotations: 0 } }),
    updateNote: async (id, body) => { writes.push([id, body]); const row = rows.find((row) => row.id === id); Object.assign(row, { body }); return structuredClone(row); },
    createNote: async (itemId, value) => { writes.push(["create", value.body]); const row = { ...one, id: "created", body: value.body }; rows.unshift(row); return structuredClone(row); },
    deleteNote: async (id) => { rows.splice(rows.findIndex((row) => row.id === id), 1); }, ...overrides,
  };
  const notes = createNotesController({ api, store, changed: async (id) => { changes.push(id); }, notify: (value) => notifications.push(value),
    timers: { set: (run, ms) => { timer.run = run; timer.ms = ms; return "timer"; }, clear: () => { timer.run = null; } } });
  store.actions.patch({ main: "notes", notes: { ...store.getSnapshot().notes, draft: editableNote(one) } });
  return { store, notes, rows, changes, writes, notifications, timer };
}
test("autosave waits 800ms and saves through body-only validated update", async () => {
  const f = fixture(); f.notes.edit("Updated");
  assert.equal(f.writes.length, 0); assert.equal(f.timer.ms, 800);
  f.timer.run(); await tick();
  assert.deepEqual(f.writes, [["one", "Updated"]]); assert.deepEqual(f.changes, ["paper"]);
  assert.equal(f.store.getSnapshot().notes.draft.status, "saved"); f.notes.dispose();
});
test("edits made during an in-flight save are serialized, never overwritten by the first response", async () => {
  let resolveFirst;
  const f = fixture({ updateNote: async (id, body) => {
    f.writes.push([id, body]);
    if (f.writes.length === 1) await new Promise((resolve) => { resolveFirst = resolve; });
    return { ...f.rows[0], body };
  } });
  f.notes.edit("First"); const saving = f.notes.flush();
  f.notes.edit("Second"); resolveFirst(); await saving;
  assert.deepEqual(f.writes, [["one", "First"], ["one", "Second"]]);
  assert.equal(f.store.getSnapshot().notes.draft.body, "Second");
  assert.equal(f.store.getSnapshot().notes.draft.savedBody, "Second"); f.notes.dispose();
});
test("switching notes and leaving a workspace wait for save, while failures preserve draft and selection", async () => {
  let fail = true;
  const f = fixture({ updateNote: async (id, body) => { if (fail) throw new Error("Offline"); return { ...f.rows[0], body }; } });
  f.notes.edit("Unsaved text");
  await f.notes.select(f.rows[1]);
  assert.equal(f.store.getSnapshot().notes.draft.note.id, "one");
  assert.equal(f.store.getSnapshot().notes.draft.body, "Unsaved text");
  let left = false; await f.notes.beforeLeave(() => { left = true; }); assert.equal(left, false);
  fail = false; await f.notes.beforeLeave(() => { left = true; }); assert.equal(left, true);
  assert.equal(f.store.getSnapshot().notes.draft.status, "saved"); f.notes.dispose();
});
test("new empty draft focuses a paper without a write; first content creates exactly one record", async () => {
  const f = fixture(); f.notes.createFor({ id: "paper", title: "Paper" }); await tick();
  assert.equal(f.writes.length, 0); assert.equal(f.store.getSnapshot().notes.draft.isNew, true);
  await f.notes.flush(); assert.equal(f.writes.length, 0);
  f.notes.edit("New body"); await f.notes.flush();
  assert.equal(f.writes.filter(([id]) => id === "create").length, 1);
  assert.equal(f.store.getSnapshot().notes.draft.note.id, "created");
  f.notes.edit("Edited new body"); await f.notes.flush();
  assert.deepEqual(f.writes.at(-1), ["created", "Edited new body"]); f.notes.dispose();
});
test("refresh caused by Reader edits keeps an unsaved draft and updates clean notes", async () => {
  const f = fixture(); f.notes.edit("Local draft"); f.rows[0].body = "External edit";
  await f.notes.refresh(); assert.equal(f.store.getSnapshot().notes.draft.body, "Local draft");
  await f.notes.flush(); f.rows[0].body = "Another external edit";
  await f.notes.refresh(); assert.equal(f.store.getSnapshot().notes.draft.body, "Another external edit"); f.notes.dispose();
});
test("new note outside the notes workspace does not reuse a hidden paper filter", async () => {
  const f = fixture(); f.notes.createFor({ id: "paper", title: "Paper" }); await tick();
  f.store.actions.patch({ main: "library" }); f.notes.create();
  assert.equal(f.store.getSnapshot().notes.itemId, null);
  assert.equal(f.store.getSnapshot().notes.pickerOpen, true);
  assert.equal(f.writes.length, 0); f.notes.dispose();
});
test("delete cancels the pending autosave so the removed record is not resurrected", async () => {
  const f = fixture(); f.notes.edit("Discarded"); await f.notes.remove();
  assert.equal(f.timer.run, null); assert.equal(f.writes.length, 0);
  assert.equal(f.rows.some((note) => note.id === "one"), false);
  assert.equal(f.store.getSnapshot().notes.draft.note.id, "two"); f.notes.dispose();
});
test("stale filter responses cannot replace a newer search", async () => {
  const resolvers = [];
  const f = fixture({ notes: (query) => new Promise((resolve) => resolvers.push({ query, resolve })) });
  f.notes.filters({ query: "first" }); f.notes.filters({ query: "second" });
  const response = (body) => ({ items: [{ ...f.rows[0], body }], total: 1, counts: { total: 1, notes: 1, annotations: 0 } });
  resolvers[1].resolve(response("Second result")); await tick();
  resolvers[0].resolve(response("Old result")); await tick();
  assert.equal(f.store.getSnapshot().notes.draft.body, "Second result"); f.notes.dispose();
});
test("annotation opening uses its own attachment and one-based resume page, including already open tabs", async () => {
  const store = createWorkbenchStore(); let openedAttachment;
  const open = createReaderActions({ store, rowById: () => ({ id: "paper", title: "Paper", attachment_id: "first", read_page: 1 }), notify: () => {}, opened: async () => {},
    api: { nativeReader: async (id) => { openedAttachment = id; return { attachment: { reader_url: "./reader.html?document_id=demo" } }; } } });
  await open("paper", { attachmentId: "second", page: 5 });
  assert.equal(openedAttachment, undefined); assert.equal(store.getSnapshot().tabs[0].attachmentId, "second"); assert.equal(store.getSnapshot().tabs[0].resumePage, 5);
  const key = store.getSnapshot().tabs[0].navigationKey;
  await open("paper", { attachmentId: "second", page: 2 });
  assert.equal(store.getSnapshot().tabs[0].resumePage, 2);
  assert.equal(store.getSnapshot().tabs[0].navigationKey, key + 1);
});
