import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { readerBrowser } from "./browser.mjs";
import { setPaperTone } from "./controls.mjs";
import { resolve } from "node:path";
const output = resolve(process.env.READFLOW_X11_OUTPUT_DIR || "/tmp/readflow-x11");
await mkdir(output, { recursive: true });
const env = await readerBrowser("?blocks&configured&x6", "tests/paper-reader/integration-fixture.tsx", {
  dpr: 1,
});
const { page } = env,
  checks = [];
const button = (n) => page.getByRole("button", { name: n, exact: true });
const check = async (name, run) => {
  await run();
  checks.push(name);
  console.log("PASS", name);
};
const jump = async (n) => {
  const input = page.getByRole("spinbutton", { name: "页码" });
  await input.fill(String(n));
  await input.press("Enter");
  await page.locator(`[data-paper-page="${n}"] .pr-text-layer span`).first().waitFor();
};
try {
  await page.setViewportSize({ width: 1920, height: 1050 });
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await jump(1);
  if (await button("知道了").count()) await button("知道了").click();
  await check("oversampling and old bitmap retained through zoom", async () => {
    const canvas = page.locator('[data-paper-page="1"] > canvas').first();
    await page.waitForFunction(
      () => document.querySelector('[data-paper-page="1"] > canvas')?.style.visibility === "visible",
    );
    const native = await canvas.evaluate((c) => c.closest("[data-paper-page]").clientWidth);
    for (const zoom of [1, 1.5, 2]) {
      await page.getByLabel("PDF 缩放", { exact: true }).selectOption(String(zoom));
      assert.ok(await canvas.evaluate((c) => c.width > 0 && c.style.visibility === "visible"));
      await page.waitForFunction(() => {
        const c = document.querySelector('[data-paper-page="1"]>canvas');
        return Math.abs(c.width / c.clientWidth - 1.75) < 0.02;
      });
      const size = await canvas.evaluate((c) => ({
        width: c.width,
        height: c.height,
        cssWidth: c.clientWidth,
      }));
      assert.ok(size.width >= size.cssWidth && size.width * size.height <= 16000000);
    }
    await page.getByLabel("PDF 缩放", { exact: true }).selectOption("width");
  });
  await check("cross-line original selection creates shared margin annotation", async () => {
    await page.locator('[data-paper-page="1"] .pr-text-layer span').first().waitFor();
    const boxes = await page.locator('[data-paper-page="1"] .pr-text-layer span').evaluateAll((nodes) =>
      nodes
        .filter(
          (n) => n.textContent.includes("Block translation") || n.textContent.includes("reading order."),
        )
        .map((n) => {
          const b = n.getBoundingClientRect();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        }),
    );
    assert.ok(boxes.length >= 2);
    await page.mouse.move(boxes[0].x + 2, boxes[0].y + boxes[0].h / 2);
    await page.mouse.down();
    await page.mouse.move(boxes[1].x + boxes[1].w - 2, boxes[1].y + boxes[1].h / 2, { steps: 30 });
    assert.equal(await page.locator("[data-paper-reader]").getAttribute("data-selecting"), "true");
    assert.equal(await page.getByRole("toolbar", { name: "选中文字工具条" }).count(), 0);
    await page.mouse.up();
    await page.getByRole("toolbar", { name: "选中文字工具条" }).waitFor();
    const text = await page.evaluate(() => getSelection().toString());
    assert.ok(text.length > 20 && !text.includes("译"));
    await page
      .getByRole("toolbar", { name: "选中文字工具条" })
      .getByRole("button", { name: "重要", exact: true })
      .click();
    await page.locator("[data-margin-note]").first().waitFor();
    assert.equal(await page.getByRole("toolbar", { name: "选中文字工具条" }).count(), 0);
    assert.equal(await page.evaluate(() => getSelection().isCollapsed), true);
    const marginInput = page.locator("[data-margin-note]").first().getByRole("textbox");
    await marginInput.waitFor();
    assert.equal(await marginInput.evaluate((element) => element === document.activeElement), true);
    assert.equal(await page.getByRole("region", { name: "编辑批注" }).count(), 0);
    await page.screenshot({ path: output + "/annotation-margin.png" });
  });
  await check("margin note editing and original hover correspondence", async () => {
    const note = page.locator("[data-margin-note]").first();
    await note.getByRole("textbox", { name: "页边批注说明" }).fill("旁注编辑测试");
    await note.getByRole("textbox").press("Control+Enter");
    await page.waitForTimeout(150);
    assert.equal(env.annotations().at(-1).note, "旁注编辑测试");
    const r = env.annotations().at(-1).rects[0];
    const point = await page.locator('[data-paper-page="1"]').evaluate((e, r) => {
      const b = e.getBoundingClientRect();
      return { x: b.x + (r.x + r.width / 2) * b.width, y: b.y + (r.y + r.height / 2) * b.height };
    }, r);
    await page.mouse.move(point.x, point.y);
    await page.waitForFunction(
      () => document.querySelector('[data-margin-kind="annotation"]').dataset.active === "true",
    );
    await note.getByRole("button", { name: "定位这条批注" }).click();
  });
  await jump(1);
  await check("cross-column drag keeps the original text layer and does not open a block card", async () => {
    const points = await page.locator('[data-paper-page="1"] .pr-text-layer span').evaluateAll((nodes) => {
      const a = nodes.find((n) => n.textContent.includes("Block translation"));
      const b = nodes.find((n) => n.textContent.includes("The numbered equation"));
      return [a, b].map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x + 2, y: r.y + r.height / 2, end: r.right - 2 };
      });
    });
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    await page.mouse.move(points[1].end, points[1].y, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const text = await page.evaluate(() => getSelection().toString());
    assert.ok(text.includes("Block translation") && text.includes("numbered equation"));
    assert.ok(!text.includes("Vector method diagram") && !text.includes("译"));
    assert.equal(await page.getByRole("dialog", { name: "块译文", exact: true }).count(), 0);
    await page.evaluate(() => getSelection().removeAllRanges());
  });
  await check("native double-word and triple-line selection stay bounded", async () => {
    const span = page
      .locator('[data-paper-page="1"] .pr-text-layer span')
      .filter({ hasText: "Block translation" })
      .first();
    const point = await span.evaluate((n) => {
      const r = document.createRange();
      const at = n.textContent.indexOf("translation");
      r.setStart(n.firstChild, at);
      r.setEnd(n.firstChild, at + 11);
      const b = r.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.waitForTimeout(150);
    await page.mouse.dblclick(point.x, point.y);
    const word = await page.evaluate(() => getSelection().toString().trim());
    assert.ok(word.length && word.split(/\s+/).length <= 2);
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.mouse.click(point.x, point.y, { clickCount: 3 });
    const line = await page.evaluate(() => getSelection().toString());
    assert.ok(line.includes("Block translation") && line.length < 1000);
    await page.evaluate(() => getSelection().removeAllRanges());
  });
  await check("block translation beside original and keyboard navigation", async () => {
    const manifest = JSON.parse(await readFile("tests/fixtures/blocks/manifest.json", "utf8"));
    const block = manifest.blocks.find((b, i) => b.page === 1 && b.type === "text" && i % 3 !== 2);
    // Use another paragraph rather than the already highlighted first paragraph.
    const chosen = manifest.blocks.filter((b) => b.page === 1 && b.type === "text")[1];
    const point = await page.locator('[data-paper-page="1"]').evaluate((e, a) => {
      const b = e.getBoundingClientRect();
      return { x: b.x + ((a[0] + a[2]) / 2) * b.width, y: b.y + ((a[1] + a[3]) / 2) * b.height };
    }, chosen.anchors[0].view_bbox);
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.mouse.click(point.x, point.y);
    const card = page.getByRole("dialog", { name: "块译文", exact: true });
    await card.waitFor();
    assert.ok(
      await card
        .locator("[data-margin-body]")
        .evaluate((element) => element.scrollHeight <= element.clientHeight + 2),
    );
    const a = await card.boundingBox(),
      b = await page.locator('[data-paper-page="1"]').boundingBox();
    assert.ok(a.x >= b.x + b.width || a.x + a.width <= b.x);
    const id = await card.getAttribute("data-block-card");
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
      (old) => document.querySelector("[data-block-card]").dataset.blockCard !== old,
      id,
    );
    await page.keyboard.press("Escape");
    await card.waitFor({ state: "detached" });
  });
  await check("all translations share a non-overlapping rail", async () => {
    await page.evaluate(() => window.fixture.wb.setPrefs({ marginTranslations: true }));
    await page.locator('[data-margin-kind="translation"]').first().waitFor();
    const compact = page.locator('[data-block-card][data-compact="true"]').first();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(180);
    assert.equal(
      await compact.locator(".pr-margin-header").evaluate((node) => getComputedStyle(node).opacity),
      "0",
    );
    await compact.hover();
    await page.waitForFunction(
      (element) => getComputedStyle(element).opacity === "1",
      await compact.locator(".pr-margin-header").elementHandle(),
    );
    const cards = await page.locator('[data-paper-page="1"] [data-margin-entry]').evaluateAll((nodes) =>
      nodes.map((n) => {
        const b = n.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, side: n.dataset.marginSide };
      }),
    );
    for (const side of ["left", "right"]) {
      const group = cards.filter((c) => c.side === side).sort((a, b) => a.top - b.top);
      for (let i = 1; i < group.length; i++) assert.ok(group[i].top >= group[i - 1].bottom - 1);
    }
    assert.ok(cards.length > 1);
    await page.screenshot({ path: output + "/margin-all-light.png" });
    await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
    await setPaperTone(page, "night");
    await page.screenshot({ path: output + "/margin-all-night.png" });
  });
  await check("narrow annotations collapse and translation floats away from source", async () => {
    await page.evaluate(() => window.fixture.wb.setPrefs({ marginTranslations: false }));
    await page.setViewportSize({ width: 850, height: 850 });
    await jump(1);
    await page.locator('[data-margin-kind="annotation"][data-margin-collapsed="true"]').first().waitFor();
    await page
      .locator('[data-paper-page="1"] .pr-text-layer span')
      .filter({ hasText: "Block translation" })
      .first()
      .evaluate((span) => {
        const range = document.createRange();
        range.selectNodeContents(span);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
    await page.getByRole("toolbar", { name: "选中文字工具条" }).waitFor();
    await page
      .getByRole("toolbar", { name: "选中文字工具条" })
      .getByRole("button", { name: "方法", exact: true })
      .click();
    await page.getByRole("region", { name: "编辑批注" }).waitFor();
    await page.getByRole("region", { name: "编辑批注" }).getByRole("button", { name: "收起" }).click();
    await page.getByRole("tab", { name: "译文", exact: true }).click();
    await page.locator("[data-sidebar-block]").last().locator("button").first().click();
    await page.locator("[data-margin-floating]").waitFor();
    await page.screenshot({ path: output + "/margin-narrow.png" });
    await page.keyboard.press("Escape");
  });
  assert.deepEqual(env.errors, []);
  assert.deepEqual(env.unexpected, []);
  await writeFile(output + "/scenarios.json", JSON.stringify({ checks, errors: env.errors }, null, 2));
} catch (error) {
  console.log("DEBUG", env.errors, await page.locator("[role=status]").allTextContents());
  await page.screenshot({ path: output + "/failure.png" });
  throw error;
} finally {
  await env.browser.close();
}
