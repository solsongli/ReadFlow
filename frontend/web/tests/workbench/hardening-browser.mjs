import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

export async function hardeningBrowser() {
  const root = process.cwd(), output = "/tmp/readflow-t6/screenshots";
  await mkdir(output, { recursive: true });
  const bundle = await build({ entryPoints: ["tests/workbench/apple-fixture.tsx"], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": resolve(root, "src") }, logLevel: "silent" });
  const legacy = await build({ entryPoints: ["tests/workbench/legacy-confirm-fixture.tsx"], outfile: "/tmp/readflow-t6/legacy-fixture.js", bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": resolve(root, "src") }, logLevel: "silent" });
  const html = await readFile("workbench.html", "utf8");
  const favicon = html.match(/<link rel="icon"[^>]+>/)?.[0] ?? "";
  const browser = await chromium.launch({ executablePath: process.env.READFLOW_CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  await context.addInitScript(() => { let copied = ""; Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value) => { copied = value; }, readText: async () => copied } }); });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  const errors = [], unexpected = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (url.origin !== "http://hardening.test") { unexpected.push(url.origin); return route.abort(); }
    if (path === "/workbench.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="zh-CN"><head><title>ReadFlow</title>${favicon}<link rel="stylesheet" href="/dist/css/workbench.css"></head><body><div id="workbench-root"></div><script type="module" src="/fixture.js"></script></body></html>` });
    if (path === "/fixture.js") return route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text });
    if (path === "/legacy.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><link rel="stylesheet" href="/legacy.css"><div id="root"></div><script type="module" src="/legacy-fixture.js"></script>' });
    if (path === "/legacy-fixture.js") return route.fulfill({ contentType: "text/javascript", body: legacy.outputFiles.find((file) => file.path.endsWith(".js")).text });
    if (path === "/legacy.css") return route.fulfill({ contentType: "text/css", body: await readFile(resolve(root, "src/app/research-library/styles.css")) });
    if (path === "/dist/css/workbench.css") return route.fulfill({ contentType: "text/css", body: await readFile(resolve(root, path.slice(1))) });
    if (/^\/src\/assets\/fonts\/inter\/InterVariable(?:-Italic)?\.woff2$/.test(path)) return route.fulfill({ contentType: "font/woff2", body: await readFile(resolve(root, path.slice(1))) });
    if (path === "/src/assets/readflow-logo.svg") return route.fulfill({ contentType: "image/svg+xml", body: await readFile(resolve(root, path.slice(1))) });
    if (path === "/reader.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: "<!doctype html><p>Offline Reader</p>" });
    unexpected.push(path); return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("http://hardening.test/workbench.html?large");
  await page.locator('[data-wb-list] [role="option"]').first().waitFor();
  return { browser, page, output, errors, unexpected };
}
