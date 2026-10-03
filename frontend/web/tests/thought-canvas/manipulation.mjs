import assert from "node:assert/strict";
import { readerBrowser } from "../paper-reader/browser.mjs";
const { browser, page, errors, unexpected, canvases } = await readerBrowser(
  "?canvas-large",
  "tests/thought-canvas/fixture.tsx",
);
const data = () => canvases.documents.get("large");
const surface = page.getByLabel("思考画布", { exact: true });
const root = page.locator("[data-thought-canvas]");
async function settle() {
  await page.waitForTimeout(500);
}
async function drag(a, b) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}
try {
  await root.locator("[data-canvas-node]").first().waitFor();
  const a = root.locator('[data-canvas-node="node-1"]'),
    b = root.locator('[data-canvas-node="node-2"]');
  await a.click({ position: { x: 30, y: 30 } });
  await page.keyboard.down("Shift");
  await b.click({ position: { x: 30, y: 30 } });
  await page.keyboard.up("Shift");
  assert.equal(await root.locator("[data-selected=true]").count(), 2);
  await page.getByRole("button", { name: "左对齐", exact: true }).click();
  await settle();
  assert.equal(data().nodes.find((n) => n.id === "node-1").x, data().nodes.find((n) => n.id === "node-2").x);
  await page.getByRole("button", { name: "撤销画布操作", exact: true }).click();
  await settle();
  assert.notEqual(
    data().nodes.find((n) => n.id === "node-1").x,
    data().nodes.find((n) => n.id === "node-2").x,
  );
  console.log("PASS shift multi-select aligns and undo restores positions");
  const pane = await surface.boundingBox();
  // Full containment marquee across two rows.
  await drag({ x: pane.x + 330, y: pane.y + 15 }, { x: pane.x + 960, y: pane.y + 470 });
  assert.ok((await root.locator("[data-selected=true]").count()) >= 2);
  const before = data().nodes.length;
  await surface.focus();
  await page.keyboard.press("Control+d");
  await settle();
  assert.ok(data().nodes.length > before);
  await page.keyboard.press("Control+z");
  await settle();
  assert.equal(data().nodes.length, before);
  console.log("PASS marquee selection and real duplication undo");
  const card = root.locator('[data-canvas-node="node-1"]');
  await card.hover();
  const handle = await card.getByRole("button", { name: "调整卡片尺寸" }).boundingBox();
  const width = data().nodes.find((n) => n.id === "node-1").width;
  await drag({ x: handle.x + 8, y: handle.y + 8 }, { x: handle.x + 70, y: handle.y + 30 });
  await settle();
  assert.ok(data().nodes.find((n) => n.id === "node-1").width > width);
  console.log("PASS pointer resize saves node dimensions");
  const old = await card.boundingBox();
  await surface.focus();
  await page.keyboard.down("Space");
  await drag({ x: pane.x + 400, y: pane.y + 210 }, { x: pane.x + 450, y: pane.y + 250 });
  await page.keyboard.up("Space");
  const moved = await card.boundingBox();
  assert.ok(moved.x > old.x + 40);
  console.log("PASS space-drag pan moves the viewport without changing nodes");
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log("PASS 4 manipulation scenarios");
} catch (error) {
  await page.screenshot({ path: "/tmp/readflow-r3/screenshots/manipulation-failure.png" });
  throw error;
} finally {
  await browser.close();
}
