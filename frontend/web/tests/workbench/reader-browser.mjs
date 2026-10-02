import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";

export async function readerBrowser() {
  const root = process.cwd();
  const output = "/tmp/readflow-t3/screenshots";
  await mkdir(output, { recursive: true });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 8; n++) { const page = pdf.addPage([420, 540]); page.drawText(`ReadFlow synthetic page ${n}`, { x: 40, y: 480, size: 18, font }); }
  const bytes = Buffer.from(await pdf.save());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const built = await build({ entryPoints: ["tests/workbench/reader-browser-fixture.tsx"], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": resolve(root, "src") }, logLevel: "silent" });
  const browser = await chromium.launch({ executablePath: process.env.READFLOW_CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: "light" });
  await context.addInitScript(() => {
    window.__FRONT_RUNTIME_CONFIG__ = { apiBase: "http://reader.test" };
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    const reads = [], writes = [];
    Storage.prototype.getItem = function (key) { if (key === "retainpdf.theme") reads.push(key); return originalGet.call(this, key); };
    Storage.prototype.setItem = function (key, value) { if (key === "retainpdf.theme") writes.push(value); return originalSet.call(this, key, value); };
    Object.assign(window, { themeReads: reads, themeWrites: writes, documentToken: Math.random() });
    if (window === window.top && location.pathname === "/workbench.html") originalSet.call(localStorage, "retainpdf.theme", "mojia");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [], unhandled = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const serve = (route, type, body) => route.fulfill({ contentType: type, body });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (url.origin !== "http://reader.test") { unhandled.push(url.href); return route.abort(); }
    if (path === "/workbench.html") return serve(route, "text/html; charset=utf-8", '<!doctype html><html lang="zh-CN"><link rel="stylesheet" href="/dist/css/workbench.css"><body><div id="workbench-root"></div><script type="module" src="/fixture.js"></script></body></html>');
    if (path === "/fixture.js") return serve(route, "text/javascript", built.outputFiles[0].text);
    if (path === "/reader.html") return serve(route, "text/html; charset=utf-8", '<!doctype html><html lang="zh-CN"><link rel="stylesheet" href="/dist/css/reader.css"><body><div id="reader-root"></div><script type="module" src="/dist/reader.bundle.js"></script></body></html>');
    if (/^\/dist\/(?:css\/(?:workbench|reader)\.css|reader\.bundle\.js|chunks\/reader\/[\w.-]+\.js)$/.test(path)) return serve(route, path.endsWith(".css") ? "text/css" : "text/javascript", await readFile(resolve(root, path.slice(1))));
    if (/^\/src\/assets\/fonts\/inter\/InterVariable(?:-Italic)?\.woff2$/.test(path)) return serve(route, "font/woff2", await readFile(resolve(root, path.slice(1))));
    if (/^\/vendor\/pdfjs-dist\/(?:build|cmaps|standard_fonts)\/[\w.-]+$/.test(path)) return serve(route, path.endsWith(".mjs") ? "text/javascript" : "application/octet-stream", await readFile(resolve(root, path.slice(1))));
    if (path === `/api/v1/documents/${hash}`) return route.fulfill({ json: { document_id: hash, active_job_id: null, active_version_id: null, source_file_name: "Synthetic reader.pdf" } });
    if (path === `/api/v1/documents/${hash}/source.pdf`) return serve(route, "application/pdf", bytes);
    if (/^\/api\/research\/items\/[0-9a-f-]+$/.test(path)) {
      const id = path.split("/").at(-1);
      return route.fulfill({ json: await page.evaluate((id) => window.fixture.item(id), id) });
    }
    if (/^\/api\/research\/items\/[0-9a-f-]+\/notes$/.test(path) && route.request().method() === "POST") {
      const id = path.split("/").at(-2), body = route.request().postDataJSON();
      const note = await page.evaluate(({ id, body }) => {
        const note = { ...body, id: body.reader_annotation.id, item_id: id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        window.fixture.notes.push(note);
        const row = window.fixture.rows.find((row) => row.id === id); row.notes_count++; row.annotations_count++;
        return note;
      }, { id, body });
      return route.fulfill({ json: note });
    }
    if (/^\/api\/research\/notes\/[\w-]+$/.test(path)) {
      const id = path.split("/").at(-1), method = route.request().method();
      const body = method === "PATCH" ? route.request().postDataJSON() : null;
      const note = await page.evaluate(({ id, method, body }) => {
        const index = window.fixture.notes.findIndex((note) => note.id === id);
        const original = window.fixture.notes[index];
        if (method === "DELETE") { window.fixture.notes.splice(index, 1); const row = window.fixture.rows.find((row) => row.id === original.item_id); row.notes_count--; row.annotations_count--; return null; }
        Object.assign(original, body); return original;
      }, { id, method, body });
      return note ? route.fulfill({ json: note }) : route.fulfill({ status: 204 });
    }
    unhandled.push(`${route.request().method()} ${path}`);
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto(`http://reader.test/workbench.html?hash=${hash}`);
  await page.locator('[data-wb-list] [role="option"]').first().waitFor();
  return { browser, context, page, errors, unhandled, output, hash };
}
