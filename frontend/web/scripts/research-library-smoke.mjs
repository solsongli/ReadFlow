import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(web, "../..");
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "retainpdf-research-smoke-"));
let dataRoot = path.join(tmp, "library");
const originalDataRoot = dataRoot;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const listener = net.createServer();
await new Promise((resolve, reject) => listener.listen(0, "127.0.0.1", resolve).once("error", reject));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const base = "http://127.0.0.1:" + port;
let server;
let browser;
let output = "";
let assertions = 0;
const report = [];
function pass(label) { assertions++; report.push(label); console.log("PASS " + label); }
async function request(route, options) {
  const response = await fetch(base + "/api/research" + route, options);
  assert.ok(response.ok, route + ": " + response.status + " " + await response.clone().text());
  return response.json();
}
async function launch(demo) {
  server = spawn("python3", [path.join(repo, "ops/development/research_library.py"),
    "--no-build", "--data-root", dataRoot, "--port", String(port), ...(demo ? ["--demo"] : [])],
    { cwd: repo, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  server.stdout.on("data", (chunk) => { output = (output + chunk).slice(-20000); });
  server.stderr.on("data", (chunk) => { output = (output + chunk).slice(-20000); });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("Synthetic server exited: " + output);
    try {
      const response = await fetch(base + "/healthz");
      if (response.ok && (await response.json()).data_mode === "isolated") return;
    } catch {}
    await delay(200);
  }
  throw new Error("Synthetic server did not become ready: " + output);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const child = server;
  const done = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([done, delay(5000)]);
  if (child.exitCode === null) { child.kill("SIGKILL"); await done; }
  server = undefined;
}
try {
  await launch(true);
  const initial = await request("/items");
  assert.equal(initial.items.length, 1);
  const original = initial.items[0];
  assert.equal(original.attachments.length, 1);
  const sourcePdf = await (await fetch(base + "/api/research/attachments/" + original.attachments[0].id + "/pdf")).arrayBuffer();
  const fixturePdf = path.join(tmp, "synthetic-upload.pdf");
  await fs.writeFile(fixturePdf, Buffer.from(sourcePdf));
  const chrome = process.env.RESEARCH_CHROME_EXECUTABLE || "/usr/bin/google-chrome";
  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ viewport: { width: 1700, height: 1080 }, acceptDownloads: true });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(base + "/") || /^(data:|blob:)/.test(url)) await route.continue();
    else await route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByTestId("pdf-viewer").locator("canvas").waitFor({ state: "visible" });
  assert.ok((await page.locator(".react-pdf__Page__textContent").innerText()).includes("synthetic"));
  pass("source PDF canvas and text layer render in actual Chromium");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="PDF 页码"]')?.value === "2");
  assert.equal(await page.getByLabel("PDF 页码", { exact: true }).inputValue(), "2");
  await page.locator(".react-pdf__Page__textContent").getByText(/numerical values/).first().waitFor();
  await page.evaluate(() => {
    const span = Array.from(document.querySelectorAll(".react-pdf__Page__textContent span"))
      .find((node) => node.textContent.includes("numerical values"));
    if (!span) throw new Error("Missing synthetic text span");
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    span.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  assert.ok((await page.getByLabel("原文摘录", { exact: true }).inputValue()).includes("numerical values"));
  await page.getByLabel("译文 / 双语对照", { exact: true }).fill("这是合成数值，仅用于验证引用。");
  await page.getByLabel("我的笔记", { exact: true }).fill("Browser smoke note: persistent bilingual evidence.");
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await page.getByTestId("notes-list").getByText("Browser smoke note: persistent bilingual evidence.", { exact: true }).waitFor();
  let detail = await request("/items/" + original.id);
  const note = detail.notes.find((entry) => entry.body.startsWith("Browser smoke"));
  assert.equal(note.page_idx, 1);
  assert.equal(note.attachment_id, original.attachments[0].id);
  assert.equal(note.translated_quote, "这是合成数值，仅用于验证引用。");
  pass("real text selection saves source/translation/comment against physical page 2");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("notes-list").getByText("Browser smoke note: persistent bilingual evidence.", { exact: true }).waitFor();
  pass("notes survive browser reload");
  await page.getByRole("button", { name: "新建合集", exact: true }).click();
  await page.getByLabel("合集名称", { exact: true }).fill("浏览器验收");
  await page.getByRole("button", { name: "创建合集", exact: true }).click();
  await page.getByRole("button", { name: "文献信息", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("Smoke Tested Paper");
  await page.getByLabel(/^作者/).fill("Fictional Researcher\nSynthetic Reviewer");
  await page.getByLabel(/^标签/).fill("synthetic, smoke");
  await page.getByRole("checkbox", { name: "浏览器验收", exact: true }).check();
  await page.getByRole("button", { name: "保存文献信息", exact: true }).click();
  await page.getByRole("heading", { name: "Smoke Tested Paper", exact: true }).waitFor();
  detail = await request("/items/" + original.id);
  assert.equal(detail.title, "Smoke Tested Paper");
  assert.deepEqual(detail.authors, ["Fictional Researcher", "Synthetic Reviewer"]);
  assert.ok(detail.tags.includes("smoke"));
  const newCollection = (await request("/items")).collections.find((entry) => entry.name === "浏览器验收");
  assert.ok(detail.collection_ids.includes(newCollection.id));
  pass("metadata, authors, tags and collection membership save through UI");
  await page.getByLabel("搜索文献", { exact: true }).fill("Smoke Tested");
  await page.waitForFunction(() => document.querySelectorAll(".paper-card").length === 1);
  assert.ok((await page.getByTestId("paper-list").innerText()).includes("Smoke Tested Paper"));
  await page.getByLabel("清除搜索", { exact: true }).click();
  pass("library search filters the saved metadata");
  const cslFixture = path.join(repo, "docs/ops/planning/research-library-mvp/examples/zotero-csl-synthetic.json");
  async function importCsl() {
    await page.getByRole("button", { name: "Zotero / JSON 导入", exact: true }).click();
    await page.getByLabel("固定来源名称", { exact: true }).fill("synthetic-smoke-csl");
    await page.getByTestId("json-input").setInputFiles(cslFixture);
    await page.getByRole("button", { name: "预览文件导入", exact: true }).click();
    await page.getByTestId("import-preview").waitFor();
    assert.ok((await page.getByTestId("import-preview").innerText()).includes("Synthetic Evidence Reading"));
    await page.getByRole("button", { name: "确认导入此预览", exact: true }).click();
    await page.getByTestId("import-result").waitFor();
    const text = await page.getByTestId("import-result").innerText();
    await page.getByRole("button", { name: "返回文献库", exact: true }).click();
    return text;
  }
  assert.ok((await importCsl()).includes("新增 2 篇"));
  assert.equal((await request("/items")).items.length, 3);
  pass("Zotero CSL JSON previews migration gaps and imports two Unicode bibliography items");
  assert.ok((await importCsl()).includes("保持不变 2 篇"));
  assert.equal((await request("/items")).items.length, 3);
  pass("repeating the same source import is idempotent");
  await page.locator(".paper-card").filter({ hasText: "Synthetic Evidence Reading" }).click();
  await page.getByRole("heading", { name: "Synthetic Evidence Reading", exact: true }).waitFor();
  await page.getByTestId("pdf-attachment-input").setInputFiles(fixturePdf);
  await page.getByTestId("pdf-viewer").locator("canvas").waitFor({ state: "visible" });
  const imported = (await request("/items")).items.find((entry) => entry.title === "Synthetic Evidence Reading");
  assert.equal(imported.attachments[0].sha256, original.attachments[0].sha256);
  assert.notEqual(imported.id, original.id);
  assert.notEqual(imported.attachments[0].id, original.attachments[0].id);
  pass("first PDF association renders immediately and shared content retains separate paper identity");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="PDF 页码"]')?.value === "2");
  await page.getByRole("button", { name: "原文证据", exact: true }).click();
  await page.getByLabel("原文证据关键词", { exact: true }).fill("accuracy");
  await page.getByRole("button", { name: "检索原文证据", exact: true }).click();
  await page.getByTestId("evidence-results").getByText(/92 percent/).first().waitFor();
  await page.getByTestId("evidence-results").getByRole("button", { name: "第 1 页 ↗", exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="PDF 页码"]')?.value === "1");
  assert.equal(await page.getByLabel("PDF 页码", { exact: true }).inputValue(), "1");
  await page.getByTestId("pdf-viewer").locator("canvas").waitFor({ state: "visible" });
  pass("source evidence finds actual text and its citation returns to PDF page 1");
  await page.locator(".export-menu summary").click();
  const sourceDownloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "原始迁移数据 JSON", exact: true }).click();
  const sourceDownload = await sourceDownloadPromise;
  const sourcePath = path.join(tmp, "migration-source.json");
  await sourceDownload.saveAs(sourcePath);
  const sourceJson = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  assert.ok(JSON.stringify(sourceJson).includes("Synthetic Methods Journal"));
  pass("original migration JSON is downloadable and preserves unprojected source fields");
  await page.locator(".export-menu summary").click();
  await page.locator(".paper-card").filter({ hasText: "Smoke Tested Paper" }).click();
  await page.getByRole("heading", { name: "Smoke Tested Paper", exact: true }).waitFor();
  await page.locator(".export-menu summary").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "阅读笔记 Markdown", exact: true }).click();
  const download = await downloadPromise;
  const downloaded = path.join(tmp, "notes.md");
  await download.saveAs(downloaded);
  const markdown = await fs.readFile(downloaded, "utf8");
  assert.ok(markdown.includes("Browser smoke note"));
  assert.ok(markdown.includes("这是合成数值"));
  assert.ok(markdown.includes(original.attachments[0].sha256));
  pass("Markdown file download preserves bilingual notes, page information and PDF identity");
  await page.locator(".export-menu summary").click();
  await page.screenshot({ path: path.join(tmp, "library-desktop.png"), fullPage: true });
  await stop();
  await launch(false);
  await page.reload({ waitUntil: "networkidle" });
  detail = await request("/items/" + original.id);
  assert.equal(detail.title, "Smoke Tested Paper");
  assert.ok(detail.notes.some((entry) => entry.id === note.id));
  assert.equal((await request("/items")).items.length, 3);
  pass("metadata, migration identity and notes survive full service restart");
  await stop();
  const restoredRoot = path.join(tmp, "restored-library");
  await fs.cp(dataRoot, restoredRoot, { recursive: true });
  dataRoot = restoredRoot;
  await launch(false);
  detail = await request("/items/" + original.id);
  assert.ok(detail.notes.some((entry) => entry.id === note.id));
  assert.equal((await request("/items")).items.length, 3);
  const restoredBytes = Buffer.from(await (await fetch(base + "/api/research/attachments/" + original.attachments[0].id + "/pdf")).arrayBuffer());
  assert.deepEqual(restoredBytes, Buffer.from(sourcePdf));
  pass("stopped-service directory backup restores into a different root with identical PDF and notes");
  assert.deepEqual(errors, []);
  pass("no unhandled browser JavaScript errors");
  console.log(JSON.stringify({ result: "pass", assertions, browser: browser.version(),
    syntheticRoot: tmp, screenshot: path.join(tmp, "library-desktop.png"), checks: report }, null, 2));
} catch (error) {
  console.error(error.stack || error);
  console.error("Server diagnostic (synthetic data only): " + output.slice(-5000));
  throw error;
} finally {
  if (browser) await browser.close();
  await stop();
  await fs.rm(dataRoot, { recursive: true, force: true });
  if (dataRoot !== originalDataRoot) await fs.rm(originalDataRoot, { recursive: true, force: true });
}
