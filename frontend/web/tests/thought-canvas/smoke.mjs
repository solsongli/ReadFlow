import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readerBrowser } from "../paper-reader/browser.mjs";
const { browser, page, errors, unexpected, canvases, annotations } = await readerBrowser(
  "",
  "tests/paper-reader/integration-fixture.tsx",
);
const output = "/tmp/readflow-r3/screenshots";
await mkdir(output, { recursive: true });
const checks = [];
async function check(name, run) {
  await run();
  checks.push(name);
  console.log("PASS", name);
}
const button = (name) => page.getByRole("button", { name, exact: true });
const surface = () => page.locator('[aria-label="思考画布"]:visible').last();
const canvas = () => [...canvases.documents.values()][0];
async function select() {
  const source = page
    .locator("[data-annotation-source=true]:visible .pr-text-layer span")
    .filter({ hasText: "We follow" })
    .first();
  await source.waitFor();
  await source.evaluate((span) => {
    const range = document.createRange();
    range.selectNodeContents(span);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
  });
  await page.getByRole("toolbar", { name: "选中文字工具条" }).waitFor();
  return source;
}
async function go(pageNumber) {
  const input = page.getByRole("spinbutton", { name: "页码" });
  await input.fill(String(pageNumber));
  await input.press("Enter");
}
async function dragDrop(source, target, payload) {
  const data = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer: data });
  if (payload)
    await data.evaluate((dt, p) => dt.setData("application/x-readflow-canvas", JSON.stringify(p)), payload);
  const box = await target.boundingBox();
  await target.dispatchEvent("dragover", { dataTransfer: data, clientX: box.x + 120, clientY: box.y + 120 });
  await target.dispatchEvent("drop", { dataTransfer: data, clientX: box.x + 120, clientY: box.y + 120 });
  await source.dispatchEvent("dragend", { dataTransfer: data }).catch(() => {});
  await data.dispose();
}
async function waitNodes(number) {
  await page.waitForFunction(
    (n) => document.querySelectorAll('[aria-label="思考画布"]:not([hidden]) [data-canvas-node]').length >= n,
    number,
  );
  await page.waitForTimeout(400);
}
try {
  await check("canvas creation and shared full-screen tab", async () => {
    await button("新建画布").click();
    await page.getByRole("textbox", { name: "画布名称", exact: true }).fill("第二章 · 相关工作");
    await button("保存画布").click();
    await surface().waitFor();
    assert.equal(canvases.documents.size, 1);
    await page
      .getByRole("navigation", { name: "阅读器标签页" })
      .getByRole("button", { name: "文献库", exact: true })
      .click();
    await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
    await go(1);
  });
  await check("R2 popup anchors inside PDF and new annotations do not start bulk selection", async () => {
    await select();
    await page
      .getByRole("toolbar", { name: "选中文字工具条" })
      .getByRole("button", { name: "重要", exact: true })
      .click();
    const popup = page.getByRole("region", { name: "编辑批注" });
    await popup.waitFor();
    const p = await popup.boundingBox(),
      paper = await page.getByLabel("原文页面", { exact: true }).boundingBox();
    assert.ok(p.x >= paper.x && p.x + p.width <= paper.x + paper.width + 1);
    await page.screenshot({ path: output + "/r2-popover.png" });
    await page.getByRole("tab", { name: "批注", exact: true }).click();
    assert.equal(await page.getByText("已选 1 条", { exact: false }).count(), 0);
    await page.getByLabel("原文页面", { exact: true }).evaluate((el) => {
      el.scrollTop += 30;
    });
    await popup.waitFor({ state: "hidden" });
    await go(1);
  });
  await check("R2 pill filters and explicit two-checkbox bulk selection", async () => {
    await select();
    await page
      .getByRole("toolbar", { name: "选中文字工具条" })
      .getByRole("button", { name: "方法", exact: true })
      .click();
    const popup = page.getByRole("region", { name: "编辑批注" });
    await popup.getByRole("button", { name: "收起", exact: true }).click();
    const panel = page.getByLabel("批注列表", { exact: true });
    assert.equal(await panel.locator("select").count(), 0);
    await panel.getByRole("button", { name: "筛选方法", exact: true }).click();
    assert.equal(await panel.locator("[data-annotation-card]").count(), 1);
    await panel.getByRole("button", { name: "全部", exact: true }).click();
    await panel.locator("input[type=checkbox]").nth(0).check();
    assert.equal(await panel.getByText(/已选 1 条/).count(), 0);
    await panel.locator("input[type=checkbox]").nth(1).check();
    await panel.getByText(/已选 2 条/).waitFor();
    await page.screenshot({ path: output + "/r2-pills-multiselect.png" });
    await panel.getByRole("button", { name: "取消选择", exact: true }).click();
  });
  await check("selected-text drop creates a linked highlight and excerpt", async () => {
    await page.getByRole("combobox", { name: "阅读器布局" }).selectOption("split");
    await surface().waitFor();
    const before = annotations().length;
    await dragDrop(await select(), surface());
    await waitNodes(1);
    assert.equal(annotations().length, before + 1);
    assert.equal(canvas().nodes.length, 1);
    assert.ok(canvas().nodes[0].annotation_id);
    await page.screenshot({ path: output + "/split.png" });
  });
  await check("source link returns and flashes, badge locates canvas card", async () => {
    const card = surface().locator("[data-canvas-node]").first();
    await card.getByRole("button", { name: /Paper a · 第 1 页/ }).click();
    await page.locator("[data-flash=true]").first().waitFor();
    const badge = page.getByRole("button", { name: /打开批注所在画布/ }).first();
    await badge.waitFor();
    await badge.click();
    await surface().locator("[data-canvas-node][data-selected=true]").waitFor();
  });
  await check("sticky todo group text cards, connections and labels", async () => {
    const root = page.locator("[data-thought-canvas]:visible").last();
    for (const type of ["便签", "待解决卡", "分组框", "文字标签"]) {
      await root.getByRole("button", { name: "添加画布元素", exact: true }).click();
      await page.getByRole("menuitem", { name: type, exact: true }).click();
      await page.waitForTimeout(450);
    }
    assert.equal(canvas().nodes.length, 5);
    await root.getByRole("button", { name: "适应全部", exact: true }).click();
    const sticky = root.locator("[data-kind=sticky]").first();
    await sticky.dblclick();
    await root.getByRole("textbox", { name: "编辑画布文字" }).fill("**My idea**");
    await surface().click({ position: { x: 15, y: 15 } });
    await page.waitForTimeout(450);
    assert.ok(canvas().nodes.some((n) => n.text === "**My idea**"));
    // Separate overlapping freshly added cards through real pointer drags.
    const todo = root.locator("[data-kind=todo]").first();
    const b = await todo.boundingBox();
    await page.mouse.move(b.x + 40, b.y + 20);
    await page.mouse.down();
    await page.mouse.move(b.x + 330, b.y + 90, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(450);
    const from = root.locator("[data-kind=excerpt]").first();
    await from.hover();
    const start = await from.getByRole("button", { name: "拖动连线" }).boundingBox();
    const end = await todo.boundingBox();
    await page.mouse.move(start.x + 5, start.y + 5);
    await page.mouse.down();
    await page.mouse.move(end.x + 30, end.y + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(450);
    assert.equal(canvas().edges.length, 1);
    await root.locator("[data-edge]").first().click();
    await root.getByRole("textbox", { name: "连线标签" }).fill("对比");
    await root.getByRole("combobox", { name: "连线样式" }).focus();
    await page.waitForTimeout(450);
    assert.equal(canvas().edges[0].label, "对比");
  });
  await check("pan zoom selection alignment undo redo and Markdown export", async () => {
    const root = page.locator("[data-thought-canvas]:visible").last();
    await surface().focus();
    const before = canvas().nodes.length;
    await page.keyboard.press("Control+d");
    await page.waitForTimeout(450);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(450);
    assert.equal(canvas().nodes.length, before);
    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(450);
    const box = await surface().boundingBox();
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Control");
    await root.getByRole("checkbox", { name: "吸附", exact: true }).check();
    const download = page.waitForEvent("download");
    await root.getByRole("button", { name: "导出提纲", exact: true }).click();
    assert.match((await download).suggestedFilename(), /第二章/);
    await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
    await root.getByRole("button", { name: "适应全部", exact: true }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: output + "/canvas-dark.png" });
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  await writeFile("/tmp/readflow-r3/scenarios.json", JSON.stringify({ checks, errors, unexpected }, null, 2));
  console.log("PASS", checks.length);
} catch (error) {
  await page.screenshot({ path: output + "/failure.png" });
  console.log({ errors, unexpected });
  throw error;
} finally {
  await browser.close();
}
