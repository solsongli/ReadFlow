import test from "node:test";
import assert from "node:assert/strict";
import { buildVirtualList, virtualWindow, rowScrollTarget, libraryRowHeight } from "../../src/features/workbench/domain/virtual-list.ts";
const rows = Array.from({ length: 2000 }, (_, i) => ({ id: String(i), title: `Paper ${i}`, title_translated: i % 2 ? "中文题名" : "", group_ids: i % 3 ? ["a", "b"] : [] }));
const groups = [{ id: "a", name: "Alpha", parent_id: null }, { id: "b", name: "Beta", parent_id: null }];
test("2000 mixed-height rows render a bounded viewport plus buffer at every scroll position", () => {
  const list = buildVirtualList(rows, groups, "list", "bilingual", null, []);
  assert.equal(list.entries.length, 2000); assert.equal(list.order.length, 2000);
  assert.equal(list.height, 1000 * (60 + 81));
  for (let top = 0; top < list.height; top += 813) {
    const window = virtualWindow(list, top, 720);
    assert.ok(window.indices.length < 25);
    const visible = list.entries.filter((row) => row.top < top + 720 && row.top + row.height > top);
    assert.ok(visible.every((row) => window.indices.some((i) => list.entries[i] === row)));
  }
});
test("compact row geometry and offscreen keyboard targets remain deterministic", () => {
  const list = buildVirtualList(rows, [], "list", "compact", null, []);
  assert.equal(libraryRowHeight(rows[0], "compact"), 36);
  assert.equal(list.height, 72000);
  const target = rowScrollTarget(list, "1999", 0, 720);
  assert.equal(target, 71280);
  assert.ok(virtualWindow(list, target, 720).indices.includes(1999));
  assert.equal(rowScrollTarget(list, "0", target, 720), 0);
});
test("grouped membership repeats rows, deduplicates selection order, and retains sticky section headers", () => {
  const list = buildVirtualList(rows, groups, "grouped", "bilingual", null, []);
  assert.equal(list.entries.filter((entry) => entry.kind === "row" && entry.row.id === "1").length, 2);
  assert.equal(list.order.length, 2000);
  const second = list.entries[list.headers[1]];
  const edge = virtualWindow(list, second.top - 10, 720, 0);
  assert.equal(edge.sticky, 0); assert.equal(edge.stickyTop, second.top - 32);
  const deep = virtualWindow(list, second.top + 20000, 720);
  assert.equal(deep.sticky, list.headers[1]); assert.ok(deep.indices.includes(list.headers[1]));
});
test("collapsed sections leave no phantom rows or keyboard selection targets", () => {
  const scoped = buildVirtualList(rows, groups, "grouped", "bilingual", "a", ["a"]);
  const header = scoped.entries.find((entry) => entry.kind === "header" && entry.sectionId === "a");
  assert.equal(header.collapsed, true);
  assert.equal(scoped.entries.filter((entry) => entry.kind === "row" && entry.sectionId === "a").length, 0);
  assert.equal(buildVirtualList([], [], "list", "bilingual", null, []).height, 0);
  assert.deepEqual(virtualWindow({ entries: [], headers: [], height: 0, order: [] }, 0, 0).indices, []);
});
