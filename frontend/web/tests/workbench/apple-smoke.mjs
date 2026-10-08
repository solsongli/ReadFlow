// Run from frontend/web: node tests/workbench/apple-smoke.mjs
// All browser requests are fulfilled in memory. No server, preview, real library or network is used.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = process.cwd();
const output = "/tmp/readflow-t1/screenshots";
await mkdir(output, { recursive: true });
const bundle = await build({ entryPoints: ["tests/workbench/apple-fixture.tsx"], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": resolve(root, "src") }, logLevel: "silent" });
const css = await readFile("dist/css/workbench.css", "utf8");
const browser = await chromium.launch({ executablePath: process.env.READFLOW_CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
const fonts = new Set();
const checks = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname === "/workbench.html") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><link rel="stylesheet" href="/dist/css/workbench.css"><body><div id="workbench-root"></div><script type="module" src="/fixture.js"></script></body></html>' });
  if (pathname === "/fixture.js") return route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text });
  if (pathname === "/dist/css/workbench.css") return route.fulfill({ contentType: "text/css", body: css });
  if (/^\/src\/assets\/fonts\/inter\/InterVariable(?:-Italic)?\.woff2$/.test(pathname)) {
    fonts.add(pathname);
    return route.fulfill({ contentType: "font/woff2", body: await readFile(resolve(root, pathname.slice(1))) });
  }
  if (pathname === "/src/assets/readflow-logo.svg") return route.fulfill({ contentType: "image/svg+xml", body: await readFile(resolve(root, pathname.slice(1))) });
  if (/^\/api\/research\/workbench\/(?:flashcards|decks|card-reviews|canvases|todos)$/.test(pathname)) {
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
  }
  throw new Error(`Unexpected offline request: ${pathname}`);
});
const button = (name) => page.getByRole("button", { name, exact: true });
const options = () => page.locator('[data-wb-list] [role="option"]');
const selectRow = (id) => page.locator(`[data-row="${id}"] [role="option"]`).first();
const state = () => page.evaluate(() => window.fixture.wb.store.getSnapshot());
async function check(name, work) { await work(); checks.push(name); console.log(`ok ${checks.length} - ${name}`); }
async function menuChoice(trigger, choice) { await button(trigger).click(); await page.getByRole("menuitemradio", { name: choice, exact: true }).click(); }

