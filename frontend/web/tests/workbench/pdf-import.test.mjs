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

test("single duplicate announces the stored title and selects it after refreshing", async () => {
  const calls = [];
  const importer = createPdfImporter({ api: { upload: async () => ({ duplicate: true, item: { id: "existing", title: "Original title" } }) }, group: () => null,
    refresh: async () => calls.push("refresh"), select: (id) => calls.push(id), notify: (text) => calls.push(text), failure: () => assert.fail("unexpected failure") });
  await importer([{ name: "renamed.pdf" }]);
  assert.deepEqual(calls, ["refresh", "existing", "《Original title》已在文献库中"]);
});
test("mixed batch summarizes duplicates and a membership retry counts each file once", async () => {
  let attempts = 0, uploads = 0, retry;
  const messages = [], selected = [];
  const importer = createPdfImporter({ api: { upload: async (file) => { uploads++; return { duplicate: file.name !== "new.pdf", item: { id: file.name, title: "Stored" } }; }, changeGroup: async (_group, ids) => { if (ids[0] === "retry.pdf" && attempts++ === 0) throw new Error("offline"); } },
    group: () => "group", refresh: async () => {}, select: (id) => selected.push(id), notify: (text) => messages.push(text), failure: (_error, fn) => { retry = fn; } });
  await importer(["new.pdf", "old.pdf", "retry.pdf"].map((name) => ({ name })));
  await retry();
  assert.equal(uploads, 3); assert.equal(messages.at(-1), "已导入 1 个 PDF，2 篇已存在");
  assert.equal(selected.at(-1), "retry.pdf");
});
