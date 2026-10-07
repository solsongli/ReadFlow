import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readerBrowser } from "./browser.mjs";
import { setPaperTone } from "./controls.mjs";

const corpus = process.env.READFLOW_X11_CORPUS_DIR || process.env.READFLOW_SMOKE_CORPUS_DIR;
if (!corpus) {
  console.log("SKIP alignment smoke: READFLOW_X11_CORPUS_DIR is unavailable");
  process.exit(0);
}
const output = process.env.READFLOW_X15_OUTPUT_DIR || resolve(corpus, "../out/x15");
const alignedRoot = process.env.READFLOW_X15_ALIGNED_DIR || resolve(corpus, "../out/x14b");
await mkdir(output, { recursive: true });
const measurements = [];

async function open(name) {
  const root = resolve(corpus, name);
  const aligned = resolve(alignedRoot, name, "translated-aligned.pdf");
  await Promise.all([access(`${root}/source.pdf`), access(`${root}/blocks.json`), access(aligned)]);
  const manifest = JSON.parse(await readFile(`${root}/blocks.json`, "utf8"));
  const env = await readerBrowser(
    "?blocks&configured&x6&x7",
    "tests/paper-reader/integration-fixture.tsx",
    { pdf: `${root}/source.pdf`, alignedPdf: aligned, blocks: manifest, dpr: 1 },
  );
  env.page.setDefaultTimeout(90000);
  await env.page.setViewportSize({ width: 1680, height: 1050 });
  env.manifest = manifest;
  return env;
}

async function jump(page, number) {
  const input = page.getByRole("spinbutton", { name: "页码", exact: true });
  await input.fill(String(number));
  await input.press("Enter");
  try {
    await page.waitForFunction(
      (value) =>
        document.querySelectorAll(`[data-pdf-pane] [data-paper-page="${value}"]`).length === 2,
      number,
      { timeout: 30000 },
    );
  } catch (error) {
    console.error(
      "alignment-jump",
      number,
      await page.evaluate(() =>
        [...document.querySelectorAll("[data-pdf-pane]")].map((pane) => ({
          label: pane.getAttribute("aria-label"),
          scrollTop: pane.scrollTop,
          pages: [...pane.querySelectorAll("[data-paper-page]")].map((node) => ({
            page: node.dataset.paperPage,
            canvas: node.querySelector("canvas")?.width,
            visibility: node.querySelector("canvas")?.style.visibility,
          })),
        })),
      ),
    );
    throw error;
  }
}

async function hoverLine(page, number, wait = true) {
  const paper = page.locator(`[aria-label="原文页面"] [data-paper-page="${number}"]`);
  const span = paper.locator(".pr-text-layer span:visible").first();
  await span.waitFor();
  const box = await span.boundingBox();
  for (let attempt = 0; attempt < (wait ? 120 : 1); attempt++) {
    await page.mouse.move(
      box.x + Math.min(12 + (attempt % 2), box.width / 2),
      box.y + box.height / 2,
    );
    if (!wait || (await page.locator("[data-alignment-guide]").count()) === 2) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`alignment guide did not appear on page ${number}`);
}

async function measurePaper(name, pages) {
  const env = await open(name);
  const { page, manifest } = env;
  try {
    await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
    await page.getByRole("button", { name: "对照", exact: true }).click();
    for (const zoom of ["1", "1.5", "width"]) {
      await page.getByLabel("PDF 缩放", { exact: true }).selectOption(zoom);
      for (const number of pages) {
        console.log("measure", name, zoom, number);
        await jump(page, number);
        await hoverLine(page, number);
        const boxes = await page.locator("[data-alignment-guide]").evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            return { top: box.top, height: box.height };
          }),
        );
        const delta = Math.abs(boxes[0].top - boxes[1].top);
        assert.ok(delta <= 1, `${name} p${number} ${zoom}: ${delta}px`);
        measurements.push({ paper: name, page: number, zoom, delta });
      }
    }
    await jump(page, pages[0]);
    await hoverLine(page, pages[0]);
    const translated = page.locator(`[aria-label="译文页面"] [data-paper-page="${pages[0]}"]`);
    const point = await translated.locator(".pr-text-layer span").first().boundingBox();
    await page.mouse.click(point.x + 4, point.y + point.height / 2);
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-alignment-guide][data-alignment-pinned="true"]').length === 2,
    );
    const before = await page.locator("[data-alignment-guide]").first().getAttribute("style");
    await page.keyboard.press("ArrowDown");
    const after = await page.locator("[data-alignment-guide]").first().getAttribute("style");
    assert.notEqual(after, before);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("[data-alignment-guide]").count(), 0);
    const paragraph = manifest.blocks
      .filter((block) => ["abstract", "text", "list", "caption"].includes(block.type))
      .flatMap((block) => block.anchors.map((anchor) => ({ block, anchor })))
      .find((value) => value.anchor.page === pages[0]);
    assert.ok(paragraph);
    const translatedBox = await translated.boundingBox();
    const rect = paragraph.anchor.view_bbox;
    await translated.dblclick({
      position: {
        x: ((rect[0] + rect[2]) / 2) * translatedBox.width,
        y: ((rect[1] + rect[3]) / 2) * translatedBox.height,
      },
    });
    await page.waitForFunction(() => document.querySelectorAll("[data-paragraph-guide]").length === 2);
    if (name === "OpenVLA") {
      await page.getByRole("button", { name: "更多阅读操作", exact: true }).click();
      await page.getByRole("menuitemcheckbox", { name: "对齐辅助线", exact: true }).click();
      assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().alignmentGuide), false);
      await hoverLine(page, pages[0], false);
      await page.waitForTimeout(100);
      assert.equal(await page.locator("[data-alignment-guide]").count(), 0);
      await page.reload();
      await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
      await page.getByRole("button", { name: "对照", exact: true }).click();
      assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().alignmentGuide), false);
      await page.getByRole("button", { name: "更多阅读操作", exact: true }).click();
      await page.getByRole("menuitemcheckbox", { name: "对齐辅助线", exact: true }).click();
      await jump(page, 3);
      await hoverLine(page, 3);
      await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
      await page.screenshot({ path: `${output}/OpenVLA-p3-dark.png`, animations: "disabled" });
    } else {
      await jump(page, 4);
      await hoverLine(page, 4);
      await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
      await setPaperTone(page, "night");
      await page.screenshot({ path: `${output}/SAM-p4-night.png`, animations: "disabled" });
    }
    assert.deepEqual(env.errors, []);
    assert.deepEqual(env.unexpected, []);
  } finally {
    await env.browser.close();
  }
}

await measurePaper("SAM", [2, 4, 8]);
await measurePaper("OpenVLA", [3, 5, 10]);

const plain = await readerBrowser("", "tests/paper-reader/fixture.tsx");
try {
  await plain.page.getByRole("button", { name: "对照", exact: true }).click();
  const paper = plain.page.locator('[aria-label="原文页面"] [data-paper-page="1"]');
  const box = await paper.boundingBox();
  await plain.page.mouse.move(box.x + box.width / 2, box.y + 100);
  assert.equal(await plain.page.locator("[data-alignment-guide]").count(), 0);
  assert.deepEqual(plain.errors, []);
  assert.deepEqual(plain.unexpected, []);
} finally {
  await plain.browser.close();
}

await writeFile(`${output}/sync-measurements.json`, JSON.stringify(measurements, null, 2));
console.log("PASS alignment guide, pin/keys, persistence, paragraphs, tones and 18 sync measurements");
