import { setPaperTone } from "./controls.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readerBrowser } from "./browser.mjs";
const root = process.env.READFLOW_CORPUS_DIR || "/home/lsy/Documents/LeoProjetcs/Retainpdf/readflow-corpus";
const output = "/tmp/readflow-x9/screenshots";
await mkdir(output, { recursive: true });
const performanceOnly = process.argv.includes("--performance");
const results = [];
for (const [identity, title] of performanceOnly ? [["2406.09246", "OpenVLA"]] :
  [["2406.09246", "OpenVLA"], ["2304.02643", "Segment Anything"]]) {
  const env = await readerBrowser(`?blocks&configured&x6&x9&corpus=${identity}`, "tests/paper-reader/integration-fixture.tsx");
  const { page, context } = env;
  try {
    await page.setViewportSize({ width: 1680, height: 1050 });
    const pdf = await readFile(`${root}/${identity}.pdf`);
    await context.route("**/api/research/attachments/*/pdf", route => route.fulfill({ body: pdf, contentType: "application/pdf" }));
    await page.evaluate(async name => {
      window.fixture.rows[0].title = name;
      window.fixture.rows[0].read_page = 1;
      await window.fixture.wb.refreshAll();
    }, title);
    await page.getByRole("option", { name: title, exact: true }).dblclick();
    await page.waitForFunction(() => document.querySelector('[data-paper-page="1"] > canvas')?.style.visibility === "visible");
    if (await page.getByRole("button", { name: "知道了", exact: true }).count())
      await page.getByRole("button", { name: "知道了", exact: true }).click();
    await page.locator("[data-term-mark]").first().waitFor();
    if (!performanceOnly) {
      await page.getByRole("tab", { name: "图表", exact: true }).click();
      await page.getByRole("tab", { name: "译文", exact: true }).click();
      await page.screenshot({ path: `${output}/${identity}-figures-source.png` });
      const mark = page.locator('[data-paper-page="1"] [data-term-mark]').first();
      await mark.scrollIntoViewIfNeeded();
      const rect = await mark.boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.getByRole("dialog", { name: "术语释义" }).waitFor();
      await page.screenshot({ path: `${output}/${identity}-term-hover.png` });
      await page.mouse.move(0, 0);
      await page.getByRole("tab", { name: "目录", exact: true }).click();
      await page.getByRole("button", { name: "原位", exact: true }).click();
      await page.locator("[data-inline-block] .pb-fitted-content").first().waitFor();
      await page.screenshot({ path: `${output}/${identity}-outline-inline.png` });
      await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
      await setPaperTone(page,"night");
      await page.screenshot({ path: `${output}/${identity}-night.png` });
    } else {
      // Same document/window, sequential disabled/enabled passes, no background test jobs.
      for (const termHover of [false, true]) {
        await page.evaluate(value => window.fixture.wb.setPrefs({ termHover: value }), termHover);
        await page.getByLabel("原文页面", { exact: true }).evaluate(e => { e.scrollTop = 0; });
        await page.waitForTimeout(400);
        const metrics = await page.evaluate(async () => {
          const pane = document.querySelector('[aria-label="原文页面"]');
          const samples = [];
          let previous, maximumPages = 0, marks = 0;
          const maximum = pane.scrollHeight - pane.clientHeight;
          for (let i = 0; i < 420; i++) {
            const now = await new Promise(requestAnimationFrame);
            if (previous != null) samples.push(now - previous);
            previous = now;
            pane.scrollTop = maximum * i / 419;
            maximumPages = Math.max(maximumPages, document.querySelectorAll("[data-paper-page]").length);
            marks = Math.max(marks, document.querySelectorAll("[data-term-mark]").length);
          }
          samples.sort((a, b) => a - b);
          return { frames: samples.length, medianMs: samples[Math.floor(samples.length / 2)],
            p95Ms: samples[Math.floor(samples.length * .95)], over33Ms: samples.filter(n => n > 33.4).length,
            maximumPages, maximumMarks: marks,
            firstPaintMs: Number(document.querySelector("[data-paper-reader]").dataset.firstPaintMs) };
        });
        assert.ok(metrics.maximumPages <= 6);
        results.push({ paper: title, pages: 37, termHover, ...metrics });
      }
    }
    assert.deepEqual(env.errors, []);
    assert.deepEqual(env.unexpected, []);
    console.log("PASS", identity, performanceOnly ? results : "offline screenshots");
  } finally { await env.browser.close(); }
}
if (performanceOnly) await writeFile("/tmp/readflow-x9/performance.json", JSON.stringify(results, null, 2));
