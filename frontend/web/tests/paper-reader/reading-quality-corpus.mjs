import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readerBrowser } from "./browser.mjs";
import { setPaperTone } from "./controls.mjs";
const output = resolve(process.env.READFLOW_X11_OUTPUT_DIR || "/tmp/readflow-x11"),
  corpus = process.env.READFLOW_X11_CORPUS_DIR,
  results = [];
await mkdir(output, { recursive: true });
if (!corpus) {
  console.log("SKIP reading quality corpus: READFLOW_X11_CORPUS_DIR is not set");
  process.exit(0);
}
const performanceOnly = process.argv.includes("--performance");
const baseline = process.argv.includes("--baseline");
const plugins = baseline
  ? [
      {
        name: "prior-raster-density",
        setup(build) {
          build.onLoad({ filter: /paper-reader\/domain\/navigation\.ts$/ }, async ({ path }) => ({
            contents: (await readFile(path, "utf8")).replace("Math.max(1.75,", "Math.max(1,"),
            loader: "ts",
          }));
        },
      },
    ]
  : [];
for (const name of performanceOnly || baseline ? ["OpenVLA"] : ["OpenVLA", "SAM"]) {
  const folder = resolve(corpus, name);
  try {
    await Promise.all(
      ["source.pdf", "blocks.json", "translations.json", "selection.json"].map((file) =>
        access(resolve(folder, file)),
      ),
    );
  } catch {
    console.log(`SKIP ${name}: offline corpus files are unavailable`);
    continue;
  }
  const manifest = JSON.parse(await readFile(resolve(folder, "blocks.json"), "utf8"));
  const translations = JSON.parse(await readFile(resolve(folder, "translations.json"), "utf8"));
  const selection = JSON.parse(await readFile(resolve(folder, "selection.json"), "utf8"));
  for (const block of manifest.blocks) {
    const signature = JSON.stringify([block.id, selection.language, selection.fingerprint]);
    const value = translations[createHash("sha256").update(signature).digest("hex")];
    if (value) {
      block.translation = typeof value === "string" ? value : value.text;
      block.translation_runs = typeof value === "object" ? value.runs : undefined;
    }
  }
  const env = await readerBrowser(
    "?blocks&configured&x6&corpus=" + (name === "SAM" ? "2304.02643" : "2406.09246"),
    "tests/paper-reader/integration-fixture.tsx",
    { dpr: 1, plugins, pdf: resolve(folder, "source.pdf"), blocks: manifest },
  );
  const { page } = env;
  try {
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.evaluate(
      async ({ name, pages }) => {
        window.fixture.rows[0].title = name;
        window.fixture.rows[0].read_page = 1;
        window.fixture.rows[0].page_count = pages;
        await window.fixture.wb.refreshAll();
      },
      { name, pages: manifest.pages.length },
    );
    await page.getByRole("option", { name, exact: true }).dblclick();
    await page.waitForFunction(
      () => document.querySelector('[data-paper-page="1"]>canvas')?.style.visibility === "visible",
    );
    if (await page.getByRole("button", { name: "知道了", exact: true }).count())
      await page.getByRole("button", { name: "知道了", exact: true }).click();
    const firstPaint = Number(await page.locator("[data-paper-reader]").getAttribute("data-first-paint-ms"));
    await page.evaluate(() => window.fixture.wb.setPrefs({ marginNotes: false }));
    await page.getByRole("button", { name: "切换目录侧栏", exact: true }).click();
    await page.getByRole("button", { name: "切换信息面板", exact: true }).click();
    if (!performanceOnly) {
      if (name === "OpenVLA")
        for (const zoom of [1, 1.5, 2]) {
          await page.getByLabel("PDF 缩放", { exact: true }).selectOption(String(zoom));
          await page.waitForFunction(
            ({ z, ratio }) => {
              const c = document.querySelector('[data-paper-page="1"]>canvas');
              return c && c.width >= c.clientWidth * ratio && Math.abs(c.clientWidth - 612 * z) < 2;
            },
            { z: zoom, ratio: baseline ? 0.99 : 1.74 },
          );
          await page.screenshot({
            path: `${output}/OpenVLA-${zoom * 100}percent${baseline ? "-before" : ""}.png`,
          });
          const memory = await page.evaluate(() => ({
            bitmapBytes: [...document.querySelectorAll("[data-pdf-pane] canvas")].reduce(
              (s, c) => s + c.width * c.height * 4,
              0,
            ),
            jsHeap: performance.memory?.usedJSHeapSize,
            canvasSizes: [...document.querySelectorAll("[data-paper-page]>canvas")].map((c) => [
              c.width,
              c.height,
            ]),
          }));
          const cdp = await env.browser.newBrowserCDPSession();
          const processes = (await cdp.send("SystemInfo.getProcessInfo")).processInfo;
          const resident = await Promise.all(
            processes.map(async ({ id }) => {
              try {
                const status = await readFile(`/proc/${id}/status`, "utf8");
                return Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0);
              } catch {
                return 0;
              }
            }),
          );
          memory.chromeTotalRssMiB = resident.reduce((sum, kb) => sum + kb, 0) / 1024;
          await cdp.detach();
          results.push({ name, zoom, firstPaintMs: firstPaint, ...memory });
        }
      if (baseline) continue;
      await page.getByLabel("PDF 缩放", { exact: true }).selectOption("width");
      await page.evaluate(() => window.fixture.wb.setPrefs({ marginNotes: true, marginTranslations: true }));
      await page.locator('[data-margin-kind="translation"]').first().waitFor();
      for (const number of [1, name === "SAM" ? 4 : 3]) {
        const input = page.getByRole("spinbutton", { name: "页码" });
        await input.fill(String(number));
        await input.press("Enter");
        await page.locator(`[data-paper-page="${number}"] .pr-text-layer span`).first().waitFor();
        await page.screenshot({ path: `${output}/${name}-margins-p${number}.png` });
      }
      await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
      await setPaperTone(page, "night");
      await page.screenshot({ path: `${output}/${name}-margins-night.png` });
    } else {
      await page.getByLabel("PDF 缩放", { exact: true }).selectOption("width");
      await page.evaluate(() => window.fixture.wb.setPrefs({ marginNotes: true, marginTranslations: true }));
      await page.waitForTimeout(300);
      const metrics = await page.evaluate(async () => {
        const pane = document.querySelector('[aria-label="原文页面"]'),
          frames = [],
          tasks = [];
        let previous,
          maxBytes = 0,
          maxPages = 0,
          maxCards = 0;
        const observer = new PerformanceObserver((l) => tasks.push(...l.getEntries().map((e) => e.duration)));
        observer.observe({ type: "longtask" });
        for (let i = 0; i < 300; i++) {
          const t = await new Promise(requestAnimationFrame);
          if (previous) frames.push(t - previous);
          previous = t;
          pane.scrollTop = ((pane.scrollHeight - pane.clientHeight) * i) / 299;
          maxPages = Math.max(maxPages, pane.querySelectorAll("[data-paper-page]").length);
          maxCards = Math.max(maxCards, pane.querySelectorAll("[data-margin-entry]").length);
          maxBytes = Math.max(
            maxBytes,
            [...pane.querySelectorAll("canvas")].reduce((s, c) => s + c.width * c.height * 4, 0),
          );
        }
        observer.disconnect();
        frames.sort((a, b) => a - b);
        return {
          frames: frames.length,
          p50Ms: frames[Math.floor(frames.length * 0.5)],
          p95Ms: frames[Math.floor(frames.length * 0.95)],
          over33: frames.filter((n) => n > 33.4).length,
          longTasks: tasks.length,
          maxTaskMs: Math.max(0, ...tasks),
          maxPages,
          maxCards,
          maxBitmapMiB: maxBytes / 1048576,
        };
      });
      assert.ok(metrics.maxPages <= 6);
      results.push({ name, pages: 37, firstPaintMs: firstPaint, ...metrics });
    }
    assert.deepEqual(env.errors, []);
    assert.deepEqual(env.unexpected, []);
    console.log(
      "PASS",
      name,
      results.filter((r) => r.name === name),
    );
  } finally {
    await env.browser.close();
  }
}
await writeFile(
  `${output}/${performanceOnly ? "scroll-performance" : baseline ? "clarity-before" : "clarity"}.json`,
  JSON.stringify(results, null, 2),
);
