import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { bootTheme, setTheme, getStoredTheme, THEME_CHANGE_EVENT, applyWorkbenchAppearance } from "../../../../frontend/packages/reader/src/shared/theme/theme.ts";
import { ReaderCloseHome } from "../../../../frontend/packages/reader/src/components/react-pdf/ReaderCloseHome.tsx";
import { useWorkbenchSchemeBridge, useWorkbenchReaderProgress } from "../../../../frontend/packages/reader/src/hooks/use-workbench-bridge.ts";
import { createNativeReaderAnnotationsPort } from "@/app/reader/adapters/native-library.js";
import { notifyWorkbenchNotesChanged, loadWorkbenchReaderFonts } from "@/app/reader/adapters/workbench.js";

const ID = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT = "22222222-2222-4222-8222-222222222222";
const HASH = "a".repeat(64);
const embedded = `?embed=workbench&scheme=dark&research_item_id=${ID}`;
function harness(t, search = embedded, framed = true) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://reader.test/reader.html" + search });
  const sent = [], storage = new Map([["retainpdf.theme", "mojia"]]);
  const accesses = [];
  const parent = { postMessage: (...args) => sent.push(args) };
  if (framed) Object.defineProperty(dom.window, "parent", { configurable: true, value: parent });
  const values = { window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent,
    localStorage: { getItem: (key) => { accesses.push(["get", key]); return storage.get(key); }, setItem: (key, value) => { accesses.push(["set", key]); storage.set(key, value); } }, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const root = createRoot(document.getElementById("root"));
  t.after(async () => {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    dom.window.close();
  });
  return { dom, root, parent, sent, storage, accesses };
}

test("embedded theme never reads/writes shared storage or emits the legacy event", (t) => {
  const h = harness(t);
  let events = 0;
  window.addEventListener(THEME_CHANGE_EVENT, () => events++);
  assert.equal(bootTheme(), "graphite");
  assert.equal(getStoredTheme(), "graphite");
  assert.equal(setTheme("night"), "graphite", "legacy theme setters cannot override host scheme");
  assert.equal(document.documentElement.dataset.themeGroup, "dark");
  assert.equal(document.documentElement.dataset.readerEmbed, "workbench");
  assert.deepEqual(h.accesses, []);
  assert.equal(events, 0);
  assert.equal(h.storage.get("retainpdf.theme"), "mojia");
  assert.equal(renderToStaticMarkup(React.createElement(ReaderCloseHome)), "");
});

test("standalone and legacy soft Reader retain theme storage, events and close button", async (t) => {
  for (const framed of [false, true]) {
    await t.test(framed ? "legacy soft iframe" : "standalone page", async (sub) => {
      const h = harness(sub, "?document_id=doc", framed);
      let events = 0;
      window.addEventListener(THEME_CHANGE_EVENT, () => events++);
      assert.equal(bootTheme(), "mojia");
      assert.equal(setTheme("night"), "night");
      assert.equal(h.storage.get("retainpdf.theme"), "night");
      assert.equal(events, 2);
      assert.match(renderToStaticMarkup(React.createElement(ReaderCloseHome)), /reader-close-home-btn/);
      function Probe() { useWorkbenchSchemeBridge(); useWorkbenchReaderProgress(3, 30, true); return null; }
      await act(async () => h.root.render(React.createElement(Probe)));
      await act(async () => { window.dispatchEvent(new window.MessageEvent("message", { data: { type: "readflow:scheme", scheme: "light" }, origin: window.location.origin, source: h.parent })); });
      notifyWorkbenchNotesChanged(ID);
      assert.deepEqual(h.sent, []);
      assert.equal(document.documentElement.dataset.theme, "night");
    });
  }
});

test("scheme updates require both same origin and actual parent, and send readiness", async (t) => {
  const h = harness(t);
  bootTheme();
  function Probe() { useWorkbenchSchemeBridge(); return null; }
  await act(async () => h.root.render(React.createElement(Probe)));
  assert.deepEqual(h.sent, [[{ type: "readflow:reader-ready", itemId: ID }, "http://reader.test"]]);
  async function send(source, origin, scheme) {
    await act(async () => window.dispatchEvent(new window.MessageEvent("message", { data: { type: "readflow:scheme", scheme }, origin, source })));
  }
  await send(h.parent, "https://foreign.test", "light");
  await send({}, "http://reader.test", "light");
  await send(h.parent, "http://reader.test", "night");
  assert.equal(document.documentElement.dataset.theme, "graphite");
  await send(h.parent, "http://reader.test", "light");
  assert.equal(document.documentElement.dataset.theme, "classic");
  assert.deepEqual(h.accesses, []);
});

