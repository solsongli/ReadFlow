import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readerBrowser } from "./browser.mjs";

const corpus = process.env.READFLOW_X11_CORPUS_DIR;
const output = resolve(process.env.READFLOW_X11B_OUTPUT_DIR || "/tmp/readflow-x11b");
const phase = process.env.READFLOW_X11B_PHASE || "after";
await mkdir(output, { recursive: true });
if (!corpus) {
  console.log("SKIP margin alignment corpus: READFLOW_X11_CORPUS_DIR is not set");
  process.exit(0);
}

function translatedDocument(blocks, translations, selection) {
  for (const block of blocks.blocks) {
    const payload = JSON.stringify([block.id, selection.language, selection.fingerprint]);
    const value = translations[createHash("sha256").update(payload).digest("hex")];
    if (!value) continue;
    block.translation = typeof value === "string" ? value : value.text;
    block.translation_runs = typeof value === "object" ? value.runs : undefined;
  }
  return blocks;
}

const metrics = [];
for (const [name, pages] of [
  ["OpenVLA", [1, 3]],
  ["SAM", [4]],
]) {
  const folder = resolve(corpus, name);
  try {
    await Promise.all(
      ["source.pdf", "blocks.json", "translations.json", "selection.json"].map((file) =>
        access(resolve(folder, file)),
      ),
    );
  } catch {
    console.log(`SKIP ${name}: offline corpus files are unavailable`);
    continue;
  }
  const document = translatedDocument(
    JSON.parse(await readFile(resolve(folder, "blocks.json"), "utf8")),
    JSON.parse(await readFile(resolve(folder, "translations.json"), "utf8")),
    JSON.parse(await readFile(resolve(folder, "selection.json"), "utf8")),
  );
  const env = await readerBrowser(
    `?blocks&configured&x6&corpus=${name === "SAM" ? "2304.02643" : "2406.09246"}`,
    "tests/paper-reader/integration-fixture.tsx",
    { dpr: 1, pdf: resolve(folder, "source.pdf"), blocks: document },
  );
  try {
    const { page } = env;
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.evaluate(
      async ({ name, count }) => {
        window.fixture.rows[0].title = name;
        window.fixture.rows[0].page_count = count;
        await window.fixture.wb.refreshAll();
      },
      { name, count: document.pages.length },
    );
    await page.getByRole("option", { name, exact: true }).dblclick();
    await page.waitForFunction(() => document.querySelector('[data-paper-page="1"] > canvas')?.width > 0);
    if (await page.getByRole("button", { name: "知道了", exact: true }).count()) {
      await page.getByRole("button", { name: "知道了", exact: true }).click();
    }
    await page.evaluate(() => window.fixture.wb.setPrefs({ marginNotes: false, marginTranslations: true }));
    await page.getByRole("button", { name: "切换目录侧栏", exact: true }).click();
    await page.getByRole("button", { name: "切换信息面板", exact: true }).click();
    for (const number of pages) {
      const input = page.getByRole("spinbutton", { name: "页码" });
      await input.fill(String(number));
      await input.press("Enter");
      const paper = page.locator(`[data-paper-page="${number}"]`);
      await page.waitForFunction((pageNumber) => {
        const canvas = document.querySelector(`[data-paper-page="${pageNumber}"] > canvas`);
        return canvas?.style.visibility === "visible" && canvas.width > 0;
      }, number);
      await paper.locator('[data-margin-kind="translation"]').first().waitFor();
      await page.waitForTimeout(250);
      const measurement = await paper.evaluate((root) => {
        const pageBox = root.getBoundingClientRect();
        const rows = [...root.querySelectorAll("[data-margin-kind=translation]")].flatMap((card) => {
          const line = card.querySelector(".pr-margin-leader line");
          if (!line) return [];
          const box = card.getBoundingClientRect();
          const anchor = pageBox.top + Number(line.getAttribute("y2"));
          return [
            {
              id: card.getAttribute("data-margin-entry"),
              side: card.getAttribute("data-margin-side"),
              anchor: anchor - pageBox.top,
              top: box.top - pageBox.top,
              deviation: Math.abs(box.top - anchor),
            },
          ];
        });
        const deviations = rows.map((row) => row.deviation).sort((a, b) => a - b);
        return {
          cards: rows.length,
          left: rows.filter((row) => row.side === "left").length,
          right: rows.filter((row) => row.side === "right").length,
          median: deviations.length ? deviations[Math.floor(deviations.length / 2)] : 0,
          maximum: deviations.at(-1) || 0,
          rows,
        };
      });
      metrics.push({ phase, paper: name, page: number, ...measurement });
      await page.screenshot({ path: resolve(output, `${phase}-${name}-p${number}.png`) });
      if (phase === "after" && name === "OpenVLA" && number === 3) {
        const block = document.blocks.find((row) => row.text?.startsWith("Generalist Robot Policies"));
        assert.ok(block);
        await page.evaluate(() => window.fixture.wb.setPrefs({ marginTranslations: false }));
        const point = await paper.evaluate(
          (element, box) => {
            const bounds = element.getBoundingClientRect();
            return {
              x: bounds.left + ((box[0] + box[2]) / 2) * bounds.width,
              y: bounds.top + ((box[1] + box[3]) / 2) * bounds.height,
            };
          },
          block.anchors.find((anchor) => anchor.page === 3).view_bbox,
        );
        await page.mouse.click(point.x, point.y);
        const card = page.getByRole("dialog", { name: "块译文", exact: true });
        await card.waitFor();
        const body = card.locator("[data-margin-body]");
        const layout = await card.evaluate((element) => {
          const body = element.querySelector("[data-margin-body]");
          const box = element.getBoundingClientRect();
          return {
            bottom: box.bottom,
            overflow: body.scrollHeight > body.clientHeight + 2,
            text: body.textContent,
            marked: element.dataset.overflow === "true",
          };
        });
        assert.equal(layout.text.replace(/\s+/gu, ""), block.translation.replace(/\s+/gu, ""));
        assert.ok(layout.bottom <= 1050 - 10);
        assert.equal(layout.marked, layout.overflow);
        await card.getByText("通用机器人策略", { exact: true }).waitFor();
        assert.equal(await card.locator("strong").filter({ hasText: "通用机器人策略" }).count(), 1);
        await page.screenshot({ path: resolve(output, "after-OpenVLA-p3-single.png") });
        await page.keyboard.press("Escape");
        await page.evaluate(() => window.fixture.wb.setPrefs({ marginTranslations: true }));
      }
    }
    assert.deepEqual(env.errors, []);
    assert.deepEqual(env.unexpected, []);
  } finally {
    await env.browser.close();
  }
}
await writeFile(resolve(output, `${phase}-alignment.json`), JSON.stringify(metrics, null, 2));
console.log(
  metrics.map(({ paper, page, cards, left, right, median, maximum }) => ({
    paper,
    page,
    cards,
    left,
    right,
    median: median.toFixed(1),
    maximum: maximum.toFixed(1),
  })),
);
