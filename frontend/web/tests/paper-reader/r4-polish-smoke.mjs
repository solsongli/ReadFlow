import assert from "node:assert/strict";
import { readerBrowser } from "./browser.mjs";
function luminance(css) {
  const values = css
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map((v) => Number(v) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
let env = await readerBrowser("", "tests/paper-reader/integration-fixture.tsx");
try {
  const page = env.page;
  await page.getByRole("button", { name: "新建画布", exact: true }).click();
  await page.getByRole("textbox", { name: "画布名称", exact: true }).fill("Reader layout");
  await page.getByRole("button", { name: "保存画布", exact: true }).click();
  await page
    .getByRole("navigation", { name: "阅读器标签页" })
    .getByRole("button", { name: "文献库", exact: true })
    .click();
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await page.getByRole("combobox", { name: "阅读器布局" }).selectOption("split");
  const dock = page.getByLabel("停靠画布", { exact: true }).filter({ visible: true });
  const title = await dock.getByRole("combobox", { name: "当前画布", exact: true }).boundingBox();
  const add = await dock.getByRole("button", { name: "添加画布元素", exact: true }).boundingBox();
  const full = await dock.getByRole("button", { name: "全屏打开", exact: true }).boundingBox();
  assert.ok(Math.abs(title.y + title.height / 2 - add.y - add.height / 2) < 4);
  assert.ok(Math.abs(full.y + full.height / 2 - add.y - add.height / 2) < 4);
  await page.screenshot({ path: "/tmp/readflow-r4/screenshots/split-toolbar.png" });
  assert.deepEqual(env.errors, []);
  assert.deepEqual(env.unexpected, []);
  console.log("PASS single-row dock toolbar");
} finally {
  await env.browser.close();
}
env = await readerBrowser("?canvas-large", "tests/thought-canvas/fixture.tsx");
try {
  const page = env.page;
  await page.locator(".tc-edge-label").first().waitFor();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => (document.documentElement.dataset.wbTheme = value), theme);
    await page.waitForTimeout(180);
    const colors = await page
      .locator(".tc-edge-label")
      .first()
      .evaluate((el) => ({ text: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
    const a = luminance(colors.text),
      b = luminance(colors.bg),
      ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(ratio >= 4.5);
    console.log(theme, "label contrast", ratio.toFixed(2));
  }
  await page.screenshot({ path: "/tmp/readflow-r4/screenshots/dark-edge-labels.png" });
  assert.deepEqual(env.errors, []);
  assert.deepEqual(env.unexpected, []);
  console.log("PASS labelled edges in light and dark modes");
} finally {
  await env.browser.close();
}
