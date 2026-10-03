import assert from "node:assert/strict";
import { settingsBrowser } from "./settings-browser.mjs";
import { contrastAudit, iconLabelAudit } from "./contrast-audit.mjs";

const { browser, page, output, errors, unexpected } = await settingsBrowser();
const checks = [];
const button = (name) => page.getByRole("button", { name, exact: true });
const section = async (name) => { await page.getByRole("navigation", { name: "设置分类" }).getByRole("button", { name, exact: true }).click(); await page.getByRole("main", { name, exact: true }).waitFor(); };
async function screenshot(name) { await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running")); await page.screenshot({ path: `${output}/${name}.png` }); }
async function check(name, work) { await work(); checks.push(name); console.log(`ok ${checks.length} - ${name}`); }
try {
  await check("toolbar import has the same size and vertical alignment as adjacent icons", async () => {
    const boxes = await Promise.all(["排序", "显示", "导入"].map((name) => button(name).boundingBox()));
    assert.ok(boxes.every((box) => box.height === boxes[0].height));
    assert.ok(boxes.every((box) => Math.abs(box.y + box.height / 2 - boxes[0].y - boxes[0].height / 2) <= 1));
  });
  await check("gear opens in-workbench settings with seven categories and no legacy iframe", async () => {
    await button("设置").click();
    assert.equal(await page.getByRole("menuitem", { name: /翻译.*OCR/ }).count(), 0);
    await page.getByRole("menuitem", { name: /^设置…/ }).click();
    assert.equal(await page.getByRole("navigation", { name: "设置分类" }).getByRole("button").count(), 7);
    assert.equal(await page.locator("iframe").count(), 0);
    assert.match(page.url(), /workbench.html$/);
    await page.evaluate(() => document.fonts.ready);
    await screenshot("general-light");
  });
  await check("general appearance, density and startup preference persist", async () => {
    await page.getByRole("radio", { name: "深色", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.wbTheme === "dark");
    await screenshot("general-dark");
    await page.getByRole("radio", { name: "浅色", exact: true }).click();
    await page.getByRole("combobox", { name: "文献列表默认密度" }).selectOption("compact");
    await page.getByRole("combobox", { name: "启动时显示" }).selectOption("library");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("readflow.workbench.prefs.v1")).startView), "library");
    await button("完成").click();
    assert.equal(await page.evaluate(() => window.fixture.wb.store.getSnapshot().density), "compact");
    await page.keyboard.press("Control+,");
    await page.getByRole("heading", { name: "通用", exact: true }).waitFor();
  });
  await check("translation reads shared configuration and credentials mask on blur and category change", async () => {
    await section("翻译");
    const secret = page.getByLabel("翻译 API Key", { exact: true });
    await secret.waitFor();
    await page.getByText("已配置", { exact: true }).waitFor();
    await page.getByText(/^已就绪 · .* · demo-model$/).waitFor();
    assert.equal(await secret.getAttribute("type"), "password");
    await button("显示翻译 API Key").click();
    assert.equal(await secret.getAttribute("type"), "text");
    await page.getByLabel("翻译模型", { exact: true }).click();
    assert.equal(await secret.getAttribute("type"), "password");
    await button("显示翻译 API Key").click();
    await section("通用"); await section("翻译");
    assert.equal(await secret.getAttribute("type"), "password");
    await screenshot("translation");
  });
  await check("save performs persistence only and detection requires a separate click", async () => {
    await page.getByLabel("翻译模型", { exact: true }).fill("edited-demo-model");
    const saves = await page.evaluate(() => window.testDesktopMetrics.saves);
    await button("保存").click();
    await page.getByRole("status").getByText(/已保存/).waitFor();
    assert.ok(await page.evaluate((before) => window.testDesktopMetrics.saves >= before + 2, saves));
    assert.equal(await page.evaluate(() => window.fixture.calls.probes), 0);
    await page.getByText("会向所选服务发送一次很小的请求", { exact: true }).waitFor();
    await button("检测接口").click();
    await page.getByRole("status").getByText("检测通过", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.calls.probes), 1);
  });
  await check("OCR requires source/size confirmation before installation", async () => {
    await section("本地 OCR");
    await button("下载并安装…").waitFor();
    await button("下载并安装…").click();
    const dialog = page.getByRole("alertdialog", { name: "确认安装 OCR" });
    await dialog.getByText(/12.0 MB/).waitFor();
    await dialog.getByText(/models.example.test/).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.calls.installs), 0);
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.calls.installs), 0);
    await button("下载并安装…").click();
    await button("确认下载并安装").click();
    await page.getByText("就绪", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.calls.installs), 1);
    await screenshot("ocr");
  });
  await check("OCR removal is confirmed and the backend download switch is respected", async () => {
    await button("移除模块").click();
    assert.equal(await page.evaluate(() => window.fixture.calls.removes), 0);
    await button("确认移除").click();
    await button("下载并安装…").waitFor();
    await page.evaluate(() => { window.fixture.data.module.download_enabled = false; });
    await button("刷新状态").click();
    await page.getByText(/当前服务未允许下载/).waitFor();
    assert.equal(await button("下载并安装…").isDisabled(), true);
    assert.equal(await page.evaluate(() => window.fixture.calls.removes), 1);
  });
  await check("AI service unavailability and other read failures use quiet messages with working retry", async () => {
    await page.evaluate(() => { window.fixture.data.aiReadError = 502; });
    await section("AI 伴读");
    const main = page.getByRole("main", { name: "AI 伴读", exact: true });
    const unavailable = "本地 AI 服务未运行。AI 伴读需要它在后台运行；正式版启动时会自动开启。";
    await main.getByText(unavailable, { exact: true }).waitFor();
    for (const failure of [503, "network", 401]) {
      const before = await page.evaluate((value) => { window.fixture.data.aiReadError = value; return window.fixture.calls.aiReads; }, failure);
      await button("重试").click();
      await page.waitForFunction((value) => window.fixture.calls.aiReads > value, before);
      await main.getByText(failure === 401 ? "AI 运行时设置读取失败，请重试。" : unavailable, { exact: true }).waitFor();
      assert.equal(await main.locator(".text-wb-danger").count(), 0);
      assert.equal(await main.getByRole("alert").count(), 0);
    }
    await page.evaluate(() => { window.fixture.data.aiReadError = ""; });
    await button("重试").click(); await page.getByRole("combobox", { name: "AI 运行模式" }).waitFor();
  });
  await check("AI settings include modes, confirmation and shared translation credential handoff", async () => {
    await section("AI 伴读");
    await page.getByText("还没有模型凭据，请先在翻译或此处配置。", { exact: true }).waitFor();
    await button("使用翻译配置").click();
    assert.equal(await page.getByLabel("AI 模型 API Key", { exact: true }).getAttribute("type"), "password");
    await page.getByRole("combobox", { name: "AI 运行模式" }).selectOption("openai");
    await page.getByRole("combobox", { name: "操作确认方式" }).selectOption("green_light");
    await button("保存设置").click();
    await page.getByRole("status").getByText("设置已保存。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.data.ai.agent_confirmation_mode), "green_light");
    assert.equal(await page.evaluate(() => window.fixture.data.ai.configured_runtime), "openai");
    await screenshot("ai");
    await page.getByRole("combobox", { name: "AI 运行模式" }).selectOption("fx");
    await page.getByLabel("FX Gateway URL", { exact: true }).fill("http://127.0.0.1:9001");
    await page.getByLabel("FX 模型", { exact: true }).fill("gateway-demo");
    await page.getByLabel("FX Gateway Key", { exact: true }).fill("演示网关凭据");
    assert.equal(await page.getByLabel("FX Gateway Key", { exact: true }).getAttribute("type"), "password");
    await button("保存设置").click();
    await page.waitForFunction(() => window.fixture.data.ai.configured_runtime === "fx");
  });
  await check("AI revision conflicts retain the user's draft", async () => {
    await page.evaluate(() => { window.fixture.data.conflict = true; });
    await page.getByLabel("FX 模型", { exact: true }).fill("retained-draft");
    await button("保存设置").click();
    await page.getByRole("main", { name: "AI 伴读", exact: true }).getByRole("alert").getByText(/配置已在其他窗口更新/).waitFor();
    assert.equal(await page.getByLabel("FX 模型", { exact: true }).inputValue(), "retained-draft");
    await page.evaluate(() => { window.fixture.data.conflict = false; });
    await button("保存设置").click();
    await page.getByRole("status").getByText("设置已保存。", { exact: true }).waitFor();
  });
  await check("glossary create/edit, default enablement and CSV import reuse the domain controller", async () => {
    await section("术语表");
    await button("已启用").waitFor();
    await button("新建术语表").click();
    await page.getByLabel("术语表名称", { exact: true }).fill("合成术语表");
    await page.getByLabel("第 1 条原文", { exact: true }).fill("agent");
    await page.getByLabel("第 1 条译文", { exact: true }).fill("智能体");
    await button("保存术语表").click();
    await page.waitForFunction(() => window.fixture.glossaries.size === 2);
    const row = page.getByRole("button", { name: /合成术语表/ }).locator("..");
    await row.getByRole("button", { name: "启用", exact: true }).click();
    await row.getByRole("button", { name: "已启用", exact: true }).waitFor();
    await button("CSV 导入").click();
    const chooser = page.waitForEvent("filechooser");
    await button("选择 CSV 文件…").click();
    await (await chooser).setFiles({ name: "demo.csv", mimeType: "text/csv", buffer: Buffer.from("source,target\npolicy,策略") });
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="CSV 内容"]')?.value.includes("policy"));
    await button("导入条目").click();
    assert.equal(await page.getByLabel("第 1 条原文", { exact: true }).inputValue(), "policy");
    await button("保存术语表").click();
    await page.getByRole("status").getByText("已保存。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.calls.glossaryParses), 1);
    await screenshot("glossaries");
  });
  await check("glossary deletion needs local confirmation and clears a removed default", async () => {
    await button("删除术语表…").click();
    assert.equal(await page.evaluate(() => window.fixture.glossaries.size), 2);
    await page.getByRole("alertdialog", { name: "确认删除术语表" }).getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.glossaries.size), 2);
    await button("删除术语表…").click();
    await button("确认删除术语表").click();
    await page.waitForFunction(() => window.fixture.glossaries.size === 1);
    await page.getByRole("status").getByText("已删除。", { exact: true }).waitFor();
    assert.equal(await button("已启用").count(), 0);
  });
  await check("library statistics/import remain available and unsupported purge is absent", async () => {
    await section("文献库");
    await page.getByRole("region", { name: "文献库统计" }).getByText("3", { exact: true }).first().waitFor();
    assert.equal(await page.getByRole("button", { name: /清空回收站/ }).count(), 0);
    await button("从 Zotero / CSL JSON 导入…").click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "Zotero / CSL JSON…", exact: true }).click();
    await (await chooser).setFiles({ name: "demo.json", mimeType: "application/json", buffer: Buffer.from('[{"title":"Demo"}]') });
    await button("确认导入").click();
    await page.waitForFunction(() => window.fixture.calls.imports === 1);
  });
  await check("about shows the injected version, MIT/OFL and no upstream update control", async () => {
    await section("关于 ReadFlow");
    await page.getByText("0.9.0-demo", { exact: true }).waitFor();
    assert.equal(await page.getByText("MIT License", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: /检查更新/ }).count(), 0);
    await page.getByRole("link", { name: /Open Font License/ }).click();
    await button("收起许可").waitFor();
    assert.match(page.url(), /workbench.html$/);
    await button("收起许可").click();
    await screenshot("about");
  });
  await check("desk shortcuts and the command palette open settings categories without navigation", async () => {
    await button("完成").click(); await button("书桌").click(); await button("术语表").click();
    await page.getByRole("main", { name: "术语表", exact: true }).waitFor();
    await button("完成").click();
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill("打开设置");
    await page.getByRole("combobox").press("Enter");
    await page.getByRole("main", { name: "通用", exact: true }).waitFor();
    assert.equal(await page.locator("iframe").count(), 0);
  });
  await check("narrow settings remain usable and completion restores the reader instance", async () => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await section("翻译");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await screenshot("settings-narrow");
    await button("完成").click(); await button("全部文献").click();
    await page.locator('[data-wb-list] [role="option"]').first().dblclick();
    const frame = page.frameLocator("iframe");
    await frame.getByText("Offline reader").click();
    const token = await page.locator("iframe").evaluate((el) => el.contentWindow.documentToken);
    await page.keyboard.press("Control+,");
    await page.getByRole("main", { name: "通用", exact: true }).waitFor();
    await section("翻译");
    await page.getByLabel("翻译模型", { exact: true }).waitFor();
    await button("保存").click();
    await page.waitForFunction(() => document.querySelector("iframe")?.contentWindow.credentialNotifications > 0);
    await button("完成").click();
    assert.equal(await page.locator("iframe").evaluate((el) => el.contentWindow.documentToken), token);
    assert.equal(await page.locator("iframe").isVisible(), true);
  });
  await check("all seven settings categories have readable dark text and labelled icon controls", async () => {
    await page.evaluate(() => window.fixture.wb.openSettings());
    await page.getByRole("radio", { name: "深色", exact: true }).click();
    for (const name of ["通用", "翻译", "本地 OCR", "AI 伴读", "术语表", "文献库", "关于 ReadFlow"]) {
      await section(name); await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.deepEqual(await contrastAudit(page), [], name); assert.deepEqual(await iconLabelAudit(page), [], name);
      if (name === "术语表") { await button("启用").first().click(); await button("已启用").waitFor(); assert.deepEqual(await contrastAudit(page), [], "已启用术语表"); }
      await screenshot(`t6-dark-${name}`);
    }
  });
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(`PASS ${checks.length} scenarios; page errors: ${errors.length}; unexpected requests: ${unexpected.length}`);
} catch (error) {
  // Never dump form values, storage, service state or credential-bearing request payloads.
  console.log(`Failed after ${checks.length} completed scenarios; page errors: ${errors.length}; unexpected requests: ${unexpected.length}`);
  throw error;
} finally { await browser.close(); }
