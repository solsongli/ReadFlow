import test from "node:test";
import assert from "node:assert/strict";
import { buildImportPayload, countConflicts, splitLines, splitTags, validateNote } from "../../src/app/research-library/model.js";

test("CSL JSON preview retains source identity and ordered author objects", () => {
  const raw = [{ id: "A", type: "article-journal", title: "Synthetic paper", author: [{ family: "Ng", given: "A" }] }];
  const payload = buildImportPayload(raw, "  synthetic-zotero  ");
  assert.equal(payload.format, "csl-json"); assert.equal(payload.source_id, "synthetic-zotero"); assert.equal(payload.data, raw);
});
test("API snapshot detects wrapped item records and preserves collection records", () => {
  const items = [{ key: "AAA", data: { itemType: "journalArticle", title: "Synthetic" } }];
  const collections = [{ key: "BBB", data: { name: "Methods" } }];
  assert.deepEqual(buildImportPayload({ items, collections }, "fixture"), { format: "zotero-api", source_id: "fixture", data: items, collections });
  assert.equal(buildImportPayload(items, "fixture").format, "zotero-api");
});
test("explicit API capture does not lose raw unsupported fields", () => {
  const data = [{ itemType: "annotation", annotationType: "area", pluginSyntheticField: "keep" }];
  assert.equal(buildImportPayload({ format: "zotero-api", data }, "fixture").data, data);
});
test("invalid import sources stop before preview", () => {
  assert.throws(() => buildImportPayload([], ""), /固定/);
  assert.throws(() => buildImportPayload("not JSON", "fixture"), /顶层/);
  assert.throws(() => buildImportPayload({ format: "csl-json", data: {} }, "fixture"), /数组/);
  assert.throws(() => buildImportPayload({ unrelated: true }, "fixture"), /CSL JSON/);
});
test("page zero is a valid first-page anchor and missing attachment is rejected", () => {
  const value = { attachment_id: "fixture-pdf", page_idx: 0, quote: "First page evidence", translated_quote: "", body: "" };
  assert.equal(validateNote(value, 2), null);
  assert.match(validateNote({ ...value, attachment_id: null }, 2), /需要关联/);
  assert.match(validateNote({ ...value, page_idx: -1 }, 2), /整数/);
  assert.match(validateNote({ ...value, page_idx: 2 }, 2), /超过/);
  assert.match(validateNote({ ...value, page_idx: 1.5 }, 2), /整数/);
});
test("general notes and bilingual notes may be saved without PDF page anchors", () => {
  assert.equal(validateNote({ attachment_id: null, page_idx: null, quote: "", translated_quote: "", body: "Research idea" }), null);
  assert.equal(validateNote({ attachment_id: null, page_idx: null, quote: "", translated_quote: "双语笔记", body: "" }), null);
  assert.match(validateNote({ attachment_id: null, page_idx: null, quote: " ", translated_quote: "", body: "" }), /填写/);
});
test("name lines preserve order while tags deduplicate without splitting spaces inside a tag", () => {
  assert.deepEqual(splitLines("A. Ng\n Research Group \r\n"), ["A. Ng", "Research Group"]);
  assert.deepEqual(splitTags("sample size,方法；方法\n模型"), ["sample size", "方法", "模型"]);
  assert.equal(countConflicts([{ source: "AAA" }]), 1); assert.equal(countConflicts(0), 0);
});

test("canonical API snapshots accept nested items/collections and keep snapshot provenance", () => {
  const data = { items: [{ key: "AAA", data: { itemType: "journalArticle", title: "Synthetic" } }], collections: [{ key: "BBB", data: { name: "Methods" } }] };
  const snapshot = { server_id: "synthetic-instance", consistency: "version_checked", source_namespace: null };
  const payload = buildImportPayload({ format: "zotero-api", source_id: "local:fixture", data, snapshot }, "local:fixture");
  assert.equal(payload.format, "zotero-api"); assert.equal(payload.data, data); assert.equal(payload.snapshot, snapshot);
});
test("API data envelopes may retain top-level collections while CSL stays array-only", () => {
  const collections = [{ key: "BBB", data: { name: "Methods" } }];
  const payload = buildImportPayload({ format: "zotero-api", data: { items: [] }, collections }, "fixture");
  assert.equal(payload.collections, collections);
  assert.throws(() => buildImportPayload({ format: "csl-json", data: { items: [] } }, "fixture"), /数组/);
  assert.throws(() => buildImportPayload({ format: "zotero-api", data: {} }, "fixture"), /items/);
});
