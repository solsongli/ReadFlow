import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readerBrowser } from "./browser.mjs";

const corpus = process.env.READFLOW_X11_CORPUS_DIR || process.env.READFLOW_SMOKE_CORPUS_DIR;
if (!corpus) {
  console.log("SKIP paint priority: offline corpus is unavailable");
  process.exit(0);
}
const name = process.argv.includes("--before") ? "paint-before.json" : "paint-after.json";
const output = process.env.READFLOW_X17_OUTPUT_DIR || resolve(corpus, "../out/x17");
const root = resolve(corpus, "OpenVLA");
const aligned = resolve(corpus, "../out/x14b/OpenVLA/translated-aligned.pdf");
await Promise.all([access(`${root}/source.pdf`), access(`${root}/blocks.json`), access(aligned)]);
await mkdir(output, { recursive: true });
const blocks = JSON.parse(await readFile(`${root}/blocks.json`, "utf8"));
const results = [];
for (let run = 0; run < 3; run++) {
  const env = await readerBrowser(
    "?blocks&configured&x6&x7",
    "tests/paper-reader/integration-fixture.tsx",
    { pdf: `${root}/source.pdf`, alignedPdf: aligned, blocks, dpr: 1 },
  );
  try {
    const { page } = env;
    page.setDefaultTimeout(90000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const started = Date.now();
    await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
    await page.getByRole("button", { name: "对照", exact: true }).click();
    const input = page.getByRole("spinbutton", { name: "页码", exact: true });
    await input.fill("20");
    await input.press("Enter");
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[aria-label="原文页面"] [data-paper-page="20"] > canvas');
      return canvas?.width > 300 && canvas.style.visibility === "visible";
    });
    results.push(Date.now() - started);
    assert.deepEqual(env.errors, []);
    assert.deepEqual(env.unexpected, []);
  } finally {
    await env.browser.close();
  }
}
await writeFile(`${output}/${name}`, JSON.stringify({ milliseconds: results }, null, 2));
console.log(name, results);
