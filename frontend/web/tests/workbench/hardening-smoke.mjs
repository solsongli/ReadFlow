import assert from "node:assert/strict";
import { hardeningBrowser } from "./hardening-browser.mjs";
import { contrastAudit, iconLabelAudit } from "./contrast-audit.mjs";

const { browser, page, output, errors, unexpected } = await hardeningBrowser();
const checks = [], button = (name) => page.getByRole("button", { name, exact: true });
const list = () => page.locator("[data-wb-list]");
async function check(name, run) { await run(); checks.push(name); console.log(`ok ${checks.length} - ${name}`); }
async function screenshot(name) { await page.evaluate(() => document.fonts.ready); await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running")); await page.screenshot({ path: `${output}/${name}.png` }); }
async function menu(trigger, choice) { await button(trigger).click(); await page.getByRole("menuitemradio", { name: choice, exact: true }).click(); }
try {
  await check("2000-row library uses bounded DOM, full titles and ReadFlow branding", async () => {
    assert.equal(await page.title(), "文献库 — ReadFlow");
    assert.match(await page.locator('link[rel="icon"]').getAttribute("href"), /readflow-logo\.svg/);
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().list.result.total), 2000);
    assert.ok(await list().getByRole("option").count() < 35);
    assert.equal(await list().getByRole("option").first().getAttribute("aria-setsize"), "2000");
    await screenshot("library-2000");
  });
  await check("scrolling to the last row stays bounded and keyboard range selection crosses windows", async () => {
    await list().evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const last = page.locator('[data-row="2000"] [role="option"]'); await last.waitFor(); await last.click(); await list().focus();
    await page.keyboard.press("Shift+ArrowUp");
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().selectedIds.length === 2);
    assert.deepEqual(await page.evaluate(() => window.fixture.wb.store.getSnapshot().selectedIds), ["1999", "2000"]);
    await page.keyboard.press("k");
    assert.deepEqual(await page.evaluate(() => window.fixture.wb.store.getSnapshot().selectedIds), ["1998"]);
    assert.ok(await list().getByRole("option").count() < 35);
    const before = await list().evaluate((el) => el.scrollTop);
    await page.evaluate(() => window.fixture.wb.refreshList());
    assert.equal(await list().evaluate((el) => el.scrollTop), before, "background refresh must not jump back to selection");
  });
  await check("grouped virtualization keeps sticky headers, duplicate membership and collapse", async () => {
    await menu("显示", "按分组");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await list().evaluate((el) => { el.scrollTop = 1000; });
    const header = list().locator("button[aria-expanded]").first();
    await page.waitForFunction(() => document.querySelector('[data-wb-list]')?.scrollTop === 1000);
    await header.waitFor();
    const a = await header.boundingBox(), b = await list().boundingBox(); assert.ok(Math.abs(a.y - b.y) < 2);
    await header.click(); assert.equal(await header.getAttribute("aria-expanded"), "false");
    assert.ok(await list().getByRole("option").count() < 35);
    await menu("显示", "列表"); await menu("显示", "紧凑");
    assert.equal(await list().getByRole("option").first().evaluate((el) => el.getBoundingClientRect().height), 36);
    await menu("显示", "双语");
  });
  await check("search is debounced and a single matching result remains selectable", async () => {
    const before = await page.evaluate(() => window.fixture.calls.filter((c) => c.method === "list").length);
    await page.getByRole("searchbox", { name: "搜索文献" }).fill("Research paper 2000");
    assert.equal(await page.evaluate(() => window.fixture.calls.filter((c) => c.method === "list").length), before);
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().list.result.items.length === 1);
    assert.equal(await list().getByRole("option").count(), 1);
    await list().getByRole("option").click();
  });
  await check("service failures preserve rows and recover automatically with backoff", async () => {
    await page.evaluate(async () => { window.fixture.settings.offline = true; await window.fixture.wb.refreshAll(); });
    await page.getByText("无法连接本地文献服务", { exact: true }).waitFor();
    assert.equal(await list().getByRole("option").count(), 1);
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().connection.attempt >= 1);
    await page.evaluate(() => { window.fixture.settings.offline = false; });
    await page.getByText("无法连接本地文献服务", { exact: true }).waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().list.status), "ready");
  });
  await check("failed writes expose an explicit retry and are not replayed automatically", async () => {
    await page.evaluate(() => { window.fixture.settings.failWrite = true; });
    const before = await page.evaluate(() => window.fixture.calls.filter((c) => c.method === "updateState").length);
    await button("加星标").click(); await page.getByRole("alert").getByRole("button", { name: "重试", exact: true }).waitFor();
    await page.getByText("无法连接本地文献服务", { exact: true }).waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.fixture.calls.filter((c) => c.method === "updateState").length), before + 1);
    await page.evaluate(() => { window.fixture.settings.failWrite = false; });
    await page.getByRole("alert").getByRole("button", { name: "重试", exact: true }).click();
    await button("取消星标").waitFor();
  });
  await check("shortcut panel uses shared groups, keyboard focus and command entry", async () => {
    await page.keyboard.press("Control+/"); const dialog = page.getByRole("dialog", { name: "键盘快捷键" }); await dialog.waitFor();
    for (const group of ["通用", "文献库", "阅读", "笔记"]) assert.equal(await dialog.getByRole("region", { name: `${group}快捷键` }).count(), 1);
    await page.keyboard.press("Tab");
    assert.equal(await button("关闭快捷键面板").evaluate((el) => getComputedStyle(el).outlineStyle), "solid");
    assert.equal(await button("关闭快捷键面板").evaluate((el) => getComputedStyle(el).outlineWidth), "2px");
    await screenshot("shortcuts"); await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k"); await page.getByRole("combobox").fill("键盘快捷键"); await page.getByRole("combobox").press("Enter"); await dialog.waitFor(); await page.keyboard.press("Escape");
  });
  await check("reader document titles, iframe shortcuts and window-level file drops stay integrated", async () => {
    await list().getByRole("option").dblclick(); await page.frameLocator("iframe").getByText("Offline Reader").click();
    assert.match(await page.title(), /^Research paper 2000.* — ReadFlow$/);
    await page.keyboard.press("Control+/"); await page.getByRole("dialog", { name: "键盘快捷键" }).waitFor(); await page.keyboard.press("Escape");
    await page.locator("iframe").evaluate((el) => {
      const child = el.contentWindow, transfer = new child.DataTransfer(); transfer.items.add(new child.File(["PDF"], "from-reader.pdf", { type: "application/pdf" }));
      child.document.body.dispatchEvent(new child.DragEvent("dragenter", { dataTransfer: transfer, bubbles: true, cancelable: true }));
    });
    await page.getByText("松开以导入 1 个 PDF", { exact: true }).waitFor();
    await page.locator("iframe").evaluate((el) => {
      const child = el.contentWindow, transfer = new child.DataTransfer(); transfer.items.add(new child.File(["PDF"], "from-reader.pdf", { type: "application/pdf" }));
      child.document.body.dispatchEvent(new child.DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => window.fixture.calls.some((c) => c.method === "upload" && c.name === "from-reader.pdf"));
  });
  await check("dark desk, library and shortcuts have readable text and labelled icon buttons", async () => {
    await button("书桌").click(); await menu("设置", "深色");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await contrastAudit(page), []); assert.deepEqual(await iconLabelAudit(page), []); await screenshot("desk-dark");
    await page.evaluate(async () => { for (const row of window.fixture.rows) { row.doi = "synthetic"; row.title_translated = "合成题名"; row.text_status = "native_text"; } await window.fixture.wb.refreshDesk(); });
    await page.getByRole("region", { name: "文献库概览" }).getByText("一切就绪", { exact: true }).waitFor();
    await button("全部文献").click(); assert.deepEqual(await contrastAudit(page), []); assert.deepEqual(await iconLabelAudit(page), []);
    await page.keyboard.press("Control+/"); await page.getByRole("dialog", { name: "键盘快捷键" }).waitFor();
    assert.deepEqual(await contrastAudit(page), []); await screenshot("shortcuts-dark"); await page.keyboard.press("Escape");
    await menu("设置", "浅色");
  });
  await check("empty desk and library show the same welcome page without inspector placeholders", async () => {
    await page.goto("http://hardening.test/workbench.html?empty&desk");
    await page.getByRole("region", { name: "欢迎使用 ReadFlow" }).waitFor();
    assert.equal(await page.getByRole("region", { name: "欢迎使用 ReadFlow" }).getByRole("button").count(), 3);
    await button("全部文献").click();
    assert.equal(await page.getByLabel("详情", { exact: true }).count(), 0);
    await button("回收站").click(); await page.getByText("回收站是空的", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("详情", { exact: true }).count(), 0);
    await button("全部文献").click(); await page.getByRole("region", { name: "欢迎使用 ReadFlow" }).waitFor();
    await screenshot("welcome-light");
    const picker = page.waitForEvent("filechooser"); await button("从 Zotero / CSL JSON 导入…").click(); await (await picker).setFiles([]);
    await button("设置翻译服务").click(); await page.getByRole("main", { name: "翻译", exact: true }).waitFor(); await button("完成").click();
    await menu("设置", "深色"); await screenshot("welcome-dark");
  });
  await check("non-PDF drops are ignored; mixed drops show the PDF count across the whole window", async () => {
    await page.evaluate(() => { const data = new DataTransfer(); data.items.add(new File(["text"], "note.txt", { type: "text/plain" })); window.dispatchEvent(new DragEvent("drop", { dataTransfer: data, cancelable: true })); });
    await page.getByRole("status").getByText("仅支持 PDF 文件，未导入其他文件。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.calls.filter((c) => c.method === "upload").length), 0);
    await page.evaluate(() => { const data = new DataTransfer(); for (const name of ["one.pdf", "two.pdf", "note.txt"]) data.items.add(new File([name], name, { type: name.endsWith("pdf") ? "application/pdf" : "text/plain" })); window.pendingDrop = data; document.body.dispatchEvent(new DragEvent("dragenter", { dataTransfer: data, bubbles: true, cancelable: true })); });
    await page.getByText("松开以导入 2 个 PDF", { exact: true }).waitFor(); await screenshot("window-drop");
    await page.evaluate(() => document.body.dispatchEvent(new DragEvent("drop", { dataTransfer: window.pendingDrop, bubbles: true, cancelable: true })));
    await page.waitForFunction(() => window.fixture.calls.filter((c) => c.method === "upload").length === 2);
    await page.getByRole("region", { name: "欢迎使用 ReadFlow" }).waitFor({ state: "hidden" });
  });
  await check("render boundary keeps a recoverable screen and copies only sanitized diagnostics", async () => {
    await page.evaluate(() => { const wb = window.fixture.wb, state = wb.store.getSnapshot(); wb.store.actions.patch({ list: { ...state.list, result: { ...state.list.result, items: [null] } } }); });
    await page.getByRole("main", { name: "工作台错误恢复" }).waitFor(); await button("复制诊断信息").click();
    const safe = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(safe, /错误名：TypeError/); assert.match(safe, /组件栈/); assert.doesNotMatch(safe, /from-reader|one\.pdf|file:\/\/|http:|\/home\//);
    await screenshot("error-boundary"); await button("重新载入").click(); await page.getByRole("region", { name: "欢迎使用 ReadFlow" }).waitFor();
  });
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(`PASS ${checks.length} scenarios; page errors: ${errors.length}; unexpected requests: ${unexpected.length}`);
} catch (error) { console.log(`Completed ${checks.length} scenarios; page errors: ${errors.length}; unexpected: ${JSON.stringify(unexpected)}`); throw error; }
finally { await browser.close(); }
