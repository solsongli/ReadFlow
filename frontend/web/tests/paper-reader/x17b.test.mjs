import test from "node:test";
import assert from "node:assert/strict";
import { renderQueue } from "../../src/features/paper-reader/state/document.js";

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

test("background indexing is exclusive but never blocks newly queued visible rendering", async () => {
  const queue = renderQueue();
  const release = queue.acquireBackground();
  assert.equal(typeof release, "function");
  assert.equal(queue.acquireBackground(), null);
  let rendered = false;
  queue.run(async () => {
    rendered = true;
  });
  await turn();
  assert.equal(rendered, true);
  assert.deepEqual(queue.metrics(), {
    running: 0,
    queued: 0,
    background: true,
    backgroundStarted: 1,
    backgroundCompleted: 0,
    maximum: 1,
    completed: 1,
  });
  release();
  await turn();
  assert.equal(queue.metrics().completed, 1);
});

test("background indexing cannot start while visible rendering is active", async () => {
  const queue = renderQueue();
  let finish;
  queue.run(() => new Promise((resolve) => (finish = resolve)));
  assert.equal(queue.acquireBackground(), null);
  finish();
  await turn();
  const release = queue.acquireBackground();
  assert.equal(typeof release, "function");
  release();
});

test("visible low-resolution pages run before buffered and high-resolution work", async () => {
  const queue = renderQueue();
  let release;
  queue.run(() => new Promise((resolve) => (release = resolve)), 9);
  const order = [];
  queue.run(async () => void order.push("high-resolution"), 1);
  queue.run(async () => void order.push("buffer-preview"), 3);
  queue.run(async () => void order.push("visible-preview"), 5);
  release();
  await turn();
  await turn();
  await turn();
  assert.deepEqual(order, ["visible-preview", "buffer-preview", "high-resolution"]);
});