test("progress waits for anchor readiness, coalesces pages, and uses one-based bounds", async (t) => {
  const h = harness(t);
  function Probe({ page, ready }) { useWorkbenchReaderProgress(page, 32, ready); return null; }
  await act(async () => h.root.render(React.createElement(Probe, { page: 1, ready: false })));
  assert.deepEqual(h.sent, []);
  await act(async () => h.root.render(React.createElement(Probe, { page: 25, ready: true })));
  await act(async () => h.root.render(React.createElement(Probe, { page: 26, ready: true })));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 1100)));
  assert.deepEqual(h.sent, [[{ type: "readflow:reader-progress", itemId: ID, page: 26, pages: 32 }, "http://reader.test"]]);
  await act(async () => h.root.render(React.createElement(Probe, { page: 27, ready: true })));
  window.dispatchEvent(new window.Event("pagehide"));
  assert.equal(h.sent.at(-1)[0].page, 27);
  await act(async () => h.root.render(React.createElement(Probe, { page: 90, ready: true })));
  window.dispatchEvent(new window.Event("pagehide"));
  assert.equal(h.sent.length, 2);
});

test("native note CRUD notifies only after successful persistence and for this embed", async (t) => {
  const h = harness(t);
  const route = { itemId: ID, attachmentId: ATTACHMENT, documentId: HASH };
  const note = { id: "note", page: 1, pane: "source", quote: "Quoted text", note: "Thought", createdAt: "2026-10-02" };
  const saved = { id: "note", item_id: ID, attachment_id: ATTACHMENT, page_idx: 0, quote: note.quote, body: note.note, created_at: note.createdAt, reader_annotation: { ...note, ...route } };
  let reject = false;
  const port = createNativeReaderAnnotationsPort(route, async (_path, init = {}) => {
    if (!init.method) return Response.json({ id: ID, attachments: [{ id: ATTACHMENT, item_id: ID, sha256: HASH, page_count: 32 }], notes: [saved] });
    if (reject) return Response.json({}, { status: 500 });
    return init.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json(saved);
  }, () => notifyWorkbenchNotesChanged(ID));
  const scope = port.resolveScope({ documentId: HASH });
  await port.create(scope, note); await port.update(scope, note); await port.remove(scope, note.id);
  assert.equal(h.sent.length, 3);
  assert.ok(h.sent.every(([data, origin]) => data.type === "readflow:notes-changed" && data.itemId === ID && origin === "http://reader.test"));
  reject = true;
  await assert.rejects(port.create(scope, note));
  assert.equal(h.sent.length, 3);
  h.dom.reconfigure({ url: "http://reader.test/reader.html" });
  notifyWorkbenchNotesChanged(ID);
  assert.equal(h.sent.length, 3);
});

test("UI fonts are loaded only for explicit embeds from the host asset path", (t) => {
  const h = harness(t);
  const original = Object.getOwnPropertyDescriptor(globalThis, "FontFace");
  const faces = [];
  Object.defineProperty(globalThis, "FontFace", { configurable: true, value: class { constructor(...args) { faces.push(args); } load() { return Promise.resolve(); } } });
  Object.defineProperty(document, "fonts", { configurable: true, value: { add() {} } });
  t.after(() => { if (original) Object.defineProperty(globalThis, "FontFace", original); else delete globalThis.FontFace; });
  loadWorkbenchReaderFonts();
  assert.equal(faces.length, 2);
  assert.equal(faces[0][0], "ReadFlow Inter", "private UI alias must not replace a document font named Inter");
  assert.match(faces[0][1], /http:\/\/reader.test\/src\/assets\/fonts\/inter\/InterVariable.woff2/);
  h.dom.reconfigure({ url: "http://reader.test/reader.html?scheme=dark" });
  loadWorkbenchReaderFonts();
  assert.equal(faces.length, 2);
});

test("appearance updates preserve source/origin validation and old scheme-only messages", async (t) => {
  const h = harness(t); bootTheme();
  function Probe() { useWorkbenchSchemeBridge(); return null; }
  await act(async () => h.root.render(React.createElement(Probe)));
  const appearance = { font: "serif", textScale: 130 };
  const send = (source, origin, data) => act(async () => window.dispatchEvent(new window.MessageEvent("message", { source, origin, data })));
  const message = { type: "readflow:scheme", scheme: "light", appearance };
  await send({}, window.location.origin, message);
  await send(h.parent, "http://foreign.test", message);
  assert.equal(document.documentElement.style.getPropertyValue("--readflow-ui-scale"), "");
  await send(h.parent, window.location.origin, message);
  assert.equal(document.documentElement.style.getPropertyValue("--readflow-ui-scale"), "1.3");
  assert.match(document.documentElement.style.getPropertyValue("--readflow-ui-font"), /Noto Serif CJK SC/);
  await send(h.parent, window.location.origin, { type: "readflow:scheme", scheme: "dark" });
  assert.equal(document.documentElement.style.getPropertyValue("--readflow-ui-scale"), "1.3");
  assert.equal(document.documentElement.dataset.theme, "graphite");
  assert.deepEqual(h.accesses, []);
});

test("standalone reader ignores workbench typography entirely", (t) => {
  harness(t, "?document_id=doc", false);
  applyWorkbenchAppearance({ font: "kai", textScale: 130 });
  assert.equal(document.documentElement.style.getPropertyValue("--readflow-ui-scale"), "");
  assert.equal(document.documentElement.style.getPropertyValue("--readflow-ui-font"), "");
});
