import test from "node:test";
import assert from "node:assert/strict";
import {
  annotationMatches,
  normalizeAnnotationTag,
  tagSuggestions,
} from "../../src/features/paper-reader/domain/annotations/tags.js";
import {
  annotationCitation,
  annotationDragPayload,
} from "../../src/features/paper-reader/domain/annotations/citation.js";

const row = {
  id: "annotation-1",
  item_id: "paper",
  attachment_id: "attachment",
  page_index: 7,
  type: "highlight",
  color: "yellow",
  rects: [],
  quote: "Selected <evidence>",
  note: "Useful for methods",
  tags: ["待引用", "方法"],
  ink: [],
  width: 2,
  image_ref: "",
  created_at: "2026-10-07",
  updated_at: "2026-10-07",
};

test("annotation tags normalize and autocomplete paper plus library values", () => {
  assert.equal(normalizeAnnotationTag("  待   引用  "), "待 引用");
  assert.equal(normalizeAnnotationTag("x".repeat(61)), "");
  assert.deepEqual(tagSuggestions(["方法", "复现"], [row], "", ["方法"]), ["待引用", "复现"]);
});

test("annotation filters combine text with any selected tag", () => {
  const base = { color: "", type: "", onlyPage: false, page: 8, notes: "", hasCard: false };
  assert.equal(annotationMatches(row, { ...base, query: "methods", tags: ["疑问", "待引用"] }), true);
  assert.equal(annotationMatches(row, { ...base, query: "missing", tags: ["待引用"] }), false);
  assert.equal(annotationMatches(row, { ...base, query: "evidence", tags: ["疑问"] }), false);
});

test("drag payload exports citation text and escaped HTML without invented deep links", () => {
  const citation = annotationCitation(row, ["Alice Zhang", "Bob Li"], "2025");
  assert.equal(citation, "“Selected <evidence>” —— Zhang et al., 2025, p. 8");
  const payload = annotationDragPayload(row, citation);
  assert.equal(payload.plain, citation);
  assert.match(payload.html, /&lt;evidence&gt;/u);
  assert.doesNotMatch(payload.html, /href|readflow:/u);
  assert.deepEqual(JSON.parse(payload.canvas), {
    type: "annotation",
    annotationId: row.id,
    itemId: row.item_id,
  });
});
