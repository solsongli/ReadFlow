import { canvasMarkdown } from "../../src/features/thought-canvas/domain/markdown.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  world,
  screen,
  zoomAt,
  hit,
  marquee,
  contains,
  edgePath,
  snap,
  align,
  moveNodes,
  visibleNodes,
} from "../../src/features/thought-canvas/domain/geometry.js";
import { outline } from "../../src/features/thought-canvas/domain/outline.js";
import { difference, remember, travel } from "../../src/features/thought-canvas/domain/history.js";
import { parseDrop } from "../../src/features/thought-canvas/domain/drag.js";
const node = (id, x, y, type = "sticky") => ({ id, x, y, width: 100, height: 80, type, text: id });
test("screen/world coordinates and pointer anchored zoom round trip", () => {
  const view = { x: 40, y: -20, zoom: 1.5 },
    point = { x: 100, y: 200 };
  assert.deepEqual(screen(world(point, view), view), point);
  assert.deepEqual(world(point, zoomAt(view, point, 2)), world(point, view));
});
test("hit testing marquee and group inclusion use full bounding boxes", () => {
  const nodes = [node("a", 0, 0), node("b", 50, 50)];
  assert.equal(hit(nodes, { x: 60, y: 60 }).id, "b");
  const rect = marquee({ x: 200, y: 200 }, { x: -10, y: -10 });
  assert.equal(contains(rect, nodes[1]), true);
  assert.equal(contains(nodes[0], nodes[1]), false);
});
test("curved edges leave boundaries instead of traversing card centers", () => {
  const a = node("a", 0, 0),
    b = node("b", 400, 200);
  const route = edgePath(a, b);
  assert.match(route.path, /^M 100 40 C/);
  assert.match(route.path, /, 400 240$/);
});
test("grid snapping group movement and align/distribution preserve unselected nodes", () => {
  const nodes = [node("a", 10, 20), node("b", 230, 90), node("c", 600, 80)];
  assert.equal(snap(31, true), 40);
  assert.deepEqual(
    align(nodes, ["a", "b"], "left").map((n) => n.x),
    [10, 10, 600],
  );
  assert.deepEqual(
    align(nodes, ["a", "b"], "top").map((n) => n.y),
    [20, 20, 80],
  );
  const distributed = align(nodes, ["a", "b", "c"], "distribute");
  assert.equal(distributed[1].x, 305);
  const group = { ...node("group", 0, 0, "group"), width: 400, height: 300 };
  const moved = moveNodes([group, ...nodes], ["group"], { x: 30, y: 40 }, false);
  assert.equal(moved[1].x, 40);
  assert.equal(moved[3].x, 600);
  const offsetGroup = { ...group, x: 3 };
  const snapped = moveNodes([offsetGroup, node("child", 13, 20)], ["group"], { x: 11, y: 0 }, true);
  assert.equal(snapped[1].x - snapped[0].x, 10);
});
test("outline groups nodes in spatial order and includes citations and relationships", () => {
  const data = {
    name: "Related work",
    nodes: [
      node("b", 100, 100),
      node("a", 0, 50),
      { ...node("group", -20, -20, "group"), width: 400, height: 400, text: "Method" },
      {
        ...node("quote", 10, 150, "excerpt"),
        quote: "Evidence",
        text: "My idea",
        item_id: "paper",
        title: "Paper",
        page: 8,
        citekey: "zhang2025",
      },
    ],
    edges: [{ id: "edge", from_id: "a", to_id: "b", label: "对比", style: "arrow" }],
  };
  const text = outline(data);
  assert.ok(text.indexOf("- a") < text.indexOf("- b"));
  assert.match(text, /## Method/);
  assert.match(text, /第 8 页 · @zhang2025/);
  assert.match(text, /a —对比→ b/);
});
test("undo redo returns snapshots and diff emits only changed nodes", () => {
  const first = { id: "canvas", name: "test", nodes: [node("a", 0, 0)], edges: [] };
  const next = { ...first, nodes: [node("a", 20, 0), node("b", 200, 0)] };
  const h = remember({ past: [], future: [] }, first);
  const undone = travel(h, next, false);
  assert.deepEqual(undone.target, first);
  assert.deepEqual(travel(undone.history, first, true).target, next);
  assert.deepEqual(difference(next, first).delete_nodes, ["b"]);
});
test("300 nodes are culled and untrusted drag payloads are narrowed", () => {
  const nodes = Array.from({ length: 300 }, (_, i) =>
    node(String(i), (i % 20) * 300, Math.floor(i / 20) * 240),
  );
  assert.ok(visibleNodes(nodes, { x: 0, y: 0, zoom: 1 }, 1000, 700).length < 30);
  assert.equal(parseDrop('{"type":"execute","itemId":"a"}'), null);
  assert.equal(
    parseDrop(JSON.stringify({ type: "annotation", itemId: "a", annotationId: "note" })).annotationId,
    "note",
  );
});

test("canvas Markdown supports headings and lists without HTML or unsafe link execution", () => {
  const html = canvasMarkdown(
    "# Idea\n- **Evidence**\n\n<script>x</script> [bad](javascript:alert(1)) ![picture](https://example.org/a.png)",
  );
  assert.match(html, /<h1>Idea<\/h1>/);
  assert.match(html, /<strong>Evidence<\/strong>/);
  assert.ok(!html.includes("<script>") && !html.includes("<img") && !html.includes('href="javascript:'));
});
