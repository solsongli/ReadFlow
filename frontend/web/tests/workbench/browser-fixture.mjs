// Isolated browser + in-memory responses: never visits a running preview or reads runtime configs.
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createTodoRoutes } from "./todo-routes.mjs";

export async function openDeskFixture() {
  const root = process.cwd();
  const output = "/tmp/readflow-t2/screenshots";
  await mkdir(output, { recursive: true });
  const bundle = await build({ entryPoints: ["tests/workbench/apple-fixture.tsx"], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": resolve(root, "src") }, logLevel: "silent" });
  const css = await readFile("dist/css/workbench.css", "utf8");
  const browser = await chromium.launch({ executablePath: process.env.READFLOW_CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  const todoRoutes = createTodoRoutes({ 2: "OpenVLA: An Open-Source Vision-Language-Action Model" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (await todoRoutes.handle(route)) return;
    // Review widget and canvas lists: empty data keeps the desk offline and deterministic.
    if (/^\/api\/research\/workbench\/(flashcards|decks|card-reviews|canvases)$/.test(path)) return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ items: [] }) });
    if (path === "/workbench.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="zh-CN"><link rel="stylesheet" href="/dist/css/workbench.css"><body><div id="workbench-root"></div><script type="module" src="/fixture.js"></script></body></html>' });
    if (path === "/fixture.js") return route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text });
    if (path === "/dist/css/workbench.css") return route.fulfill({ contentType: "text/css", body: css });
    if (/^\/src\/assets\/fonts\/inter\/InterVariable(?:-Italic)?\.woff2$/.test(path)) return route.fulfill({ contentType: "font/woff2", body: await readFile(resolve(root, path.slice(1))) });
    if (path === "/src/assets/readflow-logo.svg") return route.fulfill({ contentType: "image/svg+xml", body: await readFile(resolve(root, path.slice(1))) });
    if (path === "/reader.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: "<!doctype html><title>Offline reader</title><p>阅读器占位</p>" });
    throw new Error(`Unexpected offline request: ${path}`);
  });
  await page.goto("http://readflow.test/workbench.html?desk");
  await page.getByRole("region", { name: "翻译 PDF", exact: true }).waitFor();
  await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().desk.status === "ready");
  return { browser, page, output, errors, todos: todoRoutes.todos };
}
