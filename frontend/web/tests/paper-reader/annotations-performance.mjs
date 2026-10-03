import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { readerBrowser } from "./browser.mjs";
const { browser, page, errors, unexpected } = await readerBrowser("?large&annotations=500");
try {
  await page.getByRole("tab", { name: "批注", exact: true }).click();
  await page.getByText("共 500 条 · 本页 5 条", { exact: true }).waitFor();
  const first = Number(await page.locator("[data-paper-reader]").getAttribute("data-first-paint-ms"));
  const sample = await page.evaluate(async () => {
    const target = document.querySelector("[data-pdf-pane]");
    const frames = [];
    let previous = performance.now(),
      maxMarks = 0,
      maxCanvas = 0;
    for (let frame = 0; frame < 180; frame++) {
      await new Promise(requestAnimationFrame);
      const time = performance.now();
      frames.push(time - previous);
      previous = time;
      target.scrollTop = (frame / 180) * (target.scrollHeight - target.clientHeight);
      maxMarks = Math.max(maxMarks, document.querySelectorAll("[data-annotation-id]").length);
      maxCanvas = Math.max(maxCanvas, document.querySelectorAll("[data-pdf-pane] canvas").length);
    }
    frames.sort((a, b) => a - b);
    return {
      frames: frames.length,
      medianMs: frames[90],
      p95Ms: frames[171],
      over50ms: frames.filter((n) => n > 50).length,
      maxMarks,
      maxCanvas,
    };
  });
  assert.ok(sample.maxMarks <= 30);
  assert.ok(sample.maxCanvas <= 6);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  const result = { pages: 100, annotations: 500, deviceScaleFactor: 2, firstCanvasMs: first, ...sample };
  await writeFile("/tmp/readflow-r2/performance.json", JSON.stringify(result, null, 2));
  console.log(result);
} finally {
  await browser.close();
}
