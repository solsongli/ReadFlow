import test from "node:test";
import assert from "node:assert/strict";
import { fitTypography, lineCount } from "../../src/features/paper-blocks/domain/typography.js";
import {
  translatedParts,
  labelBox,
  adjacentBlock,
  copyPage,
} from "../../src/features/paper-blocks/domain/reading.js";

test("inline typography respects native size, a 65% floor and explicit overflow", () => {
  assert.deepEqual(fitTypography("短译文", 200, 80, 12), { size: 12, overflow: false });
  const long = fitTypography("中文".repeat(1000), 100, 30, 10);
  assert.equal(long.size, 6.5);
  assert.equal(long.overflow, true);
  const middle = fitTypography("", 100, 18, 20, (size) => size * 1.2);
  assert.ok(middle.size <= 15 && middle.size > 14.9);
  assert.equal(middle.overflow, false);
  assert.equal(lineCount("甲乙\n丙丁", 25, 10), 2);
  assert.equal(fitTypography("words", 0, 0, 10).overflow, true);
});
const anchor = (page) => ({
  page,
  bbox: [0, 0, 100, 100],
  view_bbox: [0, 0, 0.5, 0.5],
  pdf_bbox: [0, 0, 100, 100],
});
test("cross-page/column allocation preserves every code point and structured scripts exactly once", () => {
  const runs = [
    { kind: "text", text: "第一段中文。Next paragraph 🙂 " },
    { kind: "sub", text: "i" },
    { kind: "super", text: "2" },
  ];
  const text = runs.map((r) => r.text).join("");
  const block = {
    id: "b",
    page: 1,
    type: "text",
    text: "source",
    anchors: [anchor(1), anchor(2)],
    translation: text,
    translation_runs: runs,
  };
  const parts = translatedParts(block);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.equal(parts.length, 2);
  assert.ok(parts.flatMap((p) => p.runs).some((r) => r.kind === "sub"));
  assert.equal(copyPage([block], 2), parts[1].text);
});
test("image label geometry obeys saved rotation/crop transformation", () => {
  const geometry = { width: 800, height: 600, page_to_display: [0, 1, -1, 0, 800, 0] };
  assert.deepEqual(labelBox([100, 200, 200, 300], geometry), [500 / 800, 100 / 600, 600 / 800, 200 / 600]);
});
test("block navigation follows extraction order, skips page furniture and stops at ends", () => {
  const rows = [
    { id: "h", type: "header" },
    { id: "a", type: "text" },
    { id: "b", type: "figure" },
  ];
  assert.equal(adjacentBlock(rows, "a", -1), undefined);
  assert.equal(adjacentBlock(rows, "a", 1).id, "b");
  assert.equal(adjacentBlock(rows, "b", 1), undefined);
});

test("each sidebar entry can copy untranslated source or an attached caption", async () => {
  const { blockCopyText } = await import("../../src/features/paper-blocks/domain/reading.js");
  const text = { id: "t", page: 1, type: "text", text: "Original paragraph", anchors: [anchor(1)] };
  const image = { id: "i", page: 1, type: "figure", text: "", caption_id: "c", anchors: [anchor(1)] };
  const caption = {
    id: "c",
    page: 1,
    type: "caption",
    text: "Caption",
    translation: "中文图注",
    anchors: [anchor(1)],
  };
  assert.equal(blockCopyText(text, [text], 1), "Original paragraph");
  assert.equal(blockCopyText(image, [image, caption], 1), "中文图注");
});
