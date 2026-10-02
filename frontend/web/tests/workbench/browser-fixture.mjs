// Isolated browser + in-memory responses: never visits a running preview or reads runtime configs.
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

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
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/workbench.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="zh-CN"><link rel="stylesheet" href="/dist/css/workbench.css"><body><div id="workbench-root"></div><script type="module" src="/fixture.js"></script></body></html>' });
    if (path === "/fixture.js") return route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text });
    if (path === "/dist/css/workbench.css") return route.fulfill({ contentType: "text/css", body: css });
    if (/^\/src\/assets\/fonts\/inter\/InterVariable(?:-Italic)?\.woff2$/.test(path)) return route.fulfill({ contentType: "font/woff2", body: await readFile(resolve(root, path.slice(1))) });
    if (path === "/src/assets/readflow-logo.svg") return route.fulfill({ contentType: "image/svg+xml", body: await readFile(resolve(root, path.slice(1))) });
    if (path === "/reader.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: "<!doctype html><title>Offline reader</title><p>阅读器占位</p>" });
    if (path === "/index.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="zh-CN"><body><button id="app-settings-btn">设置</button><div id="target"></div><script>document.getElementById("app-settings-btn").onclick = () => { document.getElementById("target").innerHTML = \'<button data-settings-tab="api" aria-selected="false">接口设置</button><button data-settings-tab="glossary" aria-selected="false">术语表</button><p id="selected">旧版设置</p>\'; for (const tab of document.querySelectorAll("[data-settings-tab]")) tab.onmousedown = () => { for (const other of document.querySelectorAll("[data-settings-tab]")) other.setAttribute("aria-selected", String(other === tab)); document.getElementById("selected").textContent = tab.dataset.settingsTab === "glossary" ? "旧版术语表设置" : "旧版接口设置"; }; };<\/script></body></html>' });
    throw new Error(`Unexpected offline request: ${path}`);
  });
  await page.goto("http://readflow.test/workbench.html?desk");
  await page.getByRole("region", { name: "快速开始", exact: true }).waitFor();
  await page.waitForFunction(() => window.fixture.wb.store.getSnapshot().desk.status === "ready");
  return { browser, page, output, errors };
}
