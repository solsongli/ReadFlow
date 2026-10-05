import { flashcardMock } from "../flashcards/mock.mjs";
import { blocksMock } from "../paper-blocks/mock.mjs";
import { assistanceMock } from "./assistance-mock.mjs";
import { canvasMock } from "../thought-canvas/mock.mjs";
import { annotationsMarkdown } from "../../src/features/paper-reader/domain/annotations/export.js";
import { DEFAULT_SEMANTICS } from "../../src/features/paper-reader/domain/annotations/types.js";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
export async function readerBrowser(query = "", fixture = "tests/paper-reader/fixture.tsx") {
  const output = "/tmp/readflow-r1/screenshots";
  await mkdir(output, { recursive: true });
  const built = await build({
    entryPoints: [fixture],
    bundle: true,
    write: false,
    format: "esm",
    jsx: "automatic",
    alias: { "@": resolve("src") },
    logLevel: "silent",
  });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-background-networking",
      "--disable-gpu",
      "--disable-component-update",
      "--no-first-run",
    ],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 950 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage(),
      errors = [],
      unexpected = [];
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    const annotationCount = Number(new URLSearchParams(query.replace(/^\?/, "")).get("annotations") || 0);
    let annotations = Array.from({ length: annotationCount }, (_, i) => ({
      id: `seed-${i}`,
      item_id: "paper",
      attachment_id: "attachment",
      page_index: Math.floor(i / 5) % 100,
      type: "highlight",
      color: ["yellow", "blue", "green", "red", "purple"][i % 5],
      rects: [{ x: 0.1, y: 0.15 + (i % 5) * 0.05, width: 0.4, height: 0.02 }],
      quote: `Synthetic annotation ${i}`,
      note: "",
      ink: [],
      width: 2,
      image_ref: "",
      created_at: "2026-10-03",
      updated_at: "2026-10-03",
    }));
    const generatedNotes = [];
    const assistance = assistanceMock(query);
    const canvases = canvasMock(() => annotations, query);
    let bookmarks = [],
      seconds = 0;
    const ticks = new Set();
    await context.addInitScript(
      ({ configured }) => {
        window.__FRONT_RUNTIME_CONFIG__ = {
          apiBase: "http://paper.test",
          ...(configured
            ? {
                modelApiKey: "fixture-private-value",
                baseUrl: "http://127.0.0.1:9/v1",
                model: "fixture",
              }
            : {}),
        };
        if (configured) {
          localStorage.setItem(
            "retainpdf.browser.config.v1",
            JSON.stringify({ ocrProvider: "local", modelApiKey: "fixture-private-value" }),
          );
          localStorage.setItem(
            "retainpdf.developer.config.v1",
            JSON.stringify({
              translationProvider: "custom",
              baseUrl: "http://127.0.0.1:9/v1",
              model: "fixture",
              workers: 2,
            }),
          );
        }
        let value = "";
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (text) => {
              value = text;
            },
            readText: async () => value,
          },
        });
      },
      { configured: query.includes("configured") },
    );
    const flashcards = flashcardMock();
    const blocks = await blocksMock(query);
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url()),
        p = url.pathname;
      if (url.origin !== "http://paper.test") {
        unexpected.push(url.origin);
        return route.abort();
      }
      if (await flashcards.route(route)) return;
      if (await blocks.route(route)) return;
      if (await assistance.route(route)) return;
      if (await canvases.route(route)) return;
      if (query.includes("x2") && p === "/api/research/ocr/modules") return route.fulfill({ json: {
        modules: [{ id: "readflow-ocr-mobile-cpu", builtin: true, engine_version: "ReadFlow CPU 1",
          model_version: "PP-OCRv5 mobile", status: "ready", total_bytes: 21524900,
          download_enabled: false, files: [], error: null }],
      } });
      if (p === "/api/v1/fonts") return route.fulfill({ json: { fonts: [
        { family: "Source Han Serif SC", available: true },
      ] } });
      if (p === "/workbench.html")
        return route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html data-wb-theme="light"><link rel="stylesheet" href="/dist/css/workbench.css"><body><div id="root" style="height:100vh"></div><script type="module" src="/fixture.js"></script></body></html>',
        });
      if (p === "/fixture.js")
        return route.fulfill({ contentType: "text/javascript", body: built.outputFiles[0].text });
      if (/^\/api\/research\/workbench\/items\/[^/]+\/annotations(?:\/[^/]+)?$/.test(p)) {
        const method = route.request().method(),
          body = ["POST", "PATCH"].includes(method) ? route.request().postDataJSON() : {};
        const id = p.split("/").at(-1);
        if (id === "export") {
          const rows = annotations.filter((row) => !body.ids || body.ids.includes(row.id));
          const markdown = annotationsMarkdown(rows, body.semantics || DEFAULT_SEMANTICS, "@synthetic");
          if (body.as_note) generatedNotes.push(markdown);
          return route.fulfill({ json: body.as_note ? { id: "note", body: markdown } : { markdown } });
        }
        if (method === "POST") {
          const row = { ...body, image_ref: body.image ? `${body.id}.png` : body.image_ref };
          annotations.push(row);
          return route.fulfill({ status: 201, json: row });
        }
        if (method === "PATCH") {
          annotations = annotations.map((row) => (row.id === id ? { ...row, ...body } : row));
          return route.fulfill({ json: annotations.find((row) => row.id === id) });
        }
        if (method === "DELETE") {
          if (!canvases.detach(id, url.searchParams.get("canvas_policy")) ||
            !flashcards.detach(id, url.searchParams.get("canvas_policy"))) {
            return route.fulfill({ status: 409, json: { error: { message: "该批注在画布中被引用。" } } });
          }
          annotations = annotations.filter((row) => row.id !== id);
          return route.fulfill({ status: 204 });
        }
        return route.fulfill({ json: { items: annotations } });
      }
      if (/^\/api\/research\/annotations\/[^/]+\/image$/.test(p)) {
        const row = annotations.find((row) => row.id === p.split("/").at(-2));
        return route.fulfill({
          contentType: "image/png",
          body: Buffer.from(row.image.split(",")[1], "base64"),
        });
      }
      if (/^\/api\/research\/workbench\/items\/[^/]+\/reader/.test(p)) {
        const method = route.request().method(),
          body = method === "POST" ? route.request().postDataJSON() : {};
        if (p.endsWith("/bookmarks") && method === "POST")
          bookmarks.push({ ...body, id: String(bookmarks.length + 1) });
        if (method === "DELETE") bookmarks = bookmarks.filter((b) => b.id !== p.split("/").at(-1));
        if (p.endsWith("/time") && !ticks.has(body.id)) {
          ticks.add(body.id);
          seconds += body.seconds;
        }
        return route.fulfill({ json: { bookmarks, seconds } });
      }
      let file;
      if (/^\/api\/research\/attachments\/[^/]+\/pdf$/.test(p))
        file = resolve(query.includes("blocks") ? "tests/fixtures/blocks/paper.pdf" : "tests/fixtures/paper.pdf");
      if (p === "/api/v1/jobs/task/pdf") file = resolve("tests/fixtures/paper-translated.pdf");
      if (p === "/src/assets/readflow-logo.svg") file = resolve(p.slice(1));
      if (/^\/fixtures\/paper(?:-translated|-100|-no-outline|-images)?\.pdf$/.test(p)) file = resolve("tests" + p);
      else if (
        p === "/dist/css/workbench.css" ||
        p.startsWith("/vendor/pdfjs-dist/") ||
        p.startsWith("/src/assets/fonts/inter/")
      )
        file = resolve(p.slice(1));
      if (file)
        return route.fulfill({
          body: await readFile(file),
          contentType:
            p.endsWith(".pdf") || p.endsWith("/pdf")
              ? "application/pdf"
              : p.endsWith(".css")
                ? "text/css"
                : p.endsWith(".mjs")
                  ? "text/javascript"
                  : "application/octet-stream",
        });
      unexpected.push(p);
      return route.fulfill({ status: 404, body: "" });
    });
    await page.goto("http://paper.test/workbench.html" + query);
    if (fixture === "tests/paper-reader/fixture.tsx")
      await page.locator('[data-paper-page="1"] .pr-text-layer span').first().waitFor();
    return {
      flashcards, blocks, browser,
      context,
      page,
      errors,
      unexpected,
      output,
      annotations: () => annotations,
      generatedNotes,
      canvases,
      assistance,
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
