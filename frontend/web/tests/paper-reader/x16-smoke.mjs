import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readerBrowser } from "./browser.mjs";
import { setPaperTone } from "./controls.mjs";

const outputRoot = process.env.READFLOW_X16_OUTPUT_DIR;
const corpus = process.env.READFLOW_X11_CORPUS_DIR || process.env.READFLOW_SMOKE_CORPUS_DIR;
const output = outputRoot || (corpus ? resolve(corpus, "../out/x16") : "/tmp/readflow-x16");
await mkdir(output, { recursive: true });

const base = await readerBrowser();
try {
  const { page } = base;
  await page.locator("[data-pdf-pane]").first().focus();
  await page.keyboard.press("Control+f");
  const search = page.getByRole("textbox", { name: "搜索论文", exact: true });
  await search.fill("Evidence");
  await page.getByText(/1 \/ [1-9]\d* 处/).waitFor();
  await page.getByLabel("区分大小写", { exact: true }).check();
  await page.getByText("无结果", { exact: true }).waitFor();
  await page.getByLabel("区分大小写", { exact: true }).uncheck();
  await search.fill("flow");
  await page.getByText(/1 \/ [1-9]\d* 处/).waitFor();
  await page.getByLabel("全词匹配", { exact: true }).check();
  await page.getByText("无结果", { exact: true }).waitFor();
  await page.getByLabel("全词匹配", { exact: true }).uncheck();
  await search.fill("Reproducible evidence");
  const count = page.locator('[aria-live="polite"]').filter({ hasText: /处/ });
  await page.getByText(/1 \/ [1-9]\d* 处/).waitFor();
  const total = Number((await count.textContent()).match(/\/\s*(\d+)/)?.[1]);
  assert.ok(total > 0);
  await search.press("Shift+Enter");
  await page.getByText(new RegExp(`${total} / ${total} 处`)).waitFor();
  await page.locator(".pr-search-hit").first().waitFor();
  await search.press("Enter");
  await page.getByText(new RegExp(`1 / ${total} 处`)).waitFor();
  await page.getByRole("button", { name: "译文", exact: true }).click();
  await search.fill("Translated");
  await page.getByText(/1 \/ [1-9]\d* 处/).waitFor();
  await page.getByRole("button", { name: "原文", exact: true }).click();
  const input = page.getByRole("spinbutton", { name: "页码", exact: true });
  await input.fill("1");
  await input.press("Enter");
  await page.locator('.pr-link[aria-label="文内链接"]').first().hover();
  const preview = page.getByRole("dialog", { name: "引用预览", exact: true });
  await preview.waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-label="引用预览"] canvas')?.width > 0);
  await page.screenshot({ path: `${output}/link-preview.png`, animations: "disabled" });
  assert.deepEqual(base.errors, []);
  assert.deepEqual(base.unexpected, []);
} finally {
  await base.browser.close();
}

const zoom = await readerBrowser("?blocks&configured&x6&x7", "tests/paper-reader/integration-fixture.tsx");
try {
  const { page } = zoom;
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await page.getByLabel("PDF 缩放", { exact: true }).selectOption("1.5");
  await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().readerZooms.a === 1.5);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: '关闭「Paper a」', exact: true }).click();
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  assert.equal(await page.getByLabel("PDF 缩放", { exact: true }).inputValue(), "1.5");
  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  assert.equal(await page.getByLabel("PDF 缩放", { exact: true }).inputValue(), "1.5");
  assert.deepEqual(zoom.errors, []);
  assert.deepEqual(zoom.unexpected, []);
} finally {
  await zoom.browser.close();
}

async function corpusReader(name) {
  const root = resolve(corpus, name);
  const aligned = resolve(corpus, `../out/x14b/${name}/translated-aligned.pdf`);
  await Promise.all([access(`${root}/source.pdf`), access(`${root}/blocks.json`), access(aligned)]);
  const blocks = JSON.parse(await readFile(`${root}/blocks.json`, "utf8"));
  const env = await readerBrowser(
    "?blocks&configured&x6&x7",
    "tests/paper-reader/integration-fixture.tsx",
    { pdf: `${root}/source.pdf`, alignedPdf: aligned, blocks, dpr: 1 },
  );
  env.page.setDefaultTimeout(90000);
  await env.page.setViewportSize({ width: 1680, height: 1050 });
  return env;
}

if (corpus) {
  const sam = await corpusReader("SAM");
  try {
    const { page } = sam;
    await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
    await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
    await setPaperTone(page, "night");
    await page.locator('.pr-link[aria-label="文内链接"]').first().hover();
    const preview = page.getByRole("dialog").filter({ has: page.locator("canvas") }).first();
    await preview.waitFor();
    await page.waitForFunction(() => document.querySelector('[role="dialog"] canvas')?.width > 0);
    await page.screenshot({ path: `${output}/SAM-link-preview-night.png`, animations: "disabled" });
    assert.deepEqual(sam.errors, []);
    assert.deepEqual(sam.unexpected, []);
  } finally {
    await sam.browser.close();
  }

  const openvla = await corpusReader("OpenVLA");
  try {
    const { page } = openvla;
    await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
    await page.locator("[data-pdf-pane]").first().focus();
    await page.keyboard.press("Control+f");
    await page.getByRole("textbox", { name: "搜索论文", exact: true }).fill("policy");
    await page.getByLabel("全词匹配", { exact: true }).check();
    await page.getByText(/[1-9]\d* 处/).waitFor();
    await page.waitForFunction(
      () => !document.querySelector('[aria-live="polite"]')?.textContent?.includes("索引中"),
    );
    await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
    await page.screenshot({ path: `${output}/OpenVLA-search-dark.png`, animations: "disabled" });
    await page.locator("[data-pdf-pane]").first().focus();
    await page.keyboard.press("f");
    await page.waitForTimeout(750);
    const performance = await page.evaluate(async () => {
      const pane = document.querySelector('[aria-label="原文页面"]');
      const samples = [];
      let previous;
      const maximum = pane.scrollHeight - pane.clientHeight;
      for (let index = 0; index < 120; index++) {
        await new Promise(requestAnimationFrame);
        pane.scrollTop = (maximum * index) / 119;
      }
      pane.scrollTop = 0;
      for (let index = 0; index < 4; index++) await new Promise(requestAnimationFrame);
      for (let index = 0; index < 240; index++) {
        const now = await new Promise(requestAnimationFrame);
        if (previous != null) samples.push(now - previous);
        previous = now;
        pane.scrollTop = (maximum * index) / 239;
      }
      samples.sort((left, right) => left - right);
      return {
        p50: samples[Math.floor(samples.length * 0.5)],
        p95: samples[Math.floor(samples.length * 0.95)],
        frames: samples.length,
      };
    });
    assert.ok(performance.p50 <= 17.5, JSON.stringify(performance));
    assert.ok(performance.p95 <= 50.1, JSON.stringify(performance));
    await writeFile(`${output}/performance.json`, JSON.stringify(performance, null, 2));
    assert.deepEqual(openvla.errors, []);
    assert.deepEqual(openvla.unexpected, []);
  } finally {
    await openvla.browser.close();
  }
}

console.log("PASS X16 search, target preview, per-paper zoom, corpus screenshots and scroll performance");
