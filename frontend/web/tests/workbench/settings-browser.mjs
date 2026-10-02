import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

export async function settingsBrowser({ runtimeOnly = false } = {}) {
  const root = process.cwd(), output = "/tmp/readflow-t4/screenshots";
  await mkdir(output, { recursive: true });
  const built = await build({ entryPoints: ["tests/workbench/settings-fixture.tsx"], bundle: true, write: false, format: "esm", jsx: "automatic", alias: { "@": resolve(root, "src") }, logLevel: "silent" });
  const browser = await chromium.launch({ executablePath: process.env.READFLOW_CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  await context.addInitScript(({ runtimeOnly }) => {
    window.__FRONT_RUNTIME_CONFIG__ = { apiBase: "http://settings.test" };
    if (runtimeOnly) {
      Object.assign(window.__FRONT_RUNTIME_CONFIG__, { modelApiKey: "演示凭据", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-flash" });
      return;
    }
    let saved = { firstRunCompleted: true, browserConfig: { ocrProvider: "local", modelApiKey: "演示凭据" }, developerConfig: { translationProvider: "custom", baseUrl: "https://model.example.test/v1", model: "demo-model", workers: 4, glossaryId: "g1", mathMode: "direct_typst" }, runtimeConfig: {} };
    const metrics = { reads: 0, saves: 0 };
    window.testDesktopMetrics = metrics;
    window.retainPdfDesktop = { appVersion: "0.9.0-demo", invoke: async () => null,
      loadDesktopConfig: async () => { metrics.reads++; return structuredClone(saved); },
      saveDesktopConfig: async (value) => { metrics.saves++; saved = { ...saved, ...value, browserConfig: { ...saved.browserConfig, modelApiKey: value.modelApiKey, ocrProvider: value.ocrProvider, translationCredentialRef: value.translationCredentialRef } }; return structuredClone(saved); },
    };
  }, { runtimeOnly });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [], unexpected = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (url.origin !== "http://settings.test") { unexpected.push(url.origin); return route.abort(); }
    if (path === "/workbench.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="zh-CN"><link rel="stylesheet" href="/dist/css/workbench.css"><body><div id="workbench-root"></div><script type="module" src="/fixture.js"></script></body></html>' });
    if (path === "/fixture.js") return route.fulfill({ contentType: "text/javascript", body: built.outputFiles[0].text });
    if (path === "/dist/css/workbench.css") return route.fulfill({ contentType: "text/css", body: await readFile(resolve(root, "dist/css/workbench.css")) });
    if (/^\/src\/assets\/fonts\/inter\/(?:InterVariable(?:-Italic)?\.woff2|LICENSE.txt)$/.test(path) || path === "/src/assets/readflow-logo.svg") return route.fulfill({ contentType: path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".txt") ? "text/plain; charset=utf-8" : "font/woff2", body: await readFile(resolve(root, path.slice(1))) });
    if (path === "/reader.html") return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><body><p>Offline reader</p><script>window.documentToken=Math.random();window.credentialNotifications=0;document.addEventListener("retainpdf:credentials-changed",()=>window.credentialNotifications++)</script></body>' });
    unexpected.push(path); return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("http://settings.test/workbench.html");
  await page.locator('[data-wb-list] [role="option"]').first().waitFor();
  return { browser, page, output, errors, unexpected };
}
