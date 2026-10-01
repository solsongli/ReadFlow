import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useReaderAnnotations } from "../../../../frontend/packages/reader/src/hooks/use-reader-annotations.ts";
import { setReaderAdapters } from "../../../../frontend/packages/reader/src/adapters.ts";
import { createNativeReaderAnnotationsPort, parseNativeReaderRoute } from "../../src/app/reader/adapters/native-library.ts";

const HASH = "a".repeat(64);
const A = { itemId: "11111111-1111-4111-8111-111111111111", attachmentId: "22222222-2222-4222-8222-222222222222", documentId: HASH };
const B = { itemId: "33333333-3333-4333-8333-333333333333", attachmentId: "44444444-4444-4444-8444-444444444444", documentId: HASH };
const note = (id = "synthetic-note") => ({ id, page: 1, pane: "source", quote: "Actual selected quotation.", note: "", createdAt: "2026-09-30T10:00:00+00:00" });
const serverNote = (route, input = note()) => ({
  id: input.id, item_id: route.itemId, attachment_id: route.attachmentId, page_idx: input.page - 1,
  quote: input.quote, translated_quote: "", body: input.note, created_at: input.createdAt,
  reader_annotation: { ...input, ...route },
});
const item = (route, notes = []) => ({ id: route.itemId,
  attachments: [{ id: route.attachmentId, item_id: route.itemId, sha256: route.documentId, page_count: 2 }], notes,
});
const response = (value, status = 200) => new Response(status === 204 ? null : JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

test("native route requires item/attachment identities even when PDF hash is shared", () => {
  assert.equal(parseNativeReaderRoute("?document_id=" + HASH), null);
  assert.deepEqual(parseNativeReaderRoute("?document_id=" + HASH + "&research_item_id=" + A.itemId + "&attachment_id=" + A.attachmentId), A);
  assert.throws(() => parseNativeReaderRoute("?document_id=" + HASH + "&research_item_id=" + A.itemId), /参数不完整/);
  assert.throws(() => parseNativeReaderRoute("?document_id=" + HASH + "&research_item_id=" + A.itemId + "&attachment_id=" + A.attachmentId + "&job_id=fake"), /参数不完整/);
});

test("host checks paper owner/hash before writes and handles DELETE 204 without JSON parsing", async () => {
  const calls = []; let saved = [];
  const fetchResource = async (path, init = {}) => {
    calls.push([path, init.method || "GET"]);
    if (path === "/api/research/items/" + A.itemId) return response(item(A, saved));
    if (init.method === "POST") { saved = [serverNote(A, JSON.parse(init.body).reader_annotation)]; return response(saved[0], 201); }
    if (init.method === "DELETE") { saved = []; return response(null, 204); }
    throw new Error("Unexpected request " + path);
  };
  const port = createNativeReaderAnnotationsPort(A, fetchResource);
  const scope = port.resolveScope({ documentId: HASH });
  const created = await port.create(scope, note());
  assert.equal(created.quote, note().quote);
  assert.equal(created.page, 1);
  assert.deepEqual(await port.load(scope), [note()]);
  await port.remove(scope, created.id);
  assert.equal(saved.length, 0);
  assert.equal(calls.filter(([, method]) => method === "POST").length, 1);
  assert.equal(port.resolveScope({ documentId: HASH, jobId: "fake" }), null);
  const bad = createNativeReaderAnnotationsPort(A, async () => response(item(B)));
  await assert.rejects(bad.create(bad.resolveScope({ documentId: HASH }), note()), /归属/);
  await assert.rejects(port.create(scope, { ...note(), pane: "translated" }), /译文页/);
});

test("existing source-note edits send only body and preserve raw import provenance", async () => {
  const original = { ...serverNote(A), reader_annotation: undefined }; let patch;
  const port = createNativeReaderAnnotationsPort(A, async (path, init = {}) => {
    if (!init.method) return response(item(A, [original]));
    patch = JSON.parse(init.body);
    return response({ ...original, body: patch.body });
  });
  const scope = port.resolveScope({ documentId: HASH });
  const updated = await port.update(scope, { ...note(), note: "Edited thought." });
  assert.deepEqual(patch, { body: "Edited thought." });
  assert.equal(updated.note, "Edited thought.");
});

test("native note edits preserve original selection extensions without inventing anchors", async () => {
  const original = serverNote(A);
  original.reader_annotation.selection = { rects: [{ x: 0.15, y: 0.2, width: 0.4, height: 0.03 }], origin: "reader-selection" };
  original.reader_annotation.future_extension = { value: "Retain original raw data." };
  let patch;
  const port = createNativeReaderAnnotationsPort(A, async (_path, init = {}) => {
    if (!init.method) return response(item(A, [original]));
    patch = JSON.parse(init.body);
    return response({ ...original, body: patch.body, reader_annotation: patch.reader_annotation });
  });
  const scope = port.resolveScope({ documentId: HASH });
  const loaded = (await port.load(scope))[0];
  const updated = await port.update(scope, { ...loaded, note: "Edited persistent thought." });
  assert.equal(updated.note, "Edited persistent thought.");
  assert.deepEqual(patch.reader_annotation.selection, original.reader_annotation.selection);
  assert.deepEqual(patch.reader_annotation.future_extension, original.reader_annotation.future_extension);
  assert.equal(patch.reader_annotation.documentId, HASH);
  assert.equal(patch.reader_annotation.itemId, A.itemId);
  assert.equal(patch.reader_annotation.attachmentId, A.attachmentId);
});

function harness(t) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://127.0.0.1:40001/reader.html" });
  const names = ["window", "document", "navigator", "localStorage", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let localReads = 0, localWrites = 0;
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    localStorage: { getItem() { localReads++; return null; }, setItem() { localWrites++; } },
    IS_REACT_ACT_ENVIRONMENT: true,
  })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const root = createRoot(document.getElementById("root"));
  let api;
  function Capture({ documentId = HASH }) { api = useReaderAnnotations({ documentId }); return React.createElement("span", null, api.notes.map((entry) => entry.quote).join("|")); }
  t.after(async () => {
    await act(async () => root.unmount());
    setReaderAdapters(null); dom.window.close();
    for (const name of names) {
      const value = previous.get(name);
      if (value) Object.defineProperty(globalThis, name, value); else delete globalThis[name];
    }
  });
  return {
    render: async (port, documentId = HASH) => {
      setReaderAdapters(port ? { annotationDataPort: port } : null);
      await act(async () => root.render(React.createElement(Capture, { documentId })));
    },
    get api() { return api; }, localReads: () => localReads, localWrites: () => localWrites,
  };
}
function memoryPort(key, stored, overrides = {}) {
  return { resolveScope: (doc) => ({ key, documentId: doc.documentId }),
    load: async () => [...stored],
    create: async (_scope, entry) => { stored.push(entry); return entry; },
    update: async (_scope, entry) => { stored.splice(stored.findIndex((row) => row.id === entry.id), 1, entry); return entry; },
    remove: async (_scope, id) => { stored.splice(stored.findIndex((entry) => entry.id === id), 1); },
    ...overrides };
}

