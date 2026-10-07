import assert from "node:assert/strict";
import test from "node:test";
import { dueLabel, isOverdue, localDay, moveId, partition } from "@/features/todos/domain/model.js";

const todo = (id, extra = {}) => ({ id, title: id, done: false, position: 1, due: null, item_id: null, item_title: null,
  created_at: "2026-10-07T00:00:00Z", updated_at: "2026-10-07T00:00:00Z", done_at: null, ...extra });

test("due dates are plain local days with relative labels", () => {
  assert.equal(localDay(new Date(2026, 9, 7, 23, 59)), "2026-10-07");
  assert.equal(dueLabel(null, "2026-10-07"), "");
  assert.equal(dueLabel("2026-10-07", "2026-10-07"), "今天");
  assert.equal(dueLabel("2026-10-08", "2026-10-07"), "明天");
  assert.equal(dueLabel("2026-10-06", "2026-10-07"), "昨天");
  assert.equal(dueLabel("2026-10-01", "2026-10-07"), "逾期 6 天");
  assert.equal(dueLabel("2026-12-24", "2026-10-07"), "12月24日");
  assert.equal(dueLabel("2027-01-03", "2026-12-30"), "2027/1/3");
  // Month and year boundaries count calendar days, not 24-hour spans.
  assert.equal(dueLabel("2026-11-01", "2026-10-31"), "明天");
  assert.equal(dueLabel("2025-12-31", "2026-01-01"), "昨天");
});

test("only open to-dos with a past due day are overdue", () => {
  assert.equal(isOverdue(todo("a", { due: "2026-10-06" }), "2026-10-07"), true);
  assert.equal(isOverdue(todo("a", { due: "2026-10-07" }), "2026-10-07"), false);
  assert.equal(isOverdue(todo("a", { due: "2026-10-06", done: true }), "2026-10-07"), false);
  assert.equal(isOverdue(todo("a"), "2026-10-07"), false);
});

test("open items keep manual order; completed items list newest first", () => {
  const { open, done } = partition([
    todo("c", { position: 3 }), todo("a", { position: 1 }),
    todo("x", { done: true, done_at: "2026-10-07T08:00:00Z" }), todo("y", { done: true, done_at: "2026-10-07T09:00:00Z" }),
    todo("b", { position: 2 }),
  ]);
  assert.deepEqual(open.map((t) => t.id), ["a", "b", "c"]);
  assert.deepEqual(done.map((t) => t.id), ["y", "x"]);
});

test("moving a to-do clamps to the list and reports no-ops", () => {
  assert.deepEqual(moveId(["a", "b", "c"], "c", 1), ["a", "c", "b"]);
  assert.deepEqual(moveId(["a", "b", "c"], "a", 9), ["b", "c", "a"]);
  assert.equal(moveId(["a", "b", "c"], "a", -1), null);
  assert.equal(moveId(["a", "b", "c"], "missing", 0), null);
});
