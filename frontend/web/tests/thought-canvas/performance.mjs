import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { readerBrowser } from "../paper-reader/browser.mjs";
const { browser, page, errors, unexpected } = await readerBrowser(
  "?canvas-large",
  "tests/thought-canvas/fixture.tsx",
);
try {
  await page.locator("[data-canvas-node]").first().waitFor();
  const result = await page.evaluate(async () => {
    const surface = document.querySelector('[aria-label="思考画布"]');
    const box = surface.getBoundingClientRect();
    const frames = [];
    let previous = performance.now(),
      maxNodes = 0,
      maxEdges = 0;
    for (let i = 0; i < 180; i++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      frames.push(now - previous);
      previous = now;
      surface.dispatchEvent(
        new WheelEvent("wheel", { deltaX: i < 90 ? 35 : -35, deltaY: 3, cancelable: true, bubbles: true }),
      );
      if (i % 15 === 0)
        surface.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: i < 90 ? 30 : -30,
            ctrlKey: true,
            clientX: box.x + 400,
            clientY: box.y + 250,
            cancelable: true,
            bubbles: true,
          }),
        );
      maxNodes = Math.max(maxNodes, surface.querySelectorAll("[data-canvas-node]").length);
      maxEdges = Math.max(maxEdges, surface.querySelectorAll("[data-edge]").length);
    }
    frames.sort((a, b) => a - b);
    return {
      frames: frames.length,
      medianMs: frames[90],
      p95Ms: frames[171],
      over50ms: frames.filter((n) => n > 50).length,
      maxNodes,
      maxEdges,
    };
  });
  assert.ok(result.maxNodes < 150);
  assert.ok(result.maxEdges < 150);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  const report = { nodes: 300, edges: 200, viewport: "1440x950", deviceScaleFactor: 2, ...result };
  await writeFile("/tmp/readflow-r3/performance.json", JSON.stringify(report, null, 2));
  console.log(report);
  await page.screenshot({ path: "/tmp/readflow-r3/screenshots/large-canvas.png" });
} finally {
  await browser.close();
}