test("original Reader hook persists native selection/update/delete and never reads local notes", async (t) => {
  const h = harness(t), stored = [], port = memoryPort("paper-A:attachment-A:" + HASH, stored);
  await h.render(port);
  await act(async () => { await h.api.addFromQuote({ page: 1, pane: "source", quote: "Selected in original Reader." }); });
  assert.equal(h.api.count, 1);
  const id = h.api.notes[0].id;
  await act(async () => { await h.api.updateNote(id, "A persistent thought."); });
  await h.render(memoryPort("paper-B:attachment-B:" + HASH, []));
  assert.equal(h.api.count, 0, "shared PDF hash does not share paper notes");
  await h.render(port);
  assert.equal(h.api.notes[0].note, "A persistent thought.");
  await act(async () => { await h.api.remove(id); });
  assert.equal(h.api.count, 0);
  assert.equal(h.localReads(), 0); assert.equal(h.localWrites(), 0);
});

test("late load and create responses cannot replace another paper's visible notes", async (t) => {
  const h = harness(t);
  let releaseLoad;
  await h.render(memoryPort("paper-A", [], { load: () => new Promise((resolve) => { releaseLoad = resolve; }) }));
  await h.render(memoryPort("paper-B", [note("B")]));
  await act(async () => { releaseLoad([note("A")]); });
  assert.deepEqual(h.api.notes.map((entry) => entry.id), ["B"]);
  let releaseCreate, pending;
  await h.render(memoryPort("paper-A", [], { create: (_scope, entry) => new Promise((resolve) => { releaseCreate = () => resolve(entry); }) }));
  await act(async () => { pending = h.api.addFromQuote({ page: 1, pane: "source", quote: "Delayed A selection." }); });
  await h.render(memoryPort("paper-B", [note("B")]));
  await act(async () => { releaseCreate(); await pending; });
  assert.deepEqual(h.api.notes.map((entry) => entry.id), ["B"]);
});

test("failed native save remains an explicit error and retains the saved list", async (t) => {
  const h = harness(t);
  await h.render(memoryPort("paper-A", [note("existing")], { create: async () => { throw new Error("Synthetic offline failure"); } }));
  let result;
  await act(async () => { result = await h.api.addFromQuote({ page: 2, pane: "source", quote: "Unsaved selection." }); });
  assert.equal(result, null);
  assert.match(h.api.error, /保存失败/);
  assert.deepEqual(h.api.notes.map((entry) => entry.id), ["existing"]);
});

test("a host without the optional port keeps original localStorage note behavior", async (t) => {
  const h = harness(t);
  await h.render(null);
  await act(async () => { h.api.addFromQuote({ page: 1, pane: "source", quote: "Legacy local note." }); });
  assert.equal(h.api.storageMode, "local");
  assert.equal(h.api.notes[0].quote, "Legacy local note.");
  assert.ok(h.localReads() > 0); assert.ok(h.localWrites() > 0);
});
