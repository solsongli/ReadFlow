import { setPaperTone } from "../paper-reader/controls.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { readerBrowser } from "../paper-reader/browser.mjs";
const output = "/tmp/readflow-x6/screenshots";
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile("tests/fixtures/blocks/manifest.json", "utf8"));
const env = await readerBrowser("?blocks&configured&x6", "tests/paper-reader/integration-fixture.tsx");
const { page } = env;
const button = (name) => page.getByRole("button", { name, exact: true });
async function jump(number) {
  const input = page.getByRole("spinbutton", { name: "页码" });
  await input.fill(String(number));
  await input.press("Enter");
  await page.locator(`[data-paper-page="${number}"] .pr-text-layer span`).first().waitFor();
}
async function point(block) {
  const a = block.anchors[0];
  return page.locator(`[data-paper-page="${a.page}"]`).evaluate((el, box) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + ((box[0] + box[2]) / 2) * r.width, y: r.top + ((box[1] + box[3]) / 2) * r.height };
  }, a.view_bbox);
}
try {
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await jump(1);
  if (await button("知道了").count()) await button("知道了").click();
  await button("原位").click();
  await page.locator('[data-reading-mode="inline"]').waitFor();
  const translated = manifest.blocks.find((b, i) => b.page === 1 && b.type === "text" && i % 3 !== 2);
  const missing = manifest.blocks.find((b, i) => b.page === 1 && b.type === "text" && i % 3 === 2);
  await page.locator(`[data-inline-block="${translated.id}"]`).first().waitFor();
  assert.equal(await page.locator(`[data-inline-block="${missing.id}"]`).count(), 0);
  for (const tone of ["white", "sepia", "night"]) {
    await setPaperTone(page, tone);
    await page.screenshot({ path: `${output}/inline-${tone}.png`, animations: "disabled" });
  }
  await page.evaluate(() => window.fixture.wb.setPrefs({ blockImageText: false }));
  await page.locator(".pb-label-text").first().waitFor({ state: "detached" });
  await page.evaluate(() => window.fixture.wb.setPrefs({ blockImageText: true }));
  await page.locator(".pb-label-text").first().waitFor();
  await page.keyboard.down("Alt");
  await page.waitForFunction(
    () => document.querySelector('[data-inline-layer="1"]').dataset.inlineHidden === "true",
  );
  await page.keyboard.up("Alt");
  await page.waitForFunction(
    () => document.querySelector('[data-inline-layer="1"]').dataset.inlineHidden === "false",
  );
  let p = await point(translated);
  await page.mouse.click(p.x, p.y);
  await page.locator(`[data-inline-block="${translated.id}"]`).first().waitFor({ state: "detached" });
  await page.mouse.click(p.x, p.y);
  await page.locator(`[data-inline-block="${translated.id}"]`).first().waitFor();
  const span = page
    .locator('[data-paper-page="1"] .pr-text-layer span')
    .filter({ hasText: translated.text.slice(0, 20) })
    .first();
  await span.scrollIntoViewIfNeeded();
  const rect = await span.boundingBox();
  await page.mouse.move(rect.x + 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + Math.min(rect.width - 2, 120), rect.y + rect.height / 2, { steps: 12 });
  await page.mouse.up();
  const original = await page.evaluate(() => getSelection().toString());
  assert.ok(original.trim() && !original.includes("译"));
  assert.equal(await page.getByRole("dialog", { name: "块译文", exact: true }).count(), 0);
  const selectionTools = page.getByRole("toolbar", { name: "选中文字工具条" });
  await selectionTools.getByRole("button", { name: "重要", exact: true }).click();
  await page.locator("[data-annotation-id]").first().waitFor();
  assert.ok(env.annotations().at(-1).quote.includes(original.trim()));
  await page
    .getByRole("region", { name: "编辑批注" })
    .getByRole("button", { name: "收起", exact: true })
    .click();
  await page.evaluate(() => getSelection().removeAllRanges());
  await jump(1);
  await page.locator('.pr-link[aria-label="文内链接"]').first().click();
  await page.waitForFunction(() => document.querySelector('input[name="page"]').value === "3");
  await button("后退").click();
  await page.waitForFunction(() => document.querySelector('input[name="page"]').value === "1");
  const restored = page.locator('[data-paper-page="1"] .pr-image-colors');
  assert.equal(await restored.evaluate((e) => getComputedStyle(e).filter), "none");
  assert.equal(await restored.evaluate((e) => getComputedStyle(e).display), "block");
  await page.getByRole("tab", { name: "译文", exact: true }).click();
  const entry = page.locator(`[data-sidebar-block="${translated.id}"]`);
  await entry.hover();
  await page.locator(`[data-block-hover="${translated.id}"]`).first().waitFor();
  await entry.locator("button").first().click();
  const card = page.getByRole("dialog", { name: "块译文", exact: true });
  await card.waitFor();
  const before = await card.getAttribute("data-block-card");
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(
    (text) => document.querySelector('[aria-label="块译文"]').dataset.blockCard !== text,
    before,
  );
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await card.waitFor({ state: "hidden" });
  await page.getByLabel("原文页面", { exact: true }).focus();
  const top = await page.getByLabel("原文页面", { exact: true }).evaluate((e) => e.scrollTop);
  await page.keyboard.press("ArrowDown");
  assert.ok((await page.getByLabel("原文页面", { exact: true }).evaluate((e) => e.scrollTop)) > top);
  await jump(1);
  await page.getByRole("tab", { name: "译文", exact: true }).click();
  await button("复制本页译文").click();
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes("离线验收"));
  const untranslated = page.locator(`[data-sidebar-block="${missing.id}"]`);
  await untranslated.getByRole("button", { name: "翻译这一块", exact: true }).click();
  assert.equal(env.blocks.requests().at(-1).block_id, missing.id);
  await button("翻译全文").click();
  assert.equal(env.blocks.requests().at(-1).block_id, undefined);
  await button("取消翻译").click();
  await jump(2);
  await page
    .getByLabel("本页译文", { exact: true })
    .getByText(/^第 2 页/)
    .waitFor();
  await button("原文").click();
  const figure = manifest.blocks.find((b) => b.type === "figure" && b.asset);
  await jump(figure.page);
  p = await point(figure);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
  await page.mouse.up();
  const viewer = page.getByRole("dialog", { name: "图表放大", exact: true });
  await viewer.waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-label="图表放大"] canvas')?.width > 0);
  const image = viewer.locator("[data-vector-asset]");
  const bounds = await image.boundingBox();
  await page.mouse.move(bounds.x + 50, bounds.y + 50);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 90, bounds.y + 80, { steps: 5 });
  await page.mouse.up();
  assert.ok((await image.boundingBox()).x > bounds.x + 30);
  await viewer.getByRole("button", { name: "放大", exact: true }).click();
  await viewer.getByText("120%", { exact: true }).waitFor();
  await viewer.getByRole("button", { name: "图内译文", exact: true }).click();
  await page.screenshot({ path: output + "/figure-viewer.png", animations: "disabled" });
  await page.keyboard.press("Escape");
  await viewer.waitFor({ state: "hidden" });
  assert.deepEqual(env.errors, []);
  assert.deepEqual(env.unexpected, []);
  console.log(
    "PASS inline modes/tones, partial coverage, Alt/toggle, sidebar/clipboard/single-full, block arrows, vector viewer",
  );
} catch (error) {
  await page.screenshot({ path: output + "/failure.png" });
  console.error("Page errors", env.errors, "unexpected requests", env.unexpected);
  throw error;
} finally {
  await env.browser.close();
}
