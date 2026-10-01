import test from "node:test";
import assert from "node:assert/strict";
import { researchCitationTarget } from "../../src/features/research-library/domain/citation-target.js";
const sha256 = "a".repeat(64);
const attachment = { id: "attachment-a", item_id: "paper-a", sha256, available: true, page_count: 3 };
const items = [{ id: "paper-a", attachments: [attachment] }];
const citation = { item_id: "paper-a", attachment_id: "attachment-a", sha256, source_sha256: sha256, page_idx: 1, quote: "source" };
test("citation resolves selected paper identity and zero-based original page only", () => {
  assert.deepEqual(researchCitationTarget(items, { ...citation, reader_url: "javascript:bad()" }), { item: items[0], attachment, pageIdx: 1 });
});
test("citation rejects out-of-scope documents, wrong hashes and invalid pages", () => {
  for (const change of [{ item_id: "outside" }, { attachment_id: "outside" }, { source_sha256: "b".repeat(64) }, { sha256: "b".repeat(64) }, { source_sha256: "", sha256: "" }, { page_idx: -1 }, { page_idx: 3 }, { page_idx: 0.5 }, { page_idx: "1" }]) assert.equal(researchCitationTarget(items, { ...citation, ...change }), null);
  assert.equal(researchCitationTarget([], citation), null);
  assert.equal(researchCitationTarget([{ ...items[0], attachments: [{ ...attachment, available: false }] }], citation), null);
  assert.equal(researchCitationTarget([{ ...items[0], attachments: [{ ...attachment, item_id: "outside" }] }], citation), null);
});
