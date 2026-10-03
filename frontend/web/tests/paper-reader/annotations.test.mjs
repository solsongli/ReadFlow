import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRect,
  restoreRect,
  mergeRects,
  simplifyInk,
} from "../../src/features/paper-reader/domain/annotations/geometry.js";
import { remember, step } from "../../src/features/paper-reader/domain/annotations/history.js";
import { annotationsMarkdown } from "../../src/features/paper-reader/domain/annotations/export.js";
import {
  normalizeSemantics,
  DEFAULT_SEMANTICS,
} from "../../src/features/paper-reader/domain/annotations/types.js";
import { annotationMarkdown } from "../../src/features/paper-reader/domain/annotations/markdown.js";
test("annotation geometry round trips at zoom and clips to page bounds", () => {
  const page = { x: 30, y: 40, width: 600, height: 800 },
    rect = { x: 90, y: 120, width: 60, height: 16 };
  const restored = restoreRect(normalizeRect(rect, page), page);
  for (const key of Object.keys(rect)) assert.ok(Math.abs(restored[key] - rect[key]) < 1e-10);
  assert.deepEqual(normalizeRect({ x: 0, y: 0, width: 1000, height: 2000 }, page), {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
});
test("selection merges same line fragments without merging lines or columns", () => {
  const rect = (x, y, width = 0.03) => ({ x, y, width, height: 0.02 });
  const merged = mergeRects([rect(0.1, 0.1), rect(0.133, 0.1), rect(0.1, 0.13), rect(0.6, 0.1)]);
  assert.equal(merged.length, 3);
  assert.ok(merged[0].width > 0.06);
});
test("ink simplification preserves corners and endpoints", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0.1, y: 0.1 },
    { x: 0.2, y: 0.2 },
    { x: 0.3, y: 0.1 },
    { x: 0.4, y: 0 },
  ];
  assert.deepEqual(simplifyInk(points), [points[0], points[2], points[4]]);
});
test("session undo and redo invert batches and new edits clear redo", () => {
  const after = { id: "a" };
  const saved = remember({ past: [], future: [] }, [{ before: null, after }]);
  const undo = step(saved, false);
  assert.deepEqual(undo.changes, [{ before: after, after: null }]);
  assert.deepEqual(step(undo.history, true).changes, [{ before: null, after }]);
  assert.equal(remember(undo.history, [{ before: null, after }]).future.length, 0);
});
test("renamed semantics and citations appear in grouped Markdown", () => {
  const labels = normalizeSemantics({ ...DEFAULT_SEMANTICS, yellow: "待引用", blue: "" });
  assert.equal(labels.blue, "方法");
  const value = annotationsMarkdown(
    [
      {
        id: "a",
        color: "yellow",
        type: "highlight",
        page_index: 7,
        quote: "one\ntwo",
        note: "**note**",
        created_at: "today",
      },
    ],
    labels,
    "@zhang2025",
  );
  assert.match(value, /## 待引用/);
  assert.match(value, /第 8 页/);
  assert.match(value, /> one\n> two/);
  assert.match(value, /@zhang2025/);
});
test("annotation Markdown supports emphasis and never executes raw HTML or links", () => {
  const result = annotationMarkdown("**bold** <script>alert(1)</script> <img onerror=x> [x](javascript:x)");
  assert.match(result, /<strong>bold<\/strong>/);
  assert.ok(!result.includes("<script>") && !result.includes("<img") && !result.includes("<a"));
});
