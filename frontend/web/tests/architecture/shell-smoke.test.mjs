import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

// 壳 A10 冒烟:三页 HTML 挂载顺序 + 三 entry createRoot/无 StrictMode + 静态 200。
// 只读源码文本与隔离静态服务的 HTTP 状态，不访问已安装应用、预览或真实凭据。

const PROJECT_ROOT = process.cwd();
const PAGES = [{ html: "workbench.html", bundle: "dist/workbench.bundle.js", entry: "src/app/workbench/entry.tsx" }];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

async function probe(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    await res.arrayBuffer().catch(() => undefined);
    return { reachable: true, status: res.status };
  } catch {
    return { reachable: false, status: 0 };
  }
}

test("两个 HTML都挂对bundle且runtime-config在前", () => {
  for (const page of PAGES) {
    const html = readFileSync(join(PROJECT_ROOT, page.html), "utf8");
    // 只认 <script> 标签(注释里的 bundle 名不算),按文档顺序取 src。
    const tags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map((m) => ({
      tag: m[0],
      src: m[1],
    }));
    const at = (name) => tags.findIndex((t) => t.src.includes(name));
    const iBase = at("runtime-config.js");
    const iLocal = at("runtime-config.local.js");
    const iBundle = at(page.bundle);
    assert.ok(iBase !== -1, `${page.html} 缺 runtime-config.js`);

    assert.ok(iBundle !== -1, `${page.html} 缺 ${page.bundle}`);
    assert.ok(iBase < iBundle && (iLocal === -1 || (iBase < iLocal && iLocal < iBundle)), `${page.html} 顺序错:runtime-config应在bundle前`);
    assert.ok(tags[iBundle].tag.includes('type="module"'), `${page.html} bundle应为type=module`);
    assert.ok(existsSync(join(PROJECT_ROOT, page.bundle)), `${page.html} bundle构建产物缺失:${page.bundle}`);
  }
});

test("两个入口都有createRoot且不开StrictMode", () => {
  for (const page of PAGES) {
    const entry = readFileSync(join(PROJECT_ROOT, page.entry), "utf8");
    const chain = [entry];
    for (const extra of page.bootChain ?? []) {
      chain.push(readFileSync(isAbsolute(extra) ? extra : join(PROJECT_ROOT, "..", "..", extra), "utf8"));
    }
    const code = stripComments(chain.join("\n"));
    assert.ok(code.includes("createRoot"), `${page.entry} 链无createRoot`);
    assert.ok(!code.includes("StrictMode"), `${page.entry} 链开了StrictMode(约定不开)`);
  }
});

test("两个页面在隔离临时端口返回200，不探测已运行的应用", { timeout: 15000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "readflow-static-shell-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const page of PAGES) copyFileSync(join(PROJECT_ROOT, page.html), join(root, page.html));
  const script = [
    "import functools, importlib.util, sys",
    "spec = importlib.util.spec_from_file_location('fixture_static', sys.argv[1])",
    "module = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "handler = functools.partial(module.FrontendRequestHandler, directory=sys.argv[2])",
    "with module.ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:",
    "    print('READY_PORT=' + str(server.server_port), flush=True)",
    "    server.serve_forever()",
  ].join("\n");
  const server = spawn("python3", ["-B", "-u", "-c", script, join(PROJECT_ROOT, "scripts/serve_static.py"), root], {
    cwd: root, stdio: ["ignore", "pipe", "ignore"],
    // Explicit fake configuration bypasses serve_static's credential discovery.
    env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1", RETAIN_PDF_FRONTEND_ROOT: root,
      RETAIN_PDF_FRONTEND_X_API_KEY: "fixture", RETAIN_PDF_FRONTEND_API_BASE: "http://127.0.0.1:9" },
  });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) { const exit = once(server, "exit"); server.kill(); await exit; }
  });
  const port = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("隔离静态服务未就绪")), 10000);
    server.once("error", (error) => { clearTimeout(timer); reject(error); });
    server.once("exit", () => { clearTimeout(timer); reject(new Error("隔离静态服务提前退出")); });
    server.stdout.on("data", (chunk) => {
      output += String(chunk);
      const match = output.match(/READY_PORT=(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  assert.equal((await probe(`http://127.0.0.1:${port}/`)).status, 200);
  for (const page of PAGES) assert.equal((await probe(`http://127.0.0.1:${port}/${page.html}`)).status, 200);
});
