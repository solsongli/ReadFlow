import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { notesBrowser } from "./notes-browser.mjs";
import { contrastAudit, iconLabelAudit } from "./contrast-audit.mjs";

const { browser, page, output, errors, unexpected } = await notesBrowser();
const checks = [], button = (name) => page.getByRole("button", { name, exact: true });
const nav = (name) => page.getByLabel("导航", { exact: true }).getByRole("button", { name, exact: true });
const editor = () => page.getByLabel("笔记正文", { exact: true });
const note = (id) => page.locator(`[data-note-id="${id}"]`);
async function check(name, work) { await work(); checks.push(name); console.log(`ok ${checks.length} - ${name}`); }
async function saved() { await page.getByRole("status").getByText("已保存", { exact: true }).waitFor(); }
async function screenshot(name) { await page.evaluate(() => document.fonts.ready); await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running")); await page.screenshot({ path: `${output}/${name}.png` }); }
try {
  await check("sidebar and dashboard distinguish papers from note and annotation records", async () => {
    assert.match(await nav("笔记").textContent(), /4/);
    assert.match(await nav("有笔记的文献").textContent(), /2/);
    await nav("书桌").click();
    await page.getByRole("region", { name: "文献库概览" }).getByText("笔记 2 条 · 批注 2 条", { exact: true }).waitFor();
    await nav("笔记").click();
    await page.getByRole("main", { name: "笔记空间" }).waitFor();
    await note("n1").waitFor();
    assert.equal(await page.locator("[data-note-id]").count(), 4);
    for (const name of ["今天", "昨天", "过去 7 天", "更早"]) await page.getByRole("region", { name, exact: true }).waitFor();
    assert.equal(await page.getByLabel("笔记列表", { exact: true }).evaluate((el) => el.getBoundingClientRect().width), 300);
    assert.equal(await editor().evaluate((el) => getComputedStyle(el).fontSize), "17px");
    await screenshot("notes-light");
  });
  await check("autosave waits after input, writes the body only and updates list text", async () => {
    await editor().fill("Updated first line\nSecond line of thought");
    assert.equal(await page.evaluate(() => window.fixture.calls.updates), 0);
    await saved();
    assert.equal(await page.evaluate(() => window.fixture.calls.updates), 1);
    await note("n1").getByText("Updated first line", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => Object.keys(window.fixture.calls.payloads[0])), ["body"]);
  });
  await check("navigation waits for pending save; a failed save keeps editor text and can retry", async () => {
    await page.evaluate(() => { window.fixture.data.saveDelay = 250; });
    await editor().fill("Save before leaving"); await nav("书桌").click();
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().main), "notes");
    await page.getByRole("heading", { name: "书桌", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.data.notes.find((n) => n.id === "n1").body), "Save before leaving");
    await page.evaluate(() => { window.fixture.data.saveDelay = 0; window.fixture.data.failSave = true; });
    await nav("笔记").click(); await note("n1").click();
    await editor().fill("Retain my unsaved text"); await nav("全部文献").click();
    await page.getByRole("status").getByText("保存失败", { exact: true }).waitFor();
    assert.equal(await editor().inputValue(), "Retain my unsaved text");
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().main), "notes");
    await page.evaluate(() => { window.fixture.data.failSave = false; });
    await page.getByRole("alert").getByRole("button", { name: "重试", exact: true }).click(); await saved();
  });
  await check("kind and text search use both paper titles and quote text", async () => {
    await page.getByRole("group", { name: "笔记类型" }).getByRole("button", { name: "批注", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("[data-note-id]").length === 2);
    await page.getByLabel("搜索笔记", { exact: true }).fill("记忆与学习");
    await page.waitForFunction(() => document.querySelectorAll("[data-note-id]").length === 1);
    assert.equal(await note("n2").count(), 1);
    await page.getByLabel("搜索笔记", { exact: true }).fill("Learning connects");
    await page.waitForFunction(() => document.querySelectorAll("[data-note-id]").length === 2);
    await page.getByLabel("搜索笔记", { exact: true }).fill("");
  });
  await check("annotation editing preserves its quote and opens its page in an existing Reader tab", async () => {
    await note("n2").click();
    const quote = page.locator('[aria-label="笔记编辑器"] blockquote');
    assert.match(await quote.evaluate((el) => getComputedStyle(el.querySelector("p")).fontFamily), /serif/i);
    await editor().fill("Annotation thought revised"); await saved();
    assert.equal(await page.evaluate(() => window.fixture.data.notes.find((n) => n.id === "n2").quote), "Learning connects a new idea to what we already understand.");
    await button("在阅读器中打开").click(); await page.locator("iframe").waitFor();
    assert.equal(new URL(await page.locator("iframe").getAttribute("src")).searchParams.get("page_idx"), "3");
    const token = await page.locator("iframe").evaluate((el) => el.contentWindow.documentToken);
    await nav("笔记").click(); await note("n2").click(); await button("在阅读器中打开").click();
    await page.waitForFunction((previous) => document.querySelector("iframe")?.contentWindow.documentToken !== previous, token);
    assert.equal(new URL(await page.locator("iframe").getAttribute("src")).searchParams.get("page_idx"), "3");
  });
  await check("Reader notifications refresh the visible notes space", async () => {
    await nav("笔记").click(); await note("n2").click();
    await page.locator("iframe").evaluate((el) => {
      const itemId = window.fixture.ids[0];
      window.fixture.data.notes.find((n) => n.id === "n2").body = "Changed inside Reader";
      window.dispatchEvent(new MessageEvent("message", { origin: location.origin, source: el.contentWindow, data: { type: "readflow:notes-changed", itemId } }));
    });
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="笔记正文"]')?.value === "Changed inside Reader");
  });
  await check("paper link selects its library row and inspector shows recent notes above citations", async () => {
    await page.getByRole("region", { name: "笔记编辑器" }).getByRole("button", { name: "记忆与学习研究", exact: true }).click();
    await page.getByRole("main", { name: "文献库", exact: true }).waitFor();
    const inspector = page.getByRole("region", { name: "文献笔记", exact: true });
    await inspector.getByText("Changed inside Reader", { exact: true }).waitFor();
    await inspector.getByRole("button", { name: "查看全部 2 条", exact: true }).click();
    await page.getByText("《Research on Memory and Learning》的笔记", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-note-id]").count(), 2);
  });
  await check("filtered new note opens an empty focused draft and persists on first typing", async () => {
    const before = await page.evaluate(() => window.fixture.calls.creates);
    await page.keyboard.press("Control+n");
    await page.getByRole("status").getByText("空白草稿，输入后自动保存", { exact: true }).waitFor();
    assert.equal(await editor().evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => window.fixture.calls.creates), before);
    await editor().fill("New filtered note\nA useful insight"); await saved();
    await page.waitForFunction((n) => window.fixture.calls.creates === n + 1, before);
    await nav("笔记").getByText("5", { exact: true }).waitFor();
  });
  await check("delete uses local confirmation and updates records and counters", async () => {
    await button("删除笔记").click();
    assert.equal(await page.evaluate(() => window.fixture.calls.deletes), 0);
    await page.getByRole("alertdialog", { name: "确认删除笔记" }).getByRole("button", { name: "取消", exact: true }).click();
    await button("删除笔记").click(); await button("确认删除").click();
    await page.waitForFunction(() => window.fixture.calls.deletes === 1);
    await nav("笔记").getByText("4", { exact: true }).waitFor();
  });
  await check("unfiltered new-note picker permits papers without PDF and focuses the editor", async () => {
    await button("清除文献过滤").click(); await page.keyboard.press("Control+n");
    const picker = page.getByRole("dialog", { name: "选择文献新建笔记" });
    await picker.getByLabel("查找文献").fill("without a PDF");
    await picker.getByRole("button", { name: /Research without a PDF/ }).click();
    await editor().waitFor();
    assert.equal(await editor().evaluate((el) => el === document.activeElement), true);
    await editor().fill("# Markdown thought\n\n**Bold** and [safe](https://example.test).\n\n<script>window.injected=true</script>\n<img src=x onerror=evil()>\n[bad](javascript:alert(1))");
    await saved();
  });
  await check("Markdown preview blocks raw HTML and unsafe links; copy preserves source", async () => {
    const body = await editor().inputValue();
    await button("预览").click();
    const preview = page.getByLabel("Markdown 预览", { exact: true });
    await preview.getByRole("heading", { name: "Markdown thought" }).waitFor();
    assert.equal(await preview.locator("script,img").count(), 0);
    assert.equal(await preview.locator("a").count(), 1);
    assert.equal(await preview.locator("a").getAttribute("rel"), "noopener noreferrer");
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await button("复制为 Markdown").click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), body);
    await screenshot("notes-preview"); await button("编辑").click();
  });
  await check("filtered Markdown export has paper sections and one-based annotation pages", async () => {
    await nav("笔记").click();
    await page.getByRole("group", { name: "笔记类型" }).getByRole("button", { name: "批注", exact: true }).click();
    const pending = page.waitForEvent("download"); await button("导出为 Markdown").click();
    const download = await pending, text = await readFile(await download.path(), "utf8");
    assert.match(download.suggestedFilename(), /\.md$/); assert.equal((text.match(/^## /gm) ?? []).length, 2);
    assert.match(text, /第 4 页/); assert.doesNotMatch(text, /Markdown thought/);
  });
  await check("command palette creates and opens notes; dark and narrow layouts remain readable", async () => {
    await page.keyboard.press("Control+k"); await page.getByRole("combobox").fill("打开笔记"); await page.getByRole("combobox").press("Enter");
    await note("n2").click();
    await button("设置").click(); await page.getByRole("menuitemradio", { name: "深色", exact: true }).click();
    await screenshot("notes-dark");
    assert.deepEqual(await contrastAudit(page), []); assert.deepEqual(await iconLabelAudit(page), []);
    await page.setViewportSize({ width: 1000, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await screenshot("notes-narrow");
    await page.keyboard.press("Control+k"); await page.getByRole("combobox").fill("新建笔记"); await page.getByRole("combobox").press("Enter");
    await page.getByRole("dialog", { name: "选择文献新建笔记" }).waitFor(); await page.keyboard.press("Escape");
  });
  await check("pagination and export include more than the initial 200 and maximum 1000 records", async () => {
    await page.evaluate(async () => { window.fixture.bulk(1005); await window.fixture.wb.notes.open(); });
    await page.waitForFunction(() => document.querySelectorAll("[data-note-id]").length === 200);
    await page.getByRole("button", { name: "加载更多（200 / 1005）", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("[data-note-id]").length === 400);
    const pending = page.waitForEvent("download"); await button("导出为 Markdown").click();
    const text = await readFile(await (await pending).path(), "utf8");
    assert.equal((text.match(/^### 笔记/gm) ?? []).length, 1005);
    assert.equal(await page.evaluate(() => window.fixture.calls.noteQueries.some((q) => q.offset === "1000")), true);
  });
  await check("empty notes keep both navigation and a useful creation entry", async () => {
    await page.evaluate(async () => { window.fixture.data.notes = []; await window.fixture.wb.notes.refresh(); await window.fixture.wb.refreshDesk(); });
    await page.getByText("把阅读中的想法留在这里", { exact: true }).waitFor();
    assert.ok(await button("新建笔记").count() >= 1);
    assert.match(await nav("笔记").textContent(), /0/);
    await screenshot("notes-empty");
  });
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(`PASS ${checks.length} scenarios; page errors: ${errors.length}; unexpected requests: ${unexpected.length}`);
} catch (failure) {
  console.log(`Failed after ${checks.length} scenarios; errors: ${JSON.stringify(errors)}; unexpected: ${JSON.stringify(unexpected)}`);
  throw failure;
} finally { await browser.close(); }
