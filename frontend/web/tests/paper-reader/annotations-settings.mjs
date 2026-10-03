import assert from "node:assert/strict";
import { readerBrowser } from "./browser.mjs";
const { browser, page, errors, unexpected } = await readerBrowser(
  "", "tests/paper-reader/integration-fixture.tsx",
);
try {
  await page.evaluate(() => window.fixture.wb.openSettings("general"));
  await page.getByRole("textbox", { name: "yellow 颜色含义", exact: true }).fill("待引用");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await page.getByRole("toolbar", { name: "批注工具", exact: true })
    .getByRole("button", { name: "待引用", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await page.getByRole("toolbar", { name: "批注工具", exact: true })
    .getByRole("button", { name: "待引用", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log("PASS 1 semantic setting persists and updates the native reader");
} finally {
  await browser.close();
}
