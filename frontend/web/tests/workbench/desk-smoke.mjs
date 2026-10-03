// Run from frontend/web: node tests/workbench/desk-smoke.mjs
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { openDeskFixture } from "./browser-fixture.mjs";

const { browser, page, output, errors } = await openDeskFixture();
const checks = [];
const button = (name) => page.getByRole("button", { name, exact: true });
const region = (name) => page.getByRole("region", { name, exact: true });
const state = () => page.evaluate(() => window.fixture.wb.store.getSnapshot());
async function check(name, work) { await work(); checks.push(name); console.log(`ok ${checks.length} - ${name}`); }
async function desk() { await button("书桌").click(); await page.getByRole("heading", { name: "书桌", exact: true }).waitFor(); }
async function closeReader() { await page.getByRole("navigation", { name: "阅读器标签页" }).getByRole("button", { name: /^关闭/ }).click(); await desk(); }
async function theme(name) { await button("设置").click(); await page.getByRole("menuitemradio", { name, exact: true }).click(); }

try {
  await check("six launchers on one row, five widgets and real progress", async () => {
    assert.equal(await region("快速开始").getByRole("button").count(), 6);
    const positions = await region("快速开始").getByRole("button").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    assert.equal(new Set(positions).size, 1);
    for (const name of ["继续阅读", "翻译", "最近批注", "待读", "文献库概览"]) assert.equal(await region(name).count(), 1);
    assert.equal(await region("继续阅读").getByRole("progressbar").count(), 3);
    assert.equal(await page.getByRole("progressbar", { name: "全文翻译进度", exact: true }).getAttribute("aria-valuenow"), "62");
    assert.ok((await region("继续阅读").boundingBox()).width > (await region("翻译").boundingBox()).width * 1.8);
    assert.match(await region("翻译").textContent(), /已译 1 篇/);
    assert.match(await region("翻译").textContent(), /排队 1 篇/);
    assert.equal(await page.evaluate(() => window.fixture.calls.filter((c) => c.method === "startOcrJob").length), 0);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/desk-light.png` });
  });
  await check("dark mode and responsive narrow dashboard", async () => {
    await theme("深色");
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[aria-label="快速开始"] button')).color === "rgb(245, 245, 247)");
    await page.screenshot({ path: `${output}/desk-dark.png` });
    await theme("浅色");
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[aria-label="快速开始"] button')).backgroundColor === "rgb(255, 255, 255)");
    await page.setViewportSize({ width: 1100, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/desk-1100.png` });
    await page.setViewportSize({ width: 900, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/desk-900.png` });
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check("quick import opens both established import formats", async () => {
    await button("导入文献").click();
    assert.equal(await page.getByRole("menuitem", { name: "PDF 文件…", exact: true }).count(), 1);
    assert.equal(await page.getByRole("menuitem", { name: "Zotero / CSL JSON…", exact: true }).count(), 1);
    await page.keyboard.press("Escape");
  });
  await check("translation picker checks configuration and offers settings before submitting", async () => {
    await button("翻译 PDF").click();
    const popup = page.getByRole("dialog", { name: "选择文献翻译", exact: true });
    await popup.getByText("选择文献后提交全文翻译；优先读取文字层，缺字页面使用本地 OCR。").waitFor();
    await popup.getByRole("textbox", { name: "查找文献" }).fill("OpenVLA");
    const result = popup.getByRole("button", { name: /OpenVLA/ });
    await result.waitFor();
    await page.evaluate(() => window.fixture.wb.store.actions.patch({ list: { status: "ready", result: { ...window.fixture.wb.store.getSnapshot().list.result, items: [] }, error: null } }));
    await result.click();
    await page.getByText("还没有配置翻译服务", { exact: true }).waitFor();
    assert.equal(await page.locator("iframe").count(), 0);
    await button("收起").click();
  });
  await check("translation widget picker, recent completion, and AI entry use reader tabs", async () => {
    await button("翻译一篇文献…").click();
    await page.getByRole("dialog", { name: "选择文献翻译" }).waitFor();
    await page.keyboard.press("Escape");
    await region("翻译").getByRole("button", { name: "对照阅读" }).click();
    await page.locator("iframe").waitFor();
    await closeReader();
    await button("AI 伴读").click();
    const popup = page.getByRole("dialog", { name: "选择文献进行 AI 伴读" });
    await popup.getByText("选择文献后，在阅读器右侧使用 AI 问答。").waitFor();
    await popup.getByRole("button", { name: /SafeVLA/ }).click();
    await page.locator("iframe").waitFor();
    await page.getByRole("status").getByText(/阅读器右侧/).waitFor();
    await closeReader();
  });
  await check("notes and overview links enter their own views", async () => {
    await region("快速开始").getByRole("button", { name: "笔记", exact: true }).click();
    assert.equal((await state()).main, "notes");
    assert.equal(await button("有笔记的文献").count(), 1);
    for (const [label, view] of [["缺少 DOI", "missing_doi"], ["没有中文题名", "no_zh_title"], ["需要 OCR", "needs_ocr"]]) {
      await desk();
      await region("文献库概览").getByRole("button", { name: new RegExp(label) }).click();
      assert.equal((await state()).view, view);
      assert.equal((await state()).query, "");
    }
    await desk();
  });
  await check("command palette uses specific icons and includes new views", async () => {
    await page.keyboard.press("Control+k");
    const popup = page.getByRole("dialog", { name: "命令与搜索" });
    assert.equal(await popup.locator(".lucide-command").count(), 0);
    const icons = await popup.locator('[role="option"] svg').evaluateAll((els) => els.map((el) => el.getAttribute("class")));
    assert.ok(new Set(icons).size >= 10);
    await popup.getByRole("combobox").fill("查看缺少 DOI");
    await popup.getByRole("combobox").press("Enter");
    assert.equal((await state()).view, "missing_doi");
    await desk();
  });
  await check("unavailable OCR cannot submit or download and opens workbench settings", async () => {
    await page.evaluate(() => { window.fixture.settings.ocrStatus = "not_installed"; });
    await button("本地 OCR").click();
    const popup = page.getByRole("dialog", { name: "本地 OCR", exact: true });
    await popup.getByText("本地 OCR 模块尚未安装。").waitFor();
    assert.equal(await popup.getByRole("button", { name: "开始 OCR" }).isDisabled(), true);
    assert.equal(await popup.getByRole("checkbox").first().isDisabled(), true);
    await popup.getByRole("button", { name: "打开 OCR 设置" }).click();
    await page.getByRole("main", { name: "本地 OCR", exact: true }).waitFor();
    await button("完成").click();
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.fixture.calls.filter((c) => c.method === "startOcrJob").length), 0);
  });
  await check("ready OCR starts selected PDF only and disables its queued job", async () => {
    await page.evaluate(() => { window.fixture.settings.ocrStatus = "ready"; });
    await button("本地 OCR").click();
    const popup = page.getByRole("dialog", { name: "本地 OCR", exact: true });
    await popup.getByText("已就绪，可在本机识别所选文献。").waitFor();
    await popup.getByRole("checkbox").first().check();
    await popup.getByRole("button", { name: "开始 OCR" }).click();
    await page.waitForFunction(() => window.fixture.jobs.length === 1);
    await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-label="本地 OCR"] input[type="checkbox"]')?.disabled);
    assert.deepEqual(await page.evaluate(() => window.fixture.calls.filter((c) => c.method === "startOcrJob").map(({ attachment_id, module_id }) => [attachment_id, module_id])), [["pdf0", "local-test"]]);
    await page.keyboard.press("Escape");
  });
  await check("OCR submission failures remain recoverable", async () => {
    await page.evaluate(() => { window.fixture.settings.failOcr = true; });
    await button("本地 OCR").click();
    const popup = page.getByRole("dialog", { name: "本地 OCR", exact: true });
    await popup.getByRole("checkbox").nth(1).check();
    await popup.getByRole("button", { name: "开始 OCR" }).click();
    await popup.getByRole("alert").getByText(/1 篇未能开始 OCR/).waitFor();
    await page.evaluate(() => { window.fixture.settings.failOcr = false; });
    await popup.getByRole("button", { name: "重试", exact: true }).click();
    await popup.getByText("已就绪，可在本机识别所选文献。").waitFor();
    await page.keyboard.press("Escape");
  });
  await check("glossary entry opens the workbench glossary category", async () => {
    await button("术语表").click();
    await page.getByRole("main", { name: "术语表", exact: true }).waitFor();
    assert.equal(await page.locator("iframe").count(), 0);
    await button("完成").click();
  });
  await check("T1 empty metadata stays blank and Chinese-title placeholder uses secondary ink", async () => {
    await page.evaluate(() => { Object.assign(window.fixture.rows[4], { authors: [], venue_short: "", year: "" }); });
    await button("全部文献").click();
    const row = page.locator('[data-row="5"] [role="option"]');
    await row.click();
    assert.equal(await row.getByText("—", { exact: true }).count(), 0);
    const placeholder = page.getByTitle("编辑中文题名", { exact: true });
    assert.match(await placeholder.textContent(), /添加中文题名/);
    assert.equal(await placeholder.evaluate((el) => getComputedStyle(el).color), "rgb(110, 110, 115)");
    await placeholder.hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[title="编辑中文题名"] svg')).opacity === "1");
    await desk();
  });
  await check("empty library shows welcome actions without misleading dashboard placeholders", async () => {
    await page.evaluate(async () => { window.fixture.rows.splice(0); window.fixture.groups.splice(0); window.fixture.jobs.splice(0); await window.fixture.wb.refreshAll(); });
    await region("欢迎使用 ReadFlow").waitFor();
    assert.equal(await region("欢迎使用 ReadFlow").getByRole("button").count(), 3);
    assert.equal(await button("有笔记的文献").count(), 0);
    assert.equal(await page.getByRole("progressbar", { name: "全文翻译进度" }).count(), 0);
    assert.equal(await page.getByText("待读清单已清空。", { exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/desk-empty.png` });
  });
  await check("dashboard failure and retry keep the shell usable", async () => {
    await page.reload(); await region("快速开始").waitFor();
    await page.evaluate(async () => { window.fixture.settings.failDesk = true; await window.fixture.wb.refreshDesk(); });
    await button("重试").waitFor();
    assert.equal(await region("快速开始").getByRole("button").count(), 6);
    await page.evaluate(() => { window.fixture.settings.failDesk = false; });
    await button("重试").click();
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().desk.status === "ready");
  });
  assert.deepEqual(errors, []);
  console.log(`PASS ${checks.length} scenarios; page errors: ${errors.length}`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  await writeFile("/tmp/readflow-t2/desk-failure.json", JSON.stringify({ errors, state: await state() }, null, 2));
  throw error;
} finally { await browser.close(); }
