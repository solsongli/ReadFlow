import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { readerBrowser } from "../paper-reader/browser.mjs";
const directory = "/tmp/readflow-x2c/screenshots";
await mkdir(directory, { recursive: true });
const env = await readerBrowser("?blocks&configured&x2c", "tests/paper-reader/integration-fixture.tsx");
try {
  const { page, blocks } = env;
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await page.getByRole("button", { name: "翻译全文", exact: true }).click();
  await page.getByText("翻译 35%", { exact: true }).first().waitFor();
  blocks.finish();
  await page.getByText("本次约 842 tokens，其中推理约 512", { exact: true }).waitFor();
  const render = page.locator('[data-block-fallback="render"]');
  const labels = page.locator('[data-block-fallback="label"]');
  await labels.waitFor();
  assert.match(await render.innerText(), /排版失败/);
  assert.match(await labels.innerText(), /图表已正常渲染/);
  assert.doesNotMatch(await labels.innerText(), /排版失败/);
  await page.screenshot({ path: `${directory}/result-semantics-light.png` });
  await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
  await page.screenshot({ path: `${directory}/result-semantics-dark.png`, animations: "disabled" });
  assert.deepEqual(env.errors, []);
  assert.deepEqual(env.unexpected, []);
  console.log("PASS: separate render/label notices, reported reasoning usage, both themes, no external requests");
} finally {
  await env.browser.close();
}