try {
  await page.goto("http://readflow.test/workbench.html");
  await options().first().waitFor();
  await check("initial shell, dimensions, fonts and light theme", async () => {
    assert.equal(await page.getByRole("navigation", { name: "阅读器标签页" }).count(), 0);
    assert.equal(await page.locator("footer").count(), 0);
    assert.equal((await page.getByLabel("导航", { exact: true }).boundingBox()).width, 236);
    assert.equal((await page.getByLabel("工作台工具栏").boundingBox()).height, 52);
    assert.equal((await page.getByLabel("详情", { exact: true }).boundingBox()).width, 360);
    await page.evaluate(() => document.fonts.load('italic 13px "Inter"'));
    await page.evaluate(() => document.fonts.ready);
    assert.equal(fonts.size, 2);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).fontSize), "13px");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 255, 255)");
    assert.equal(await page.getByRole("columnheader").count(), 0);
    await page.screenshot({ path: `${output}/library-light.png` });
  });
  await check("dark, system and light themes", async () => {
    await menuChoice("设置", "深色");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(30, 30, 30)");
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-wb-list] [role="option"]')).color === "rgb(245, 245, 247)");
    await page.screenshot({ path: `${output}/library-dark.png` });
    await menuChoice("设置", "跟随系统");
    await page.emulateMedia({ colorScheme: "dark" });
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(30, 30, 30)");
    await menuChoice("设置", "浅色");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 255, 255)");
  });
  await check("collapsed sidebar persists through reload", async () => {
    await button("收起侧栏").click();
    assert.equal((await page.getByLabel("导航", { exact: true }).boundingBox()).width, 52);
    await page.reload();
    await button("展开侧栏").waitFor();
    assert.equal((await state()).sidebarCollapsed, true);
    await button("展开侧栏").click();
  });
  await check("tags reveal beyond eight and fold back", async () => {
    const tags = page.getByRole("region", { name: "标签", exact: true });
    // Each tag row has its filter button plus a "⋯" options button (colour, key, rename, delete).
    const rows = () => tags.getByRole("button", { name: /^标签「.+」选项$/ }).count();
    assert.equal(await rows(), 8);
    await button("更多（2）").click();
    assert.equal(await rows(), 10);
    await button("收起").click();
  });
  await check("live search keeps group and clears all filters", async () => {
    await button("具身智能 · VLA").click();
    await page.getByRole("searchbox", { name: "搜索文献" }).fill("OpenVLA");
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().list.result.items.length === 1);
    assert.equal((await state()).groupId, "vla");
    assert.equal(await options().count(), 1);
    await button("清除筛选").click();
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().list.result.items.length === 11);
  });
  await check("all sort keys and both directions reach the API", async () => {
    for (const [label, key] of [["标题", "title"], ["年份", "year"], ["作者", "author"], ["出处", "venue"], ["添加时间", "added"]]) {
      await menuChoice("排序", label);
      assert.equal((await state()).sort, key);
    }
    await menuChoice("排序", "升序");
    await page.waitForFunction(() => window.fixture.calls.at(-1)?.query?.order === "asc");
    await menuChoice("排序", "降序");
  });
  await check("compact single line and grouped repeated memberships", async () => {
    await menuChoice("显示", "紧凑");
    assert.ok((await selectRow("1").boundingBox()).height < 40);
    assert.equal(await selectRow("1").getByText("SafeVLA：基于约束学习的视觉-语言-动作模型安全对齐").count(), 0);
    await menuChoice("显示", "按分组");
    assert.equal(await page.locator('[data-row="1"]').count(), 3);
    await page.screenshot({ path: `${output}/grouped-compact.png` });
    await menuChoice("显示", "列表");
    await menuChoice("显示", "双语");
    assert.ok((await selectRow("5").boundingBox()).height < (await selectRow("1").boundingBox()).height);
  });
  await check("Ctrl/Shift selection and keyboard navigation/star", async () => {
    await selectRow("1").click();
    await selectRow("3").click({ modifiers: ["Shift"] });
    assert.equal((await state()).selectedIds.length, 3);
    await selectRow("2").click({ modifiers: ["Control"] });
    assert.deepEqual((await state()).selectedIds, ["1", "3"]);
    await page.getByRole("heading", { name: "已选 2 篇文献" }).waitFor();
    await selectRow("1").click();
    await page.keyboard.press("j");
    assert.deepEqual((await state()).selectedIds, ["2"]);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("s");
    await page.waitForFunction(() => window.fixture.rows[0].starred);
  });
  await check("G opens picker; membership add/remove keeps original groups", async () => {
    await page.keyboard.press("g");
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().pickerOpen, null, { timeout: 8000 });
    const picker = page.getByRole("dialog");
    await picker.getByLabel("组会 10-08", { exact: true }).check();
    await page.waitForFunction(() => window.fixture.rows[0].group_ids.includes("meeting"));
    assert.ok((await page.evaluate(() => window.fixture.rows[0].group_ids)).includes("safe"));
    await picker.getByLabel("组会 10-08", { exact: true }).uncheck();
    await page.keyboard.press("Escape");
  });
  await check("drag selected papers to group adds membership", async () => {
    await selectRow("1").dragTo(button("组会 10-08"));
    await page.waitForFunction(() => window.fixture.rows[0].group_ids.includes("meeting"));
  });
  await check("right click group, rename, inline deletion and retained papers", async () => {
    await button("组会 10-08").click({ button: "right" });
    await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
    await page.getByRole("textbox", { name: "分组名称", exact: true }).fill("组会新版");
    await page.getByRole("textbox", { name: "分组名称", exact: true }).press("Enter");
    await button("组会新版").click({ button: "right" });
    await page.getByRole("menuitem", { name: "删除分组…", exact: true }).click();
    await page.getByRole("alertdialog").getByText(/文献本身不会被删除/).waitFor();
    await button("删除分组").click();
    await page.waitForFunction(() => !window.fixture.groups.some((g) => g.id === "meeting"));
    assert.equal(await page.evaluate(() => window.fixture.rows.length), 11);
  });
  await check("inline title save/cancel, metadata edit and abstract expansion", async () => {
    await selectRow("1").click();
    await page.getByTitle("编辑中文题名", { exact: true }).click();
    await page.getByRole("textbox", { name: "中文题名" }).fill("新的中文题名");
    await page.getByRole("textbox", { name: "中文题名" }).press("Enter");
    await page.getByTitle("编辑中文题名", { exact: true }).click();
    await page.getByRole("textbox", { name: "中文题名" }).fill("不保存");
    await page.getByRole("textbox", { name: "中文题名" }).press("Escape");
    assert.equal(await page.evaluate(() => window.fixture.rows[0].title_translated), "新的中文题名");
    await page.getByTitle("编辑出处", { exact: true }).click();
    await page.getByRole("textbox", { name: "出处", exact: true }).fill("CoRL");
    await page.getByRole("textbox", { name: "出处", exact: true }).press("Enter");
    assert.equal(await page.evaluate(() => window.fixture.rows[0].venue), "CoRL");
    await page.getByRole("region", { name: "摘要", exact: true }).getByRole("button", { name: "展开" }).click();
    assert.equal(await page.getByRole("region", { name: "摘要", exact: true }).getByRole("button").getAttribute("aria-expanded"), "true");
  });
  await check("citations copy and previews; export actions", async () => {
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copied = text; } } }));
    await button("复制参考文献 GB/T 7714").click();
    assert.match(await page.evaluate(() => window.copied), /ZHANG B/);
    await page.getByRole("button", { name: /^复制 BibTeX/ }).click();
    assert.match(await page.evaluate(() => window.copied), /^@misc/);
    await button("预览引用").click();
    await button("复制引用命令").click();
    assert.match(await page.evaluate(() => window.copied), /^\\cite\{/);
    await page.keyboard.press("Escape");
    for (const format of ["Markdown", "BibTeX"]) {
      await button("更多操作").click();
      await page.getByRole("menuitem", { name: `导出 ${format}`, exact: true }).click();
    }
    assert.equal(await page.evaluate(() => window.fixture.calls.filter((c) => c.method === "export").length), 2);
  });
  await check("trash shortcut, undo and native reader launch stay integrated", async () => {
    await selectRow("2").click();
    await page.keyboard.press("Delete");
    await page.waitForFunction(() => Boolean(window.fixture.rows[1].deleted_at));
    await button("撤销").click();
    await page.waitForFunction(() => !window.fixture.rows[1].deleted_at);
    await page.evaluate(() => {
      window.__opened = [];
      window.fixture.wb.openReader = async (id) => {
        window.__opened.push(id);
        return true;
      };
    });
    await selectRow("1").dblclick();
    assert.deepEqual(await page.evaluate(() => window.__opened), ["1"]);
    assert.equal(await page.locator("iframe").count(), 0);
    await selectRow("2").click();
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.evaluate(() => window.__opened), ["1", "2"]);
  });
  await check("command palette focus, Escape and slash search", async () => {
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "命令与搜索" }).waitFor();
    await page.getByRole("dialog", { name: "命令与搜索" }).getByRole("combobox").fill("打开书桌");
    await page.getByRole("dialog", { name: "命令与搜索" }).getByRole("combobox").press("Enter");
    await page.getByRole("main", { name: "书桌" }).waitFor();
    await page.keyboard.press("Control+2");
    await page.keyboard.press("/");
    assert.equal(await page.getByRole("searchbox").evaluate((el) => el === document.activeElement), true);
    await page.getByRole("searchbox").press("Escape");
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "命令与搜索" }).getByRole("combobox").press("Shift+Tab");
    assert.equal(await page.getByRole("dialog", { name: "命令与搜索" }).evaluate((el) => el.contains(document.activeElement)), true);
    await page.keyboard.press("Escape");
  });
  await check("import menus, JSON preview and PDF picker remain available", async () => {
    await button("导入").click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "Zotero / CSL JSON…", exact: true }).click();
    await (await chooser).setFiles({ name: "sample.json", mimeType: "application/json", buffer: Buffer.from('[{"title":"Sample"}]') });
    await button("确认导入").click();
    await button("导入").click();
    const pdfChooser = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "PDF 文件…", exact: true }).click();
    await (await pdfChooser).setFiles({ name: "sample.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 fixture") });
    await page.waitForFunction(() => window.fixture.calls.some((c) => c.method === "upload"));
  });
  await check("idle task ring hides and reduced motion disables transitions", async () => {
    await page.evaluate(async () => { for (const row of window.fixture.rows) row.translation.status = "none"; await window.fixture.wb.refreshAll(); });
    assert.equal(await page.getByRole("progressbar", { name: /后台任务/ }).count(), 0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await button("排序").evaluate((el) => getComputedStyle(el).transitionDuration), "0s");
    await page.setViewportSize({ width: 1100, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/library-1100.png` });
  });
  assert.deepEqual(errors, []);
  console.log(`PASS ${checks.length} scenarios; page errors: ${errors.length}; intercepted fonts: ${fonts.size}`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  await writeFile("/tmp/readflow-t1/smoke-failure.json", JSON.stringify({ errors, state: await state(), focus: await page.evaluate(() => document.activeElement?.outerHTML), dialogs: await page.getByRole("dialog").allTextContents() }, null, 2));
  throw error;
} finally { await browser.close(); }
