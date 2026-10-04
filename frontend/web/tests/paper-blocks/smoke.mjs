import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readerBrowser } from "../paper-reader/browser.mjs";

const output = "/tmp/readflow-x1/screenshots";
await mkdir(output, { recursive: true });
const checks = [];
async function open(configured = true) {
  const env = await readerBrowser(
    configured ? "?blocks&configured" : "?blocks",
    "tests/paper-reader/integration-fixture.tsx",
  );
  try {
    const { page } = env;
    await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
    const input = page.getByRole("spinbutton", { name: "页码" });
    await input.fill("1");
    await input.press("Enter");
    await page.locator('[data-paper-page="1"] .pr-text-layer span').first().waitFor();
    await page.getByRole("button", { name: "块模式", exact: true }).click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent === "导出译文" && !button.disabled,
      ),
    );
    return env;
  } catch (error) {
    await env.browser.close();
    throw error;
  }
}
async function target(page) {
  const span = page
    .locator('[data-annotation-source=true] [data-paper-page="1"] .pr-text-layer span')
    .filter({ hasText: "Block translation should" })
    .first();
  await span.scrollIntoViewIfNeeded();
  return span;
}
const env = await open();
try {
  const { page, blocks } = env;
  const button = (name) => page.getByRole("button", { name, exact: true });
  const card = page.getByRole("dialog", { name: "块译文", exact: true });
  const span = await target(page);
  await span.hover();
  await page.locator("[data-block-hover]").waitFor();
  assert.equal(blocks.requests().length, 0);
  await page.screenshot({ path: output + "/block-hover.png" });
  await span.click();
  await card.waitFor();
  await card.getByRole("button", { name: "查看原文", exact: true }).click();
  assert.match(await card.innerText(), /Block translation should/);
  await card.getByRole("button", { name: "翻译这一块", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "单块翻译 · 35%" }).waitFor();
  assert.ok(blocks.requests().at(-1).block_id);
  blocks.finish();
  await card
    .getByText(/【译】Block translation/)
    .first()
    .waitFor();
  await card.getByRole("button", { name: "复制", exact: true }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /【译】/);
  await page.screenshot({ path: output + "/block-translation.png" });
  checks.push("local extraction, hover, click, original, single-block translation and copy");
  await page.keyboard.press("Escape");
  await card.waitFor({ state: "hidden" });
  await span.dblclick();
  await page.getByRole("toolbar", { name: "选中文字工具条", exact: true }).waitFor();
  assert.ok(await page.evaluate(() => getSelection().toString().trim().length > 0));
  assert.equal(await card.count(), 0);
  await page.evaluate(() => getSelection().removeAllRanges());
  const referencePoint = await page
    .locator('[data-paper-page="1"] .pr-text-layer span')
    .evaluateAll((spans) => {
      for (const node of spans) {
        const index = node.textContent.indexOf("[1]");
        if (index < 0 || !node.firstChild) continue;
        const range = document.createRange();
        range.setStart(node.firstChild, index);
        range.setEnd(node.firstChild, index + 3);
        const box = range.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }
    });
  assert.ok(referencePoint);
  await page.mouse.move(referencePoint.x, referencePoint.y);
  await page.getByRole("dialog", { name: "引用预览", exact: true }).waitFor();
  await page.mouse.click(referencePoint.x, referencePoint.y);
  await page.waitForFunction(() => document.querySelector("input[name=page]").value === "3");
  assert.equal(await card.count(), 0);
  await button("后退").click();
  await page.waitForFunction(() => document.querySelector("input[name=page]").value === "1");
  checks.push("reference hover and jump retain priority in block mode");

  // A real pointer drag must remain owned by pdf.js text selection.
  const box = await span.boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(box.width - 3, 170), box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.getByRole("toolbar", { name: "选中文字工具条", exact: true }).waitFor();
  assert.ok(await page.evaluate(() => getSelection().toString().length > 3));
  assert.equal(await card.count(), 0);
  await page
    .getByRole("toolbar", { name: "选中文字工具条", exact: true })
    .getByRole("button", { name: "重要", exact: true })
    .click();
  await page.locator("[data-annotation-id]").first().waitFor();
  assert.equal(env.annotations().length, 1);
  await page
    .getByRole("region", { name: "编辑批注" })
    .getByRole("button", { name: "收起", exact: true })
    .click();
  checks.push("real text drag and annotation creation retain priority over block clicks");

  await button("翻译全文").click();
  await page.getByText("翻译 35%", { exact: true }).first().waitFor();
  assert.equal(blocks.requests().at(-1).block_id, undefined);
  await button("取消翻译").click();
  await button("翻译全文").waitFor();
  await page.screenshot({ path: output + "/cancelled.png" });
  checks.push("full translation progress and cancellation");
  blocks.fail();
  await button("翻译全文").click();
  await page.getByText("翻译 35%", { exact: true }).first().waitFor();
  blocks.finish();
  const failure = page.getByRole("status").filter({ hasText: "无法连接模型服务。" });
  await failure.waitFor();
  await failure.getByRole("button", { name: "重试", exact: true }).click();
  await page.getByText("翻译 35%", { exact: true }).first().waitFor();
  blocks.finish();
  await button("译文").click();
  const translated = page.getByLabel("译文页面", { exact: true });
  await translated.locator(".pr-text-layer span").filter({ hasText: "【译】" }).first().waitFor();
  await page.screenshot({ path: output + "/translated-pdf.png" });
  await button("对照").click();
  await page.getByLabel("原文页面", { exact: true }).waitFor();
  await page.screenshot({ path: output + "/compare-pdf.png" });
  checks.push("failed request retry, new Typst PDF and comparison mode");
  await button("导出译文").click();
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载译文 PDF", exact: true }).click();
  assert.equal((await pdfDownload).suggestedFilename(), "ReadFlow-译文.pdf");
  await button("导出译文").click();
  const latexDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "导出 LaTeX 工程", exact: true }).click();
  assert.equal((await latexDownload).suggestedFilename(), "ReadFlow-LaTeX.zip");
  checks.push("PDF and LaTeX downloads");

  await button("原文").click();
  const diagram = page
    .locator('[data-annotation-source=true] [data-paper-page="1"] .pr-text-layer span')
    .filter({ hasText: "Vector method diagram" })
    .first();
  await diagram.click();
  await card.getByText(/【译】\s*Figure\s*1/).waitFor();
  await page.screenshot({ path: output + "/figure-caption.png" });
  await card.getByRole("button", { name: "关闭", exact: true }).click();
  checks.push("figure click resolves its translated caption");
  const unmarked = page
    .locator('[data-annotation-source=true] [data-paper-page="1"] .pr-text-layer span')
    .filter({ hasText: "Safe Research with" })
    .first();
  await unmarked.click();
  await card.waitFor();
  await card.getByRole("button", { name: "加入闪卡", exact: true }).click();
  const create = page.getByRole("dialog", { name: "做成闪卡", exact: true });
  await create.waitFor();
  assert.match(await create.innerText(), /Safe Research/);
  await create.getByRole("button", { name: "取消", exact: true }).click();
  await unmarked.click();
  await card.getByRole("button", { name: "加入画布", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "加入画布", exact: true });
  await picker.getByRole("textbox", { name: "画布名称", exact: true }).fill("Block evidence");
  await picker.getByRole("button", { name: "新建并加入", exact: true }).click();
  await picker.waitFor({ state: "hidden" });
  assert.match([...env.canvases.documents.values()][0].nodes[0].text, /【译】/);
  await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
  await unmarked.click();
  await card.waitFor();
  await page.screenshot({ path: output + "/block-dark.png" });
  await card.getByRole("button", { name: "加入笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记正文", exact: true }).waitFor();
  checks.push("block to flashcard, canvas and notes; dark appearance");
  assert.deepEqual(env.errors, []);
  assert.deepEqual(env.unexpected, []);
} catch (error) {
  await env.page.screenshot({ path: output + "/failure.png" });
  console.log({ errors: env.errors, unexpected: env.unexpected });
  throw error;
} finally {
  await env.browser.close();
}
const empty = await open(false);
try {
  await empty.page.getByRole("button", { name: "翻译全文", exact: true }).click();
  const notice = empty.page.getByRole("status").filter({ hasText: "还没有配置翻译服务" });
  await notice.waitFor();
  assert.equal(empty.blocks.requests().length, 0);
  await empty.page.screenshot({ path: output + "/unconfigured.png" });
  await notice.getByRole("button", { name: "去设置", exact: true }).click();
  await empty.page.getByRole("heading", { name: "翻译", exact: true }).waitFor();
  checks.push("unconfigured guide without requests, settings navigation");
  assert.deepEqual(empty.errors, []);
  assert.deepEqual(empty.unexpected, []);
} finally {
  await empty.browser.close();
}
await writeFile("/tmp/readflow-x1/browser-checks.json", JSON.stringify(checks, null, 2));
console.log(`PASS ${checks.length} block translation scenario groups`);
