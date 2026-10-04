import test from "node:test";
import assert from "node:assert/strict";
import { ellipsize, wrapLines } from "../../src/features/thought-canvas/domain/text-wrap.js";

// Monospace stand-in for canvas measureText: every character is 1 unit wide.
const measure = (value) => [...value].length;

test("PNG export wraps Latin text at word boundaries without leading spaces", () => {
  const lines = wrapLines("As these models continue to evolve, they become", 20, measure);
  assert.deepEqual(lines, ["As these models", "continue to evolve,", "they become"]);
  for (const line of lines) {
    assert.ok(line.length <= 20);
    assert.equal(line, line.trim());
  }
});

test("PNG export breaks CJK per character and keeps explicit newlines", () => {
  assert.deepEqual(wrapLines("视觉语言动作模型\n安全", 4, measure), ["视觉语言", "动作模型", "安全"]);
  assert.deepEqual(wrapLines("RLHF 方法很有效", 7, measure), ["RLHF 方法", "很有效"]);
});

test("only a word wider than the card is split inside the word", () => {
  assert.deepEqual(wrapLines("a supercalifragilistic b", 10, measure), ["a", "supercalif", "ragilistic", "b"]);
});

test("line limit ends with an ellipsis that still fits", () => {
  const lines = wrapLines("one two three four five six seven eight", 9, measure, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
  assert.ok(measure(lines[1]) <= 9);
});

test("ellipsize truncates long source titles instead of compressing them", () => {
  assert.equal(ellipsize("short", 10, measure), "short");
  const value = ellipsize("SafeVLA: Towards Safety Alignment · 第 1 页", 16, measure);
  assert.ok(value.endsWith("…"));
  assert.ok(measure(value) <= 16);
  assert.deepEqual(wrapLines("", 10, measure), [""]);
});
