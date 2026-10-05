import assert from "node:assert/strict";
import { readerBrowser } from "../paper-reader/browser.mjs";
const env = await readerBrowser("?blocks&configured&x6&x7", "tests/paper-reader/integration-fixture.tsx");
const { page } = env;
const button = (name) => page.getByRole("button", { name, exact: true });
const paths = [];
page.on("request", (request) => paths.push(new URL(request.url()).pathname));
async function ready(label) {
  await page.waitForFunction((name) => {
    const pane = document.querySelector(`[data-pdf-pane][aria-label="${name}"]`);
    return (
      pane &&
      [...pane.querySelectorAll("[data-paper-page] > canvas")].some(
        (c) => c.width && c.style.visibility === "visible",
      )
    );
  }, label);
}
try {
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await ready("原文页面");
  if (await button("知道了").count()) await button("知道了").click();
  const format = page.getByLabel("译文版式", { exact: true });
  assert.equal(await format.inputValue(), "layout");
  await button("译文").click();
  await ready("译文页面");
  assert.ok(paths.some((p) => p.endsWith("translated-layout.pdf")));
  await page.screenshot({ path: "/tmp/readflow-x7/screenshots/layout-view.png", animations: "disabled" });
  await format.selectOption("reflow");
  await ready("译文页面");
  await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().translationFormat === "reflow");
  assert.ok(paths.some((p) => p.endsWith("translated.pdf")));
  await page.screenshot({ path: "/tmp/readflow-x7/screenshots/reflow-view.png", animations: "disabled" });
  await page.reload();
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await ready("原文页面");
  assert.equal(await format.inputValue(), "reflow");
  await format.selectOption("layout");
  await button("译文").click();
  await ready("译文页面");
  await button("对照").click();
  await ready("原文页面");
  await ready("译文页面");
  const input = page.getByRole("spinbutton", { name: "页码" });
  await input.fill("2");
  await input.press("Enter");
  await page.getByText("原版式译文 · 同页同位置对齐", { exact: true }).waitFor();
  await page.getByLabel("原文页面", { exact: true }).evaluate((e) => e.scrollBy({ top: 180 }));
  await page.waitForFunction(() => {
    const panes = [...document.querySelectorAll("[data-pdf-pane]")];
    return panes.length === 2 && Math.abs(panes[0].scrollTop - panes[1].scrollTop) < 1;
  });
  await page.screenshot({ path: "/tmp/readflow-x7/screenshots/aligned-compare.png", animations: "disabled" });
  for (const [label, path] of [
    ["原版式 PDF（推荐）", "translated-layout.pdf"],
    ["重排 PDF", "translated.pdf"],
    ["LaTeX 工程", "/latex"],
  ]) {
    await button("导出译文").click();
    const before = paths.length;
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: label, exact: true }).click();
    await download;
    assert.ok(
      paths.slice(before).some((p) => p.endsWith(path)),
      label,
    );
  }
  env.blocks.legacy();
  await button("生成原版式").waitFor();
  assert.equal(await format.inputValue(), "reflow");
  await button("生成原版式").click();
  await page.waitForFunction(() => document.querySelector('[aria-label="译文版式"]')?.value === "layout");
  await button("仅重新排版").click();
  await page.waitForFunction(() => document.querySelector('[aria-label="译文版式"]')?.value === "layout");
  assert.equal(env.blocks.requests().at(-1).render_only, true);
  assert.equal(env.blocks.requests().at(-1).attachment_id, "a");
  assert.equal(env.blocks.requests().at(-1).translation, undefined);
  await button("原位").click();
  await input.fill("1");
  await input.press("Enter");
  const heading = page.locator('[data-paper-page="1"] [data-inline-heading="true"]').first();
  await heading.waitFor();
  const style = await heading.evaluate((e) => ({
    base: Number(e.dataset.originalSize),
    size: parseFloat(getComputedStyle(e.firstElementChild).fontSize),
    weight: getComputedStyle(e.firstElementChild).fontWeight,
  }));
  assert.ok(Math.abs(style.size - style.base) < 0.1);
  assert.equal(style.weight, "700");
  const label = page.locator('[data-paper-page="1"] .pb-label-text').first();
  await label.waitFor();
  const at = await label.boundingBox();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  const tooltip = await page.locator('[data-paper-page="1"]').getAttribute("title");
  assert.ok(tooltip.includes("完整悬停提示"));
  await page.screenshot({
    path: "/tmp/readflow-x7/screenshots/inline-heading-label.png",
    animations: "disabled",
  });
  await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
  await page.screenshot({ path: "/tmp/readflow-x7/screenshots/inline-dark.png", animations: "disabled" });
  assert.deepEqual(env.errors, []);
  assert.deepEqual(env.unexpected, []);
  console.log(
    "PASS layout/reflow choice, exact page/offset sync, three exports, offline rerender, native-size bold headings, label tooltip",
  );
} catch (error) {
  console.error(env.errors, env.unexpected);
  await page.screenshot({ path: "/tmp/readflow-x7/screenshots/failure.png" });
  throw error;
} finally {
  await env.browser.close();
}
