import assert from "node:assert/strict";
import { settingsBrowser } from "./settings-browser.mjs";

const { browser, page, output, errors, unexpected } = await settingsBrowser({ runtimeOnly: true, output: "/tmp/readflow-x3/screenshots" });
try {
  await page.keyboard.press("Control+,");
  await page.getByRole("navigation", { name: "设置分类" }).getByRole("button", { name: "翻译", exact: true }).click();
  const input = page.getByLabel("翻译 API Key", { exact: true });
  await input.waitFor();
  assert.equal(await page.getByRole("combobox", { name: "翻译服务", exact: true }).inputValue(), "deepseek");
  assert.equal(await page.getByLabel("翻译 API URL", { exact: true }).inputValue(), "https://api.deepseek.com/v1");
  assert.equal(await page.getByLabel("翻译模型", { exact: true }).inputValue(), "deepseek-flash");
  assert.equal(await page.getByLabel("翻译并发数", { exact: true }).inputValue(), "8");
  assert.equal(await input.getAttribute("type"), "password");
  assert.equal(await input.evaluate((el) => el.value.length > 0), true);
  await page.getByText("已配置", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.calls.probes), 0);
  await page.getByRole("button", { name: "显示翻译 API Key", exact: true }).click();
  assert.equal(await input.getAttribute("type"), "text");
  await page.getByLabel("翻译模型", { exact: true }).focus();
  assert.equal(await input.getAttribute("type"), "password");
  await page.getByRole("navigation", { name: "设置分类" }).getByRole("button", { name: "通用", exact: true }).click();
  await page.getByRole("navigation", { name: "设置分类" }).getByRole("button", { name: "翻译", exact: true }).click();
  assert.equal(await input.getAttribute("type"), "password");
  assert.equal(await page.getByRole("checkbox", { name: "翻译时关闭模型思考（更快、更省）" }).isChecked(), true);
  await page.screenshot({ path: `${output}/settings-deepseek-light.png`, animations: "disabled" });
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log("PASS runtime-only configuration and masking; page errors: 0; unexpected requests: 0; model probes: 0");
} finally { await browser.close(); }
