// Offline fixture only: no process is restarted and no receiver port is touched.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { settingsBrowser } from "./settings-browser.mjs";

const { browser, page, output, errors, unexpected } = await settingsBrowser({ output: "/tmp/readflow-t9/screenshots" });
const checks = [];
const button = name => page.getByRole("button", { name, exact: true });
const card = () => page.getByRole("region", { name: "Zotero Connector", exact: true });
const toggle = () => page.getByRole("switch", { name: "接收浏览器 Zotero Connector 的保存", exact: true });
async function check(name, work) { await work(); checks.push(name); console.log(`ok ${checks.length} - ${name}`); }
async function open() { await page.evaluate(() => window.fixture.wb.openSettings("library")); await card().getByText(/正在接收|已关闭|端口已被占用|出错：/).first().waitFor(); }
async function screenshot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  await page.screenshot({ path: `${output}/${name}.png` });
}
async function status(value) {
  await page.evaluate(value => { window.testConnector.connection = { ...value, real_connector_verified: false }; }, value);
  await button("刷新状态").click();
}
try {
  await open();
  await check("default enabled switch and listening endpoint are visible in both themes", async () => {
    assert.equal(await toggle().getAttribute("aria-checked"), "true");
    await card().getByText("正在接收 · 127.0.0.1:23119", { exact: true }).waitFor();
    await screenshot("connector-listening-light");
    await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
    await screenshot("connector-listening-dark");
  });
  await check("save persists across category navigation while actual listener remains unchanged", async () => {
    await toggle().click();
    await card().getByText("重启 ReadFlow 后生效", { exact: true }).waitFor();
    assert.equal(await toggle().getAttribute("aria-checked"), "false");
    await card().getByText("正在接收 · 127.0.0.1:23119", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.testConnector.restarts), 0);
    await page.evaluate(() => window.fixture.wb.openSettings("general"));
    await page.getByRole("heading", { name: "通用", exact: true }).waitFor();
    await open();
    await button("立即重启").waitFor();
    assert.equal(await toggle().getAttribute("aria-checked"), "false");
    await screenshot("connector-restart-pending-dark");
  });
  await check("busy state identifies occupant without offering any process reclamation", async () => {
    await status({ status: "busy", port: 23119, occupant: "Zotero（PID 1234）" });
    await card().getByText("端口已被占用（Zotero 可能正在运行），未启用", { exact: true }).waitFor();
    await card().getByText(/Zotero（PID 1234）/).waitFor();
    assert.ok(!(await card().textContent()).includes("kill"));
    await screenshot("connector-busy-dark");
    await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "light" }));
    await screenshot("connector-busy-light");
  });
  await check("disabled, error and custom-port states remain truthful", async () => {
    await status({ status: "disabled", port: null });
    await card().getByText("已关闭", { exact: true }).waitFor();
    await status({ status: "error", port: 23119, message: "无法绑定端口。" });
    await card().getByText("出错：无法绑定端口。", { exact: true }).waitFor();
    await status({ status: "listening", port: 23219 });
    await card().getByText("正在接收 · 127.0.0.1:23219", { exact: true }).waitFor();
    await page.evaluate(() => { window.testConnector.overridden = true; });
    await button("刷新状态").click();
    await card().getByText(/当前由启动环境变量控制/).waitFor();
    await screenshot("connector-environment-override-light");
  });
  await check("failed writes preserve the switch and retry succeeds", async () => {
    await page.evaluate(() => { window.testConnector.failSave = true; });
    await toggle().click();
    await card().getByText("Connector 设置保存失败，请重试。", { exact: true }).waitFor();
    assert.equal(await toggle().getAttribute("aria-checked"), "false");
    await page.evaluate(() => { window.testConnector.failSave = false; });
    await toggle().click();
    await page.waitForFunction(() => window.testConnector.enabled === true);
    assert.equal(await toggle().getAttribute("aria-checked"), "true");
    assert.equal(await button("立即重启").count(), 0);
  });
  await check("restart failure offers retry and successful action calls the bridge exactly once", async () => {
    await toggle().click(); await button("立即重启").waitFor();
    await page.evaluate(() => { window.testConnector.failRestart = true; });
    await button("立即重启").click();
    await card().getByText("无法重启 ReadFlow，请手动退出后重新打开。", { exact: true }).waitFor();
    await page.evaluate(() => { window.testConnector.failRestart = false; });
    await button("立即重启").click();
    await page.waitForFunction(() => window.testConnector.restarts === 1);
  });
  await check("ordinary browser has read-only status and no switch or restart action", async () => {
    await page.evaluate(() => { delete window.retainPdfDesktop; window.fixture.wb.openSettings("general"); });
    await page.getByRole("heading", { name: "通用", exact: true }).waitFor();
    await open();
    assert.equal(await toggle().count(), 0);
    assert.equal(await button("立即重启").count(), 0);
    await card().getByText("请在 ReadFlow 桌面版中更改接收设置。", { exact: true }).waitFor();
    await screenshot("connector-browser-readonly-light");
  });
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  await writeFile("/tmp/readflow-t9/connector-smoke.json", JSON.stringify({ checks, errors, unexpected }, null, 2));
  console.log(`${checks.length}/${checks.length}, page errors 0, unexpected requests 0`);
} finally { await browser.close(); }
