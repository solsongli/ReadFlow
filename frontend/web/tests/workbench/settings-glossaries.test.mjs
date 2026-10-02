import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsGlossaries } from "@/features/workbench/state/settings-glossaries.js";

test("settings reuse glossary controller CRUD/CSV and the shared default-glossary option", async () => {
  const data = new Map();
  const calls = [];
  let options = { model: "demo", glossaryId: "" };
  const port = createSettingsGlossaries({ initialize: async () => {}, readOptions: () => options, saveOptions: async (value) => { options = value; }, api: {
    fetchGlossaries: async () => ({ items: [...data].map(([id, value]) => ({ glossary_id: id, name: value.name, entry_count: value.entries.length })) }),
    fetchGlossary: async (id) => ({ ...data.get(id), glossary_id: id }),
    createGlossary: async (_prefix, value) => { calls.push("create"); data.set("g1", structuredClone(value)); return { glossary_id: "g1" }; },
    updateGlossary: async (_prefix, id, value) => { calls.push("update"); data.set(id, structuredClone(value)); return { glossary_id: id }; },
    deleteGlossary: async (_prefix, id) => { calls.push("delete"); data.delete(id); },
    parseGlossaryCsv: async (_prefix, csv) => { calls.push("parse"); assert.equal(csv, "source,target\nrobot,机器人"); return { entry_count: 1, entries: [{ source: "robot", target: "机器人", level: "canonical", match_mode: "exact" }] }; },
    exportGlossaryCsv: async () => new Response(""),
  } });
  await port.open();
  const handlers = port.view.handlersRef.current;
  handlers.createNew();
  port.view.editor.actions.setName("机器人术语");
  port.view.editor.actions.updateEntryField({ index: 0, field: "source", value: "agent" });
  port.view.editor.actions.updateEntryField({ index: 0, field: "target", value: "智能体" });
  await handlers.save();
  assert.equal(data.get("g1").entries[0].target, "智能体");
  await port.enable("g1");
  assert.equal(options.glossaryId, "g1"); assert.equal(options.model, "demo");
  port.view.editor.actions.setCsvText("source,target\nrobot,机器人");
  await handlers.applyImport(); await handlers.save();
  assert.equal(data.get("g1").entries[0].match_mode, "exact");
  assert.equal(port.view.store.getSnapshot().items[0].entry_count, 1);
  await handlers.deleteCurrent();
  assert.equal(data.size, 0); assert.equal(options.glossaryId, "");
  assert.deepEqual(calls, ["create", "parse", "update", "delete"]);
});
