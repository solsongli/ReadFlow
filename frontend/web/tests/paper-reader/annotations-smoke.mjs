import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readerBrowser } from "./browser.mjs";
const { browser, page, errors, unexpected, annotations, generatedNotes } = await readerBrowser();
const output = "/tmp/readflow-r2/screenshots";
await mkdir(output, { recursive: true });
const checks = [];
async function check(name, run) {
  await run();
  checks.push(name);
  console.log("PASS", name);
}
const button = (name) => page.getByRole("button", { name, exact: true });
async function select() {
  await page
    .locator("[data-annotation-source=true] .pr-text-layer span")
    .filter({ hasText: "We follow" })
    .first()
    .evaluate((span) => {
      const range = document.createRange();
      range.selectNodeContents(span);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
  await page.getByRole("toolbar", { name: "选中文字工具条" }).waitFor();
}
async function waitCount(number) {
  await page.waitForFunction((n) => document.querySelectorAll("[data-annotation-id]").length === n, number);
}
async function point(x, y) {
  const box = await page.locator('[data-annotation-source=true] [data-paper-page="1"]').boundingBox();
  return { x: box.x + box.width * x, y: box.y + box.height * y };
}
async function drag(a, b) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}
try {
  await check("five semantic selection colors and underline", async () => {
    for (const [i, label] of ["重要", "方法", "结论 / 结果", "疑问 / 存疑", "概念 / 术语"].entries()) {
      await select();
      await page
        .getByRole("toolbar", { name: "选中文字工具条" })
        .getByRole("button", { name: label, exact: true })
        .click();
      await waitCount(i + 1);
      await page
        .getByRole("region", { name: "编辑批注" })
        .getByRole("button", { name: "收起", exact: true })
        .click();
    }
    await select();
    await page
      .getByRole("toolbar", { name: "选中文字工具条" })
      .getByRole("button", { name: "下划线", exact: true })
      .click();
    await waitCount(6);
    assert.equal(annotations().at(-1).type, "underline");
  });
  await check("annotation note editing and safe Markdown preview", async () => {
    const edit = page.getByRole("region", { name: "编辑批注" });
    await edit.getByRole("textbox", { name: "编辑批注说明" }).fill("**Method** <img onerror=alert(1)>");
    await edit.getByRole("button", { name: "保存说明", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('[aria-label="说明预览"] strong')?.textContent === "Method",
    );
    assert.equal(await page.locator('[aria-label="说明预览"] img').count(), 0);
    await edit.getByRole("button", { name: "收起", exact: true }).click();
  });
  await check("sticky placement dragging and hover expansion", async () => {
    await button("便签").click();
    const p = await point(0.82, 0.2);
    await page.mouse.click(p.x, p.y);
    await waitCount(7);
    const edit = page.getByRole("region", { name: "编辑批注" });
    await edit.getByRole("textbox", { name: "编辑批注说明" }).fill("Margin thought");
    await edit.getByRole("button", { name: "保存说明" }).click();
    await edit.getByRole("button", { name: "收起", exact: true }).click();
    await button("选择").click();
    const row = annotations().find((r) => r.type === "sticky"),
      before = row.rects[0].x;
    await drag(await point(0.83, 0.21), await point(0.9, 0.25));
    await page.waitForTimeout(200);
    assert.ok(annotations().find((r) => r.id === row.id).rects[0].x > before);
    await page.locator(`[data-annotation-id="${row.id}"]`).hover();
    await page.getByRole("tooltip").getByText("Margin thought", { exact: true }).waitFor();
  });
  await check("region captures original canvas PNG", async () => {
    await button("框选").click();
    await drag(await point(0.35, 0.4), await point(0.6, 0.48));
    await waitCount(8);
    assert.match(annotations().at(-1).image, /^data:image\/png;base64,/);
  });
  await check("ink eraser and session undo redo", async () => {
    await button("手写").click();
    await drag(await point(0.65, 0.33), await point(0.8, 0.38));
    await waitCount(9);
    const ink = annotations().find((r) => r.type === "ink");
    assert.ok(ink.ink.length >= 2);
    await button("橡皮").click();
    await page.locator(`[data-annotation-id="${ink.id}"] polyline`).click();
    await waitCount(8);
    await button("撤销批注").click();
    await waitCount(9);
    await button("重做批注").click();
    await waitCount(8);
    await page.getByLabel("原文页面", { exact: true }).focus();
    await page.keyboard.press("Control+z");
    await waitCount(9);
  });
  await check("annotation panel filters jumps exports and creates a free note", async () => {
    await page.getByRole("tab", { name: "批注", exact: true }).click();
    const panel = page.getByLabel("批注列表", { exact: true });
    await panel.getByLabel("批注筛选", { exact: true }).getByRole("button", { name: "便签", exact: true }).click();
    assert.equal(await panel.locator("[data-annotation-card]").count(), 1);
    await panel.getByRole("button", { name: /第 1 页/ }).click();
    await page.locator("[data-flash=true]").waitFor();
    await panel.getByRole("button", { name: "全部", exact: true }).click();
    const cancel = panel.getByRole("button", { name: "取消选择", exact: true });
    if (await cancel.count()) await cancel.click();
    const download = page.waitForEvent("download");
    await panel.getByRole("button", { name: "导出 Markdown", exact: true }).click();
    assert.match((await download).suggestedFilename(), /批注/);
    await panel.getByRole("button", { name: "整理成笔记", exact: true }).click();
    await page.getByText("已整理成笔记，可在笔记空间继续编辑。").waitFor();
    assert.match(generatedNotes[0], /## 重要/);
    assert.match(generatedNotes[0], /> We follow/);
    await page.screenshot({ path: output + "/annotations-light.png" });
  });
  await check("night mode and source-only compare annotation layer", async () => {
    await page.getByRole("combobox", { name: "页面底色" }).selectOption("night");
    await page.screenshot({ path: output + "/annotations-night.png" });
    await button("对照").click();
    await page.getByLabel("译文页面", { exact: true }).locator(".pr-text-layer span").first().waitFor();
    assert.equal(await page.getByLabel("译文页面", { exact: true }).locator(".pr-annotations").count(), 0);
    assert.ok((await page.getByLabel("原文页面", { exact: true }).locator(".pr-annotations").count()) > 0);
    await button("译文").click();
    assert.equal(await page.locator(".pr-annotations").count(), 0);
    assert.equal(await button("高亮").isDisabled(), true);
  });
  await check("tool shortcuts auto-highlight and geometry survives zoom", async () => {
    await button("原文").click();
    const input = page.getByRole("spinbutton", { name: "页码" });
    await input.fill("1");
    await input.press("Enter");
    await page.getByLabel("原文页面", { exact: true }).focus();
    await page.keyboard.press("h");
    await page.keyboard.press("3");
    await select();
    await page
      .locator("[data-annotation-source=true] .pr-text-layer span")
      .filter({ hasText: "We follow" })
      .first()
      .dispatchEvent("pointerup");
    await waitCount(10);
    const added = annotations().at(-1);
    assert.equal(added.color, "green");
    await button("放大 PDF").click();
    await page.waitForTimeout(200);
    const placement = await page
      .locator(`[data-annotation-id="${added.id}"] rect`)
      .first()
      .evaluate((rect) => {
        const mark = rect.getBoundingClientRect();
        const paper = rect.closest("[data-paper-page]").getBoundingClientRect();
        return { x: (mark.x - paper.x) / paper.width, y: (mark.y - paper.y) / paper.height };
      });
    assert.ok(Math.abs(placement.x - added.rects[0].x) < 0.001);
    assert.ok(Math.abs(placement.y - added.rects[0].y) < 0.001);
    await button("选择").click();
  });
  await check("bulk recolor delete and undo", async () => {
    const panel = page.getByLabel("批注列表", { exact: true });
    const clear = panel.getByRole("button", { name: "取消选择", exact: true });
    if (await clear.count()) await clear.click();
    const boxes = panel.locator("[data-annotation-card] input[type=checkbox]");
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await panel.getByRole("button", { name: "概念 / 术语", exact: true }).click();
    await page.waitForTimeout(200);
    assert.equal(annotations()[0].color, "purple");
    assert.equal(annotations()[1].color, "purple");
    await panel.getByRole("button", { name: "删除所选", exact: true }).click();
    await panel.getByRole("button", { name: "确认删除", exact: true }).click();
    await waitCount(8);
    await button("撤销批注").click();
    await waitCount(10);
    await page.getByRole("combobox", { name: "页面底色" }).selectOption("auto");
    const input = page.getByRole("spinbutton", { name: "页码" });
    await input.fill("1");
    await input.press("Enter");
    await page.screenshot({ path: output + "/annotations-overview.png" });
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  await writeFile("/tmp/readflow-r2/scenarios.json", JSON.stringify({ checks, errors, unexpected }, null, 2));
  console.log(`PASS ${checks.length}`);
} catch (error) {
  await page.screenshot({ path: output + "/failure.png" });
  console.log({ errors, unexpected });
  throw error;
} finally {
  await browser.close();
}
