import assert from "node:assert/strict";
import { readerBrowser } from "../paper-reader/browser.mjs";
const { browser, page, errors, unexpected, canvases, annotations } = await readerBrowser(
  "",
  "tests/paper-reader/integration-fixture.tsx",
);
const button = (name) => page.getByRole("button", { name, exact: true });
const canvas = () => [...canvases.documents.values()][0];
async function waitFor(run) {
  for (let i = 0; i < 50; i++) {
    if (run()) return;
    await page.waitForTimeout(100);
  }
  assert.ok(run());
}
async function select() {
  await page
    .locator("[data-annotation-source=true]:visible .pr-text-layer span")
    .filter({ hasText: "We follow" })
    .first()
    .evaluate((span) => {
      const range = document.createRange();
      range.selectNodeContents(span);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(range);
    });
  await page.getByRole("toolbar", { name: "选中文字工具条" }).waitFor();
}
async function openReader() {
  await page
    .getByRole("navigation", { name: "阅读器标签页" })
    .getByRole("button", { name: "Paper a", exact: true })
    .click();
}
async function deleteAnnotation(id, choice) {
  await openReader();
  await page.getByRole("combobox", { name: "阅读器布局" }).selectOption("document");
  await page.waitForTimeout(180);
  await page.locator(`[data-annotation-id="${id}"]`).click();
  const popup = page.getByRole("region", { name: "编辑批注" });
  await popup.getByRole("button", { name: "删除", exact: true }).click();
  await popup.getByRole("button", { name: "确认删除", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "处理画布引用" });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: choice, exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
}
try {
  await button("新建画布").click();
  await page.getByRole("textbox", { name: "画布名称", exact: true }).fill("Links");
  await button("保存画布").click();
  await page
    .getByRole("navigation", { name: "阅读器标签页" })
    .getByRole("button", { name: "文献库", exact: true })
    .click();
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  const input = page.getByRole("spinbutton", { name: "页码" });
  await input.fill("1");
  await input.press("Enter");
  await select();
  await page
    .getByRole("toolbar", { name: "选中文字工具条" })
    .getByRole("button", { name: "重要", exact: true })
    .click();
  await page
    .getByRole("region", { name: "编辑批注" })
    .getByRole("button", { name: "收起", exact: true })
    .click();
  await page.getByRole("tab", { name: "批注", exact: true }).click();
  const annotation = annotations()[0];
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  const card = page.locator(`[data-annotation-card="${annotation.id}"]`);
  await card.dispatchEvent("dragstart", { dataTransfer: transfer });
  await page
    .getByRole("tab", { name: "画布", exact: true })
    .dispatchEvent("dragenter", { dataTransfer: transfer });
  const surface = page.locator('[aria-label="思考画布"]:visible').last();
  await surface.waitFor();
  const box = await surface.boundingBox();
  await surface.dispatchEvent("drop", { dataTransfer: transfer, clientX: box.x + 70, clientY: box.y + 70 });
  await waitFor(() => canvas().nodes.length === 1);
  console.log("PASS annotation sidebar drag via canvas-tab hover");
  await page.getByRole("combobox", { name: "阅读器布局" }).selectOption("split");
  const divider = page.getByRole("separator", { name: "调整文献与画布宽度" });
  const position = await divider.boundingBox();
  await page.mouse.move(position.x + 2, position.y + 100);
  await page.mouse.down();
  await page.mouse.move(position.x - 100, position.y + 100);
  await page.mouse.up();
  assert.ok((await divider.boundingBox()).x < position.x - 50);
  await page.getByRole("combobox", { name: "阅读器布局" }).selectOption("canvas");
  assert.equal(await page.locator("[data-pdf-pane]:visible").count(), 0);
  await page.getByRole("combobox", { name: "阅读器布局" }).selectOption("document");
  await input.fill("3");
  await input.press("Enter");
  await page.getByRole("combobox", { name: "阅读器布局" }).selectOption("canvas");
  await page
    .locator("[data-thought-canvas]:visible")
    .last()
    .getByRole("button", { name: /Paper a · 第 1 页/ })
    .click();
  await page.waitForFunction(
    () => document.querySelector("[data-wb-reader-active=true] input[name=page]").value === "1",
  );
  await page.locator("[data-flash=true]:visible").first().waitFor();
  assert.equal(await page.getByRole("combobox", { name: "阅读器布局" }).inputValue(), "document");
  await input.fill("3");
  await input.press("Enter");
  await page
    .getByRole("navigation", { name: "阅读器标签页" })
    .getByRole("button", { name: "Links", exact: true })
    .click();
  await openReader();
  await page.waitForTimeout(100);
  assert.equal(await input.inputValue(), "3");
  await input.fill("1");
  await input.press("Enter");
  console.log("PASS splitter and all three reader layouts");
  await deleteAnnotation(annotation.id, "保留为静态摘录");
  await waitFor(() => canvas().nodes[0].orphaned);
  assert.equal(canvas().nodes[0].annotation_id, null);
  assert.match(canvas().nodes[0].quote, /We follow/);
  console.log("PASS deleting a referenced annotation preserves a static excerpt");
  await select();
  await page
    .getByRole("toolbar", { name: "选中文字工具条" })
    .getByRole("button", { name: "加入画布…", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "加入画布", exact: true })
    .getByRole("button", { name: "Links", exact: true })
    .click();
  await waitFor(() => canvas().nodes.length === 2);
  const linked = canvas().nodes.find((n) => n.annotation_id);
  await deleteAnnotation(linked.annotation_id, "一并删除画布卡");
  await waitFor(() => canvas().nodes.length === 1);
  console.log("PASS canvas picker creates linked highlight and removal deletes its card");
  // Region screenshots become image cards.
  await button("框选").click();
  const paper = await page.locator('[data-annotation-source=true] [data-paper-page="1"]').boundingBox();
  await page.mouse.move(paper.x + paper.width * 0.2, paper.y + paper.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(paper.x + paper.width * 0.45, paper.y + paper.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await waitFor(() => annotations().some((a) => a.type === "region"));
  await page
    .getByRole("region", { name: "编辑批注" })
    .getByRole("button", { name: "收起", exact: true })
    .click();
  await page.getByRole("tab", { name: "批注", exact: true }).click();
  const region = annotations().find((a) => a.type === "region");
  await page
    .locator(`[data-annotation-card="${region.id}"]`)
    .getByRole("button", { name: "批注操作" })
    .click();
  await page.getByRole("menuitem", { name: "加入画布…", exact: true }).click();
  await page
    .getByRole("dialog", { name: "加入画布", exact: true })
    .getByRole("button", { name: "Links", exact: true })
    .click();
  await waitFor(() => canvas().nodes.some((n) => n.type === "image"));
  console.log("PASS region annotation adds an image card");
  await page
    .getByRole("navigation", { name: "阅读器标签页" })
    .getByRole("button", { name: "文献库", exact: true })
    .click();
  const paperRow = page.getByRole("option", { name: "Paper b", exact: true });
  const paperTransfer = await page.evaluateHandle(() => new DataTransfer());
  await paperRow.dispatchEvent("dragstart", { dataTransfer: paperTransfer });
  await page
    .getByRole("navigation", { name: "阅读器标签页" })
    .getByRole("button", { name: "Links", exact: true })
    .dispatchEvent("dragenter", { dataTransfer: paperTransfer });
  const full = page.locator('[aria-label="思考画布"]:visible').last();
  await full.waitFor();
  const fullBox = await full.boundingBox();
  await full.dispatchEvent("drop", {
    dataTransfer: paperTransfer,
    clientX: fullBox.x + 150,
    clientY: fullBox.y + 150,
  });
  await waitFor(() => canvas().nodes.some((node) => node.type === "paper" && node.item_id === "b"));
  console.log("PASS library paper drag switches canvas tab and adds citation card");
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log("PASS 6 linkage scenarios");
} catch (error) {
  await page.screenshot({ path: "/tmp/readflow-r3/screenshots/linkage-failure.png" });
  console.log({ errors, unexpected });
  throw error;
} finally {
  await browser.close();
}
