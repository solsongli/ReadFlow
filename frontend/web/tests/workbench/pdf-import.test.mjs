import test from "node:test";
import assert from "node:assert/strict";
import { createPdfImporter } from "../../src/features/workbench/state/pdf-import.ts";
test("PDF batch retry retains all failures without repeating successful uploads", async () => {
  const uploads = [], notices = []; let down = true, retry, failures = 0;
  const importFiles = createPdfImporter({ api: { upload: async (file) => { uploads.push(file.name); if (down && file.name !== "ok.pdf") throw new Error("Service unavailable"); return { item: { id: file.name } }; } }, group: () => null, refresh: async () => {}, notify: (text) => notices.push(text), failure: (error, action) => { failures++; assert.match(error.message, /2 个 PDF/); retry = action; } });
  await importFiles(["ok.pdf", "one.pdf", "two.pdf", "ignored.txt"].map((name) => ({ name, type: "" })));
  assert.equal(failures, 1); assert.deepEqual(uploads, ["ok.pdf", "one.pdf", "two.pdf"]);
  down = false; await retry();
  assert.deepEqual(uploads, ["ok.pdf", "one.pdf", "two.pdf", "one.pdf", "two.pdf"]);
  assert.match(notices.at(-1), /3 个 PDF.*1 个非 PDF/);
});
test("membership retry resumes an uploaded PDF without creating another item", async () => {
  let uploaded = 0, groups = 0, retry;
  const importFiles = createPdfImporter({ api: { upload: async () => { uploaded++; return { item: { id: "paper" } }; }, changeGroup: async () => { if (++groups === 1) throw new Error("Offline"); } }, group: () => "group", refresh: async () => {}, notify: () => {}, failure: (_error, action) => { retry = action; } });
  await importFiles([{ name: "paper.pdf", type: "application/pdf" }]); await retry();
  assert.equal(uploaded, 1); assert.equal(groups, 2);
});
