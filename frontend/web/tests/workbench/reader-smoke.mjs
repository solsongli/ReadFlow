import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { readerBrowser } from "./reader-browser.mjs";

const { browser, context, page, errors, unhandled, output, hash } = await readerBrowser();
const checks = [];
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "21111111-1111-4111-8111-111111111111";
const button = (name) => page.getByRole("button", { name, exact: true });
const frameById = (id) => page.frames().find((frame) => frame.url().includes(`research_item_id=${id}`));
async function check(name, work) { await work(); checks.push(name); console.log(`ok ${checks.length} - ${name}`); }
async function appearance(name) { await button("设置").click(); await page.getByRole("menuitemradio", { name, exact: true }).click(); }
async function gotoPage(frame, number) {
  await frame.locator(".reader-react-hud-page-btn").click();
  await frame.getByRole("textbox", { name: "跳转到页码" }).fill(String(number));
  await frame.getByRole("textbox", { name: "跳转到页码" }).press("Enter");
  await frame.getByRole("button", { name: new RegExp(`当前第 ${number} 页`) }).waitFor();
}
try {
  await page.locator('[data-wb-list] [role="option"]').first().dblclick();
  await page.frameLocator('iframe').getByRole("button", { name: /当前第 3 页，共 8 页/ }).waitFor();
  const first = frameById(firstId);
  await check("real PDF resumes via page_idx with hidden close and isolated shared theme", async () => {
    const url = new URL(first.url());
    assert.equal(url.searchParams.get("embed"), "workbench");
    assert.equal(url.searchParams.get("scheme"), "light");
    assert.equal(url.searchParams.get("page_idx"), "2");
    assert.equal(await first.locator("#reader-close-home-btn").count(), 0);
    assert.equal(await first.evaluate(() => document.documentElement.dataset.theme), "classic");
    assert.equal(await first.evaluate(() => window.themeReads.length + window.themeWrites.length), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("retainpdf.theme")), "mojia");
    await page.waitForFunction(() => window.fixture.calls.some((call) => call[0] === "opened" && call[2]?.page === 3));
    assert.equal(await page.evaluate(() => window.fixture.calls.some((call) => call[0] === "opened" && call[2]?.page === 1)), false, "initial page 1 must not overwrite the resume anchor");
    await page.screenshot({ path: `${output}/reader-light.png` });
  });
  await check("dark mode changes chrome live without navigation and keeps the PDF white", async () => {
    const token = await first.evaluate(() => window.documentToken);
    await appearance("深色");
    await first.waitForFunction(() => document.documentElement.dataset.theme === "graphite");
    assert.equal(await first.evaluate(() => window.documentToken), token);
    assert.equal(new URL(first.url()).searchParams.get("scheme"), "light", "scheme changes use messages, not src replacement");
    assert.equal(await first.locator(".reader-react-root").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(30, 30, 30)");
    assert.match(await first.locator(".reader-react-hud").evaluate((el) => getComputedStyle(el).fontFamily), /Inter/);
    await first.evaluate(() => document.fonts.ready);
    assert.doesNotMatch(await first.locator(".textLayer span").first().evaluate((el) => getComputedStyle(el).fontFamily), /ReadFlow Inter/);
    const pixel = await first.locator("canvas").first().evaluate((el) => [...el.getContext("2d").getImageData(5, 5, 1, 1).data]);
    assert.deepEqual(pixel, [255, 255, 255, 255]);
    assert.equal(await first.locator("canvas").first().evaluate((el) => getComputedStyle(el).filter), "none");
    assert.equal(await first.evaluate(() => window.themeReads.length + window.themeWrites.length), 0);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('nav[aria-label="阅读器标签页"] button[aria-current="page"]')).color === "rgb(245, 245, 247)");
    await page.screenshot({ path: `${output}/reader-dark.png` });
  });
  await check("real page changes persist incrementally, update desk progress and reopen correctly", async () => {
    await first.locator(".reader-react-hud-page-btn").click();
    const callsBefore = await page.evaluate(() => window.fixture.calls.filter((call) => call[0] === "list").length);
    await first.getByRole("textbox", { name: "跳转到页码" }).fill("6");
    await first.getByRole("textbox", { name: "跳转到页码" }).press("Enter");
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().list.result.items[0].read_page === 6);
    assert.equal(await page.evaluate(() => window.fixture.calls.filter((call) => call[0] === "list").length), callsBefore);
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().desk.data.continue_reading[0].read_page), 6);
    assert.equal(await page.evaluate(() => window.fixture.rows[0].read_status), "reading");
    const savedSix = await page.evaluate(() => window.fixture.calls.filter((call) => call[0] === "opened" && call[2]?.page === 6).length);
    await page.getByRole("navigation", { name: "阅读器标签页" }).getByRole("button", { name: /^关闭/ }).click();
    await page.locator('[data-wb-list] [role="option"]').first().dblclick();
    await page.frameLocator('iframe').getByRole("button", { name: /当前第 6 页，共 8 页/ }).waitFor();
    assert.equal(new URL(frameById(firstId).url()).searchParams.get("page_idx"), "5");
    // A page label appears before the Reader's delayed anchor retries finish. Its first progress
    // report is the readiness signal; selecting text earlier can be cleared by a pending jump.
    await page.waitForFunction((before) => window.fixture.calls.filter((call) => call[0] === "opened" && call[2]?.page === 6).length > before, savedSix);
  });
  const current = frameById(firstId);
  await check("native annotation create, edit and delete refresh only the owning row/detail", async () => {
    const text = current.getByText("ReadFlow synthetic page 6", { exact: true }).first();
    await text.waitFor();
    await text.evaluate((element) => {
      const range = document.createRange(); range.selectNodeContents(element);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await current.getByRole("button", { name: "添加批注", exact: true }).click();
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().list.result.items[0].notes_count === 1);
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().detail.item.notes.length), 1);
    await current.getByRole("button", { name: "添加笔记", exact: true }).click();
    await current.getByPlaceholder("写点想法…").fill("Embedded annotation edit");
    await current.getByRole("button", { name: "保存", exact: true }).click();
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().detail.item.notes[0]?.body === "Embedded annotation edit");
    await current.getByRole("button", { name: "删除", exact: true }).click();
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().list.result.items[0].notes_count === 0);
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().detail.item.notes.length), 0);
  });
  await check("all Reader frames receive system scheme changes without reloading", async () => {
    await page.getByRole("navigation", { name: "阅读器标签页" }).getByRole("button", { name: "文献库", exact: true }).click();
    await page.locator('[data-wb-list] [role="option"]').nth(1).dblclick();
    await page.frameLocator('iframe[title="ReadFlow Reader 2"]').getByRole("button", { name: /共 8 页/ }).waitFor();
    const second = frameById(secondId);
    assert.equal(new URL(second.url()).searchParams.get("scheme"), "dark");
    const tokens = await Promise.all([current, second].map((frame) => frame.evaluate(() => window.documentToken)));
    await appearance("跟随系统");
    await page.emulateMedia({ colorScheme: "light" });
    for (const frame of [current, second]) await frame.waitForFunction(() => document.documentElement.dataset.theme === "classic");
    await page.emulateMedia({ colorScheme: "dark" });
    for (const frame of [current, second]) await frame.waitForFunction(() => document.documentElement.dataset.theme === "graphite");
    assert.deepEqual(await Promise.all([current, second].map((frame) => frame.evaluate(() => window.documentToken))), tokens);
  });
  await check("foreign origins, unowned frames and cross-item spoofing cannot mutate progress", async () => {
    const second = frameById(secondId);
    await page.waitForFunction(() => window.fixture.rows[1].read_page != null);
    const before = await page.evaluate(() => window.fixture.calls.filter((call) => call[0] === "opened" && call[2]?.page === 8).length);
    await page.evaluate((id) => {
      const data = { type: "readflow:reader-progress", itemId: id, page: 8, pages: 8 };
      window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.test", source: document.querySelector('iframe[title="ReadFlow Reader 1"]').contentWindow, data }));
      window.postMessage(data, location.origin);
    }, firstId);
    await second.evaluate((id) => parent.postMessage({ type: "readflow:reader-progress", itemId: id, page: 8, pages: 8 }, location.origin), firstId);
    await second.evaluate(() => window.postMessage({ type: "readflow:scheme", scheme: "light" }, location.origin));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.fixture.calls.filter((call) => call[0] === "opened" && call[2]?.page === 8).length), before);
    assert.equal(await second.evaluate(() => document.documentElement.dataset.theme), "graphite");
  });
  await check("an explicit note jump reopens an existing Reader at its page_idx anchor", async () => {
    const before = await frameById(firstId).evaluate(() => window.documentToken);
    await page.evaluate((id) => window.fixture.wb.openReader(id, { page: 2 }), firstId);
    await page.frameLocator('iframe[title="ReadFlow Reader 1"]').getByRole("button", { name: /当前第 2 页，共 8 页/ }).waitFor();
    const jumped = frameById(firstId);
    assert.notEqual(await jumped.evaluate(() => window.documentToken), before);
    assert.equal(new URL(jumped.url()).searchParams.get("page_idx"), "1");
    await page.waitForFunction(() => window.fixture.rows[0].read_page === 2);
  });
  await check("legacy close message closes exactly its owned Reader tab", async () => {
    await frameById(secondId).evaluate(() => parent.postMessage({ type: "retainpdf:soft-reader-close" }, location.origin));
    await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().tabs.length === 1);
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().tabs[0].itemId), firstId);
  });
  await check("standalone Reader retains the stored skin and the close button", async () => {
    const standalone = await context.newPage();
    await standalone.goto(`http://reader.test/reader.html?document_id=${hash}&research_item_id=${firstId}&attachment_id=12222222-2222-4222-8222-222222222222`);
    await standalone.locator("canvas").first().waitFor();
    await standalone.locator("#reader-close-home-btn").waitFor();
    assert.equal(await standalone.evaluate(() => document.documentElement.dataset.theme), "mojia");
    assert.ok(await standalone.evaluate(() => window.themeReads.length > 0 && window.themeWrites.length > 0));
    assert.equal(await page.evaluate(() => localStorage.getItem("retainpdf.theme")), "mojia");
    await standalone.close();
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(unhandled, []);
  console.log(`PASS ${checks.length} scenarios; page errors: ${errors.length}; unhandled/network requests: ${unhandled.length}`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  await writeFile("/tmp/readflow-t3/reader-failure.json", JSON.stringify({ errors, unhandled, state: await page.evaluate(() => window.fixture.wb.store.getSnapshot()), texts: await Promise.all(page.frames().map(async (frame) => ({ url: frame.url(), text: await frame.locator("body").innerText().catch(() => "") }))) }, null, 2));
  throw error;
} finally { await browser.close(); }
