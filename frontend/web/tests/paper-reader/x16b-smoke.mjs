import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readerBrowser } from "./browser.mjs";

const corpus = process.env.READFLOW_X11_CORPUS_DIR || process.env.READFLOW_SMOKE_CORPUS_DIR;
if (!corpus) {
  console.log("SKIP X16b smoke: offline corpus is unavailable");
  process.exit(0);
}
const output = process.env.READFLOW_X16B_OUTPUT_DIR || resolve(corpus, "../out/x16b");
const root = resolve(corpus, "OpenVLA");
const aligned = resolve(corpus, "../out/x14b/OpenVLA/translated-aligned.pdf");
await Promise.all([access(`${root}/source.pdf`), access(`${root}/blocks.json`), access(aligned)]);
await mkdir(output, { recursive: true });
const blocks = JSON.parse(await readFile(`${root}/blocks.json`, "utf8"));
const env = await readerBrowser(
  "?blocks&configured&x6&x7",
  "tests/paper-reader/integration-fixture.tsx",
  { pdf: `${root}/source.pdf`, alignedPdf: aligned, blocks, dpr: 1 },
);
const { page } = env;
page.setDefaultTimeout(90000);
await page.setViewportSize({ width: 1680, height: 1050 });
try {
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await page.getByRole("button", { name: "对照", exact: true }).click();
  await page.locator("[data-pdf-pane]").first().focus();
  await page.keyboard.press("Control+f");
  await page.getByRole("button", { name: "译文（右侧）", exact: true }).click();
  const input = page.getByRole("textbox", { name: "搜索论文", exact: true });
  await input.fill("策略");
  const count = page.locator('[aria-live="polite"]').filter({ hasText: /处/ });
  try {
    await page.getByText(/1 \/ [1-9]\d* 处/).waitFor({ timeout: 30000 });
  } catch (error) {
    console.error(
      "search-state",
      await page.evaluate(() => ({
        mode: document.querySelector("[data-paper-reader]")?.dataset.readingMode,
        navigation: document.querySelector('[aria-label="阅读导航"]')?.textContent,
        statuses: [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent),
      })),
      env.errors,
      env.unexpected,
    );
    throw error;
  }
  await page.waitForFunction(
    () => !document.querySelector('[aria-live="polite"]')?.textContent?.includes("索引中"),
  );
  const total = Number((await count.textContent()).match(/\/\s*(\d+)/)?.[1]);
  assert.ok(total > 1);
  await page.locator('[aria-label="译文页面"] [data-search-current="true"]').first().waitFor();
  assert.equal(await page.locator('[aria-label="原文页面"] .pr-search-hit').count(), 0);
  const geometry = await page.evaluate(() => {
    const pane = document.querySelector('[aria-label="译文页面"]');
    const active = pane.querySelector('[data-search-current="true"]');
    const paper = active.closest("[data-paper-page]");
    const spans = [...paper.querySelectorAll(".pr-text-layer span")];
    const texts = spans.map((span) => span.textContent || "");
    const boxes = spans.map((span) => span.getBoundingClientRect());
    const separators = spans.map((span, index) => {
      const next = spans[index + 1];
      if (!next) return "";
      const left = boxes[index], right = boxes[index + 1];
      const sameLine = Math.abs(left.top - right.top) < Math.min(left.height, right.height) * 0.5;
      const gap = right.left - left.right;
      return sameLine && gap <= Math.max(0.5, Math.max(left.height, right.height) * 0.12) ? "" : " ";
    });
    const joined = texts.map((text, index) => text + separators[index]).join("");
    const from = joined.indexOf("策略"), to = from + 2;
    if (from < 0) throw new Error("当前页文本层未找到策略");
    let offset = 0, touched = 0;
    const expected = [];
    for (const [index, text] of texts.entries()) {
      const start = Math.max(from, offset), end = Math.min(to, offset + text.length);
      if (end > start) {
        touched += boxes[index].width;
        const range = document.createRange();
        range.setStart(spans[index].firstChild, start - offset);
        range.setEnd(spans[index].firstChild, end - offset);
        expected.push(...range.getClientRects());
      }
      offset += text.length + separators[index].length;
    }
    const actual = [...paper.querySelectorAll('[data-search-current="true"]')].map((node) =>
      node.getBoundingClientRect(),
    );
    const line = boxes.filter(
      (rect) => expected[0] && Math.abs(rect.top - expected[0].top) < Math.min(rect.height, expected[0].height) * 0.5,
    );
    return {
      expected: expected.reduce((sum, rect) => sum + rect.width, 0),
      actual: actual.reduce((sum, rect) => sum + rect.width, 0),
      span: touched,
      line: Math.max(...line.map((rect) => rect.right)) - Math.min(...line.map((rect) => rect.left)),
    };
  });
  assert.ok(Math.abs(geometry.expected - geometry.actual) <= 2, JSON.stringify(geometry));
  assert.ok(geometry.actual < geometry.line * 0.5, JSON.stringify(geometry));
  await writeFile(
    `${output}/highlight-measurement.json`,
    JSON.stringify({ ...geometry, error: Math.abs(geometry.expected - geometry.actual) }, null, 2),
  );
  const active = page.locator('[data-search-result="0"]');
  await page.waitForFunction(() => {
    const item = document.querySelector('[data-search-result="0"]')?.getBoundingClientRect();
    const scroll = document.querySelector('[aria-label="阅读导航"] .wb-scroll')?.getBoundingClientRect();
    return item && scroll && item.top >= scroll.top && item.bottom <= scroll.bottom + 1;
  });
  const currentColor = await page
    .locator('[data-search-current="true"]')
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  const otherColor = await page
    .locator('[data-search-current="false"]')
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  assert.notEqual(currentColor, otherColor);
  await page.screenshot({ path: `${output}/OpenVLA-search-light.png`, animations: "disabled" });
  await input.press("Enter");
  await page.getByText(new RegExp(`2 / ${total} 处`)).waitFor();
  await input.press("Shift+Enter");
  await page.getByText(new RegExp(`1 / ${total} 处`)).waitFor();
  await input.fill("不可能存在的搜索词");
  await page.getByText("无结果", { exact: true }).waitFor();
  await input.fill("策略");
  await page.getByText(new RegExp(`1 / ${total} 处`)).waitFor();
  await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
  await page.screenshot({ path: `${output}/OpenVLA-search-dark.png`, animations: "disabled" });
  const selected = await page.locator('[aria-label="译文页面"] .pr-text-layer span:visible').first().evaluate((span) => {
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  assert.ok(selected.trim());
  assert.deepEqual(env.errors, []);
  assert.deepEqual(env.unexpected, []);
  console.log("PASS X16b exact ranges, active result, loops, translated scope and selection");
} finally {
  await env.browser.close();
}
