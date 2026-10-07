import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createTodoRoutes } from "./todo-routes.mjs";

export async function notesBrowser() {
  const root = process.cwd(), output = "/tmp/readflow-t5/screenshots";
  await mkdir(output, { recursive: true });
  const built = await build({ entryPoints: ["tests/workbench/notes-fixture.tsx"], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": resolve(root, "src") }, logLevel: "silent" });
  const browser = await chromium.launch({ executablePath: process.env.READFLOW_CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: "light", acceptDownloads: true });
  await context.addInitScript(() => {
    window.__FRONT_RUNTIME_CONFIG__ = { apiBase: "http://notes.test" };
    let clipboard = "";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { clipboard = text; }, readText: async () => clipboard } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = [], unexpected = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const todos = createTodoRoutes();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (await todos.handle(route)) return;
    if (url.origin !== "http://notes.test") { unexpected.push(url.origin); return route.abort(); }
    if (path === "/workbench.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="zh-CN"><link rel="stylesheet" href="/dist/css/workbench.css"><body><div id="workbench-root"></div><script type="module" src="/fixture.js"></script></body></html>' });
    if (path === "/fixture.js") return route.fulfill({ contentType: "text/javascript", body: built.outputFiles[0].text });
    if (path === "/dist/css/workbench.css") return route.fulfill({ contentType: "text/css", body: await readFile(resolve(root, "dist/css/workbench.css")) });
    if (/^\/src\/assets\/fonts\/inter\/InterVariable(?:-Italic)?\.woff2$/.test(path)) return route.fulfill({ contentType: "font/woff2", body: await readFile(resolve(root, path.slice(1))) });
    if (path === "/vendor/marked/lib/marked.esm.js") return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(root, path.slice(1))) });
    if (path === "/reader.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><p>Offline reader</p><script>window.documentToken=Math.random()</script>' });
    if (path === "/api/research/workbench/notes") return route.fulfill({ json: await page.evaluate((query) => window.fixture.listNotes(query), Object.fromEntries(url.searchParams)) });
    if (/^\/api\/research\/(?:items\/[\w-]+\/notes|notes\/[\w-]+)$/.test(path)) {
      const method = route.request().method(), id = path.split("/").at(method === "POST" ? -2 : -1);
      const payload = method === "DELETE" ? {} : route.request().postDataJSON();
      if (Object.keys(payload).some((key) => key !== "body")) throw new Error("Notes body-only mutation contract changed");
      const delay = await page.evaluate(() => window.fixture.data.saveDelay);
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const value = await page.evaluate(({ method, id, payload }) => {
        try { return { ok: true, data: window.fixture.mutate(method, id, payload) }; }
        catch { return { ok: false }; }
      }, { method, id, payload });
      if (!value.ok) return route.fulfill({ status: 503, json: { error: { message: "离线测试：保存失败" } } });
      return method === "DELETE" ? route.fulfill({ status: 204 }) : route.fulfill({ status: method === "POST" ? 201 : 200, json: value.data });
    }
    unexpected.push(path); return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("http://notes.test/workbench.html");
  await page.locator('[data-wb-list] [role="option"]').first().waitFor();
  return { browser, page, output, errors, unexpected };
}
