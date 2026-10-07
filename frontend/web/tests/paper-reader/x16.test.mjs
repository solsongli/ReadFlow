import test from "node:test";
import assert from "node:assert/strict";
import { searchLines, searchRanges } from "../../src/features/paper-reader/domain/analysis.js";
import { previewRegion } from "../../src/features/paper-reader/domain/navigation.js";
import {
  joinedSearchText,
  spanSeparator,
  splitSearchMatches,
} from "../../src/features/paper-reader/domain/search-highlight.js";

test("search counts every occurrence with case and whole-word controls", () => {
  assert.deepEqual(searchRanges("Evidence evidence evidences", "evidence"), [
    [0, 8],
    [9, 17],
    [18, 26],
  ]);
  assert.deepEqual(searchRanges("Evidence evidence", "Evidence", { caseSensitive: true, wholeWord: false }), [
    [0, 8],
  ]);
  assert.deepEqual(searchRanges("ReadFlow flow workflow", "flow", { caseSensitive: false, wholeWord: true }), [
    [9, 13],
  ]);
});

test("search results represent occurrences rather than matching lines", () => {
  const hits = searchLines(
    [{ page: 2, text: "method and another method", x: 0, y: 20, width: 100, height: 10, size: 10 }],
    "method",
  );
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map((hit) => hit.start), [0, 19]);
});

test("internal-link preview crop stays within the target page", () => {
  assert.deepEqual(previewRegion(20, 800), { top: 0, bottom: 140 });
  assert.deepEqual(previewRegion(400, 800), { top: 330, bottom: 470 });
  assert.deepEqual(previewRegion(790, 800), { top: 660, bottom: 800 });
});

test("highlight parts preserve middle offsets and split cross-span words exactly", () => {
  const texts = ["prefix pol", "icy suffix"];
  const separators = [spanSeparator(texts[0], texts[1], 0.2, 10), ""];
  const joined = joinedSearchText(texts, separators);
  assert.equal(joined, "prefix policy suffix");
  assert.deepEqual(splitSearchMatches(texts, searchRanges(joined, "policy"), separators), [
    { match: 0, span: 0, start: 7, end: 10 },
    { match: 0, span: 1, start: 0, end: 3 },
  ]);
  assert.deepEqual(splitSearchMatches(["prefix policy suffix"], [[7, 13]], [""]), [
    { match: 0, span: 0, start: 7, end: 13 },
  ]);
});
