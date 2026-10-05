import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { readerBrowser } from "../paper-reader/browser.mjs";
const output = "/tmp/readflow-x2/screenshots";
await mkdir(output, { recursive: true });
const env = await readerBrowser("?blocks&configured&x2", "tests/paper-reader/integration-fixture.tsx");
const { page, blocks } = env;
const button = (name) => page.getByRole("button", { name, exact: true });
try {
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await button("翻译全文").click();
  await page.getByText("翻译 35%", { exact: true }).first().waitFor();
  assert.equal(blocks.requests().at(-1).image_text, true);
  blocks.finish();
  await page.getByText("本次约 842 tokens", { exact: true }).waitFor();
  await button("知道了").click();
  const manifest = JSON.parse(await readFile("tests/fixtures/blocks/manifest.json", "utf8"));
  const figure = manifest.blocks.find((block) => block.type === "figure");
  const input = page.getByRole("spinbutton", { name: "页码" });
  await input.fill(String(figure.page));
  await input.press("Enter");
  const paper = page.locator(`[data-annotation-source=true] [data-paper-page="${figure.page}"]`).first();
  await paper.scrollIntoViewIfNeeded();
  const box = await paper.boundingBox();
  const rect = figure.anchors[0].view_bbox;
  await page.mouse.click(box.x + box.width * (rect[0] + rect[2]) / 2,
    box.y + box.height * (rect[1] + rect[3]) / 2);
  const card = page.getByRole("dialog", { name: "块译文", exact: true });
  await card.getByText("图内文字", { exact: true }).waitFor();
  await card.getByText("训练输入", { exact: true }).waitFor();
  await card.getByText("保留原文", { exact: true }).waitFor();
  await page.screenshot({ path: output + "/figure-labels-light.png" });
  await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((node) => node.textContent === "重新翻译");
    return button && Number(getComputedStyle(button).color.match(/\d+/)?.[0]) > 200;
  });
  await page.screenshot({ path: output + "/figure-labels-dark.png" });
  await card.getByRole("button", { name: "关闭", exact: true }).click();
  await page.evaluate(() => window.fixture.wb.openSettings("translation"));
  const toggle = page.getByRole("checkbox", { name: "译文 PDF 中翻译图内文字" });
  await toggle.uncheck();
  await page.screenshot({ path: output + "/translation-settings.png" });
  await page.evaluate(() => window.fixture.wb.openSettings("ocr"));
  await page.getByText("内置 OCR", { exact: true }).waitFor();
  await page.getByText("就绪", { exact: true }).waitFor();
  assert.equal(await button("下载并安装…").count(), 0);
  await page.screenshot({ path: output + "/builtin-ocr-settings.png" });
  await button("完成").click();
  await button("补翻／重新排版").click();
  await page.getByText("翻译 35%", { exact: true }).first().waitFor();
  assert.equal(blocks.requests().at(-1).image_text, false);
  await button("取消翻译").click();
  assert.deepEqual(env.errors, []);
  assert.deepEqual(env.unexpected, []);
  console.log("PASS 5 X2 UI groups: bilingual labels, themes, usage, render preference, built-in OCR");
} finally {
  await env.browser.close();
}
