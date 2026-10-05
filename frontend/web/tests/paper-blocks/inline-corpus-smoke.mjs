import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readerBrowser } from "../paper-reader/browser.mjs";
const root = process.env.READFLOW_CORPUS_DIR || "/home/lsy/Documents/LeoProjetcs/Retainpdf/readflow-corpus";
const output = "/tmp/readflow-x6/screenshots";
await mkdir(output, { recursive: true });
const steady = process.argv.includes("--steady");
const sourceOnly = process.argv.includes("--source");
const performanceOnly = process.argv.includes("--performance");
const results = [];
for (const [identity, title, pages] of performanceOnly
  ? [["2406.09246", "OpenVLA", [1]]]
  : [
      ["2406.09246", "OpenVLA", [1, 2]],
      ["2303.04137", "Diffusion Policy", [2, 4]],
    ]) {
  const env = await readerBrowser(
    `?blocks&configured&x6&corpus=${identity}`,
    "tests/paper-reader/integration-fixture.tsx",
  );
  const { page, context } = env;
  try {
    await page.setViewportSize({ width: 1680, height: 1050 });
    const pdf = await readFile(`${root}/${identity}.pdf`);
    await context.route("**/api/research/attachments/*/pdf", (route) =>
      route.fulfill({ body: pdf, contentType: "application/pdf" }),
    );
    await page.evaluate(async (name) => {
      window.fixture.rows[0].title = name;
      await window.fixture.wb.refreshAll();
    }, title);
    await page.getByRole("option", { name: title, exact: true }).dblclick();
    const jump = async (number) => {
      const input = page.getByRole("spinbutton", { name: "页码" });
      await input.fill(String(number));
      await input.press("Enter");
      await page.waitForFunction((p) => {
        const canvas = document.querySelector(`[data-paper-page="${p}"] > canvas`);
        return canvas?.style.visibility === "visible" && canvas.width > 0;
      }, number);
    };
    await jump(1);
    if (await page.getByRole("button", { name: "知道了", exact: true }).count())
      await page.getByRole("button", { name: "知道了", exact: true }).click();
    const start = Date.now();
    if (!sourceOnly) {
      await page.getByRole("button", { name: "原位", exact: true }).click();
      await page.locator("[data-inline-block] .pb-fitted-content").first().waitFor();
    }
    const switchMs = Date.now() - start;
    for (const number of pages) {
      await jump(number);
      await page.getByRole("tab", { name: "译文", exact: true }).click();
      if (!performanceOnly)
        await page.screenshot({
          path: `${output}/${identity}-inline-p${number}.png`,
          animations: "disabled",
        });
    }
    if (!performanceOnly) {
      await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
      await page.getByLabel("页面底色", { exact: true }).selectOption("night");
      await page.screenshot({ path: `${output}/${identity}-inline-night.png`, animations: "disabled" });
    } else {
      const measure = await page.evaluate(async (count) => {
        const pane = document.querySelector('[aria-label="原文页面"]');
        const samples = [],
          tasks = [];
        const observer = new PerformanceObserver((list) =>
          tasks.push(...list.getEntries().map((e) => e.duration)),
        );
        observer.observe({ type: "longtask", buffered: false });
        let previous,
          maximumPages = 0,
          maximumLayers = 0;
        const maximum = pane.scrollHeight - pane.clientHeight;
        for (let i = 0; i < count; i++) {
          const now = await new Promise(requestAnimationFrame);
          if (previous != null) samples.push(now - previous);
          previous = now;
          pane.scrollTop = (maximum * i) / (count - 1);
          maximumPages = Math.max(maximumPages, document.querySelectorAll("[data-paper-page]").length);
          maximumLayers = Math.max(maximumLayers, document.querySelectorAll("[data-inline-layer]").length);
        }
        observer.disconnect();
        samples.sort((a, b) => a - b);
        return {
          frames: samples.length,
          medianMs: samples[Math.floor(samples.length / 2)],
          p95Ms: samples[Math.floor(samples.length * 0.95)],
          over33Ms: samples.filter((n) => n > 33.4).length,
          maximumPages,
          maximumLayers,
          longTasks: tasks.length,
          maxTaskMs: Math.max(0, ...tasks),
          firstPaintMs: Number(document.querySelector("[data-paper-reader]").dataset.firstPaintMs),
        };
      }, steady ? 600 : 240);
      results.push({ paper: identity, pages: 37, switchMs, ...measure });
      assert.ok(measure.maximumPages <= 6);
      assert.equal(measure.maximumLayers, sourceOnly ? 0 : measure.maximumPages);
    }
    assert.deepEqual(env.errors, []);
    assert.deepEqual(env.unexpected, []);
    console.log("PASS", identity, performanceOnly ? results.at(-1) : "fake inline screenshots");
  } finally {
    await env.browser.close();
  }
}
if (performanceOnly) await writeFile(`/tmp/readflow-x6/performance${sourceOnly ? "-source" : steady ? "-steady" : ""}.json`, JSON.stringify(results, null, 2));
