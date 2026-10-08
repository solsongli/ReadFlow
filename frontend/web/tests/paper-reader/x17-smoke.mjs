import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { readerBrowser } from "./browser.mjs";

const corpus = process.env.READFLOW_X11_CORPUS_DIR || process.env.READFLOW_SMOKE_CORPUS_DIR;
const output = process.env.READFLOW_X17_OUTPUT_DIR || (corpus ? resolve(corpus, "../out/x17") : "/tmp/readflow-x17");
await mkdir(output, { recursive: true });
const env = await readerBrowser("?annotations=3&margins");
const { page, annotations } = env;
try {
  await page.getByRole("tab", { name: "批注", exact: true }).click();
  const panel = page.getByLabel("批注列表", { exact: true });
  const cards = panel.locator("[data-annotation-card]");
  const firstCard = cards.filter({ hasText: "Synthetic annotation 0" });
  const firstTag = firstCard.getByLabel("添加批注标签", { exact: true });
  await firstTag.fill("方法论");
  await firstTag.press("Enter");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-annotation-card]")].some(
      (card) => card.textContent?.includes("Synthetic annotation 0") && card.textContent.includes("方法论"),
    ),
  );
  const secondCard = cards.filter({ hasText: "Synthetic annotation 1" });
  const secondTag = secondCard.getByLabel("添加批注标签", { exact: true });
  await secondTag.fill("方");
  assert.equal(await secondCard.locator('option[value="方法论"]').count(), 1);
  await secondTag.fill("复现");
  await secondTag.press("Enter");
  await panel.getByRole("button", { name: "方法论", exact: true }).click();
  await panel.getByRole("button", { name: "复现", exact: true }).click();
  assert.equal(await cards.count(), 2);
  assert.equal(await page.locator("[data-margin-note]").count(), 3);
  await panel.getByLabel("页边批注跟随筛选", { exact: true }).check();
  await page.waitForFunction(() => document.querySelectorAll("[data-margin-note]").length === 2);
  const search = panel.getByLabel("搜索批注", { exact: true });
  await search.fill("Synthetic annotation 1");
  assert.equal(await cards.count(), 1);
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await cards.first().dispatchEvent("dragstart", { dataTransfer: transfer });
  const payload = await transfer.evaluate((value) => ({
    plain: value.getData("text/plain"),
    html: value.getData("text/html"),
    canvas: value.getData("application/x-readflow-canvas"),
  }));
  assert.match(payload.plain, /“Synthetic annotation 1” —— Zhang et al\., 2025, p\. 1/u);
  assert.match(payload.html, /^<p>/u);
  assert.doesNotMatch(payload.html, /href|readflow:/u);
  assert.equal(JSON.parse(payload.canvas).type, "annotation");
  await cards.first().getByRole("button", { name: "批注操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "复制为引文", exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), payload.plain);
  await page.screenshot({ path: `${output}/annotations-tags-light.png`, animations: "disabled" });
  await page.evaluate(() => {
    let fullscreen = null;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreen });
    document.documentElement.requestFullscreen = async () => {
      fullscreen = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    document.exitFullscreen = async () => {
      fullscreen = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
  });
  await page.getByLabel("原文页面", { exact: true }).focus();
  await page.keyboard.press("F11");
  await page.locator('[data-paper-reader][data-fullscreen="true"]').waitFor();
  assert.equal(await page.locator('[data-paper-reader]').getAttribute("data-focus"), "true");
  await page.keyboard.press("Escape");
  await page.locator('[data-paper-reader][data-fullscreen="false"]').waitFor();
  await page.evaluate(() => document.documentElement.dataset.wbTheme = "dark");
  await page.screenshot({ path: `${output}/annotations-tags-dark.png`, animations: "disabled" });
  assert.deepEqual(annotations().find((row) => row.id === "seed-0")?.tags, ["方法论"]);
  assert.deepEqual(env.errors, []);
  assert.deepEqual(env.unexpected, []);
  console.log("PASS X17 annotation tags, filters, drag citation and browser fullscreen");
} finally {
  await env.browser.close();
}
