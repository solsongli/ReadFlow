import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalGateway } from "./local-gateway.js";

function canProbePort(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function gatewayOptions(extra = {}) {
  return {
    canConnectToPort: canProbePort,
    logger: { warn() {}, error() {} },
    ...extra,
  };
}

function makeFrontendDir(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "retainpdf-gateway-"));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

function getText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { agent: false }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on("error", reject);
  });
}

test("serves static files and inlines apiBase into html", async (t) => {
  const root = makeFrontendDir({
    "workbench.html": "<html><head></head><body>hi</body></html>",
    "app.js": "console.log(1)",
    "stale.html": "obsolete generated shell",
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gateway = createLocalGateway(gatewayOptions({
    frontendRoot: root,
    getBackendBase: () => "http://127.0.0.1:41001",
    logger: { warn() {}, error() {} },
  }));
  const base = await gateway.start("127.0.0.1", 40001);
  t.after(() => gateway.stop());
  const page = await getText(`${base}/workbench.html`);
  assert.equal(page.status, 200);
  assert.equal((await getText(`${base}/`)).status, 200);
  assert.equal((await getText(`${base}/stale.html`)).status, 404);
  assert.match(page.body, /Object\.assign\(\{\},window\.__FRONT_RUNTIME_CONFIG__\|\|\{\},\{"apiBase":"http:\/\/127\.0\.0\.1:41001"\}\)/);
  const script = await getText(`${base}/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers["content-type"], /javascript/);
  assert.equal(script.body, "console.log(1)");
});

test("rejects path traversal", async (t) => {
  const root = makeFrontendDir({ "workbench.html": "x" });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gateway = createLocalGateway(gatewayOptions({
    frontendRoot: root,
    getBackendBase: () => "",
    logger: { warn() {}, error() {} },
  }));
  const base = await gateway.start("127.0.0.1", 40001);
  t.after(() => gateway.stop());
  const evil = await getText(`${base}/..%2f..%2fetc%2fpasswd`);
  assert.ok([400, 404].includes(evil.status));
});

test("proxies /api with headers and streams SSE without buffering", async (t) => {
  const backend = http.createServer((req, res) => {
    assert.equal(req.headers["x-api-key"], "k123");
    res.writeHead(200, { "Content-Type": "text/event-stream", "Transfer-Encoding": "chunked" });
    res.write('data: {"a":1}\n\n');
    setTimeout(() => {
      res.end('data: {"b":2}\n\n');
    }, 50);
  });
  await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
  t.after(() => backend.close());
  const backendPort = backend.address().port;
  const root = makeFrontendDir({ "workbench.html": "x" });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gateway = createLocalGateway(gatewayOptions({
    frontendRoot: root,
    getBackendBase: () => `http://127.0.0.1:${backendPort}`,
    logger: { warn() {}, error() {} },
  }));
  const base = await gateway.start("127.0.0.1", 40001);
  t.after(() => gateway.stop());
  const chunks = [];
  await new Promise((resolve, reject) => {
    const options = { agent: false, headers: { "x-api-key": "k123" } };
    http.get(`${base}/api/v1/ai/ask`, options, (res) => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "text/event-stream");
      res.on("data", (chunk) => chunks.push(String(chunk)));
      res.on("end", resolve);
      res.on("error", reject);
    }).on("error", reject);
  });
  assert.match(chunks.join(""), /"a":1/);
  assert.match(chunks.join(""), /"b":2/);
});

test("returns 502 JSON when backend is down", async (t) => {
  const root = makeFrontendDir({ "workbench.html": "x" });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gateway = createLocalGateway(gatewayOptions({
    frontendRoot: root,
    getBackendBase: () => "http://127.0.0.1:9",
    logger: { warn() {}, error() {} },
  }));
  const base = await gateway.start("127.0.0.1", 40001);
  t.after(() => gateway.stop());
  const res = await getText(`${base}/api/v1/jobs?limit=1`);
  assert.equal(res.status, 502);
  assert.equal(JSON.parse(res.body).code, 1);
});

test("finds next free gateway port", async (t) => {
  const blocker = http.createServer((req, res) => res.end("busy"));
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  t.after(() => blocker.close());
  const busyPort = blocker.address().port;
  const root = makeFrontendDir({ "workbench.html": "x" });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gateway = createLocalGateway(gatewayOptions({
    frontendRoot: root,
    getBackendBase: () => "",
    canConnectToPort: async (_host, port) => port === busyPort,
    logger: { warn() {}, error() {} },
  }));
  const base = await gateway.start("127.0.0.1", busyPort);
  t.after(() => gateway.stop());
  assert.notEqual(base, `http://127.0.0.1:${busyPort}`);
});

test("inlines full runtime config including xApiKey", async (t) => {
  const root = makeFrontendDir({
    "workbench.html": "<html><head><script>window.__FRONT_RUNTIME_CONFIG__={xApiKey:\"\",ocrProvider:\"mineru\"};</script></head><body>x</body></html>",
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gateway = createLocalGateway(gatewayOptions({
    frontendRoot: root,
    getBackendBase: () => "http://127.0.0.1:41001",
    getRuntimeConfig: () => ({
      apiBase: "http://127.0.0.1:41001",
      xApiKey: "retain-pdf-desktop",
      ocrProvider: "paddle",
    }),
  }));
  const base = await gateway.start("127.0.0.1", 40001);
  t.after(() => gateway.stop());
  const page = await getText(`${base}/workbench.html`);
  assert.equal(page.status, 200);
  assert.match(page.body, /"xApiKey":"retain-pdf-desktop"/);
  assert.match(page.body, /"ocrProvider":"paddle"/);
});

function requestGateway(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method, headers, agent: false }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
    });
    request.once("error", reject);
    request.end(body);
  });
}

async function startSecuredGateway(t, extra = {}) {
  const root = makeFrontendDir({ "workbench.html": "<body>original shell</body>", "reader.html": "<body>reader</body>" });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gateway = createLocalGateway(gatewayOptions({ frontendRoot: root, ...extra }));
  const base = await gateway.start("127.0.0.1", 0);
  t.after(() => gateway.stop());
  return { gateway, base };
}

test("routes research requests with the internal token while Rust keeps its original route", async (t) => {
  const seen = [];
  const research = http.createServer((req, res) => {
    seen.push({ service: "research", url: req.url, headers: req.headers });
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end('{"items":[]}');
  });
  const rust = http.createServer((req, res) => {
    seen.push({ service: "rust", url: req.url, headers: req.headers });
    res.end('{"documents":[]}');
  });
  await new Promise((resolve) => research.listen(0, "127.0.0.1", resolve));
  await new Promise((resolve) => rust.listen(0, "127.0.0.1", resolve));
  t.after(() => research.close());
  t.after(() => rust.close());
  const { base } = await startSecuredGateway(t, {
    getResearchBase: () => `http://127.0.0.1:${research.address().port}`,
    getResearchInternalToken: () => "server-owned-token",
    getBackendBase: () => `http://127.0.0.1:${rust.address().port}`,
  });
  const first = await requestGateway(`${base}/api/research/items?query=paper`, {
    headers: { "x-retainpdf-internal": "browser-forgery", "x-api-key": "synthetic-native-key", Origin: base },
  });
  assert.equal(first.status, 200);
  assert.equal(first.headers["access-control-allow-origin"], undefined);
  await requestGateway(`${base}/api/v1/documents`, {
    headers: { "x-retainpdf-internal": "browser-forgery", "x-api-key": "synthetic-native-key" },
  });
  assert.equal(seen[0].service, "research");
  assert.equal(seen[0].url, "/api/research/items?query=paper");
  assert.equal(seen[0].headers["x-retainpdf-internal"], "server-owned-token");
  assert.equal(seen[1].service, "rust");
  assert.equal(seen[1].headers["x-retainpdf-internal"], undefined);
  assert.equal(seen[1].headers["x-api-key"], "synthetic-native-key");
});

test("rejects foreign Host, Origin, fetch context and cross-site writes on both APIs", async (t) => {
  let reachedBackend = 0;
  const { base } = await startSecuredGateway(t, {
    getBackendBase: () => { reachedBackend += 1; return "http://127.0.0.1:9"; },
    getResearchBase: () => { reachedBackend += 1; return "http://127.0.0.1:9"; },
    getResearchInternalToken: () => "internal",
  });
  for (const api of ["/api/research/items", "/api/v1/documents"]) {
    for (const headers of [
      { Host: "attacker.example" }, { Host: "127.0.0.1:9" },
      { Origin: "https://attacker.example" }, { Origin: "null" }, { Origin: "https://[" },
      { Origin: "http://127.0.0.1:9" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" },
    ]) {
      assert.equal((await requestGateway(`${base}${api}`, { headers })).status, 403);
      assert.equal((await requestGateway(`${base}${api}`, { method: "POST", headers, body: "{}" })).status, 403);
    }
  }
  assert.equal(reachedBackend, 0);
});

test("allows entry navigation but never extends that exception to API, iframe or POST", async (t) => {
  const { base } = await startSecuredGateway(t);
  const navigation = { Origin: "https://example.org", "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" };
  assert.equal((await requestGateway(`${base}/`, { headers: navigation })).status, 200);
  assert.equal((await requestGateway(`${base}/reader.html`, { headers: navigation })).status, 403);
  const readerFrame = await requestGateway(`${base}/reader.html`, { headers: {
    Origin: base, "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe",
  } });
  assert.equal(readerFrame.status, 404);
  assert.equal(readerFrame.headers["x-frame-options"], "SAMEORIGIN");
  assert.equal((await requestGateway(`${base}/api/research/items`, { headers: navigation })).status, 403);
  assert.equal((await requestGateway(`${base}/`, { method: "POST", headers: navigation })).status, 403);
  assert.equal((await requestGateway(`${base}/`, { headers: { ...navigation, "Sec-Fetch-Dest": "iframe" } })).status, 403);
  assert.equal((await requestGateway(`${base}/`, { headers: { ...navigation, Host: "foreign.example" } })).status, 403);
});

test("research unavailable is explicit and never falls through to Rust", async (t) => {
  let reachedRust = false;
  const { base } = await startSecuredGateway(t, {
    getBackendBase: () => { reachedRust = true; return "http://127.0.0.1:9"; },
  });
  const response = await requestGateway(`${base}/api/research/healthz`);
  assert.equal(response.status, 503);
  assert.equal(JSON.parse(response.body).message, "research library not ready");
  assert.equal(reachedRust, false);
});

test("configuration strings cannot break out of the inline runtime script", () => {
  const gateway = createLocalGateway({ getRuntimeConfig: () => ({ model: '</script><script>throw "bad"</script>' }) });
  const html = gateway.injectRuntimeConfig("<body>shell</body>");
  assert.equal(html.split("<script>").length - 1, 1);
  assert.match(html, /\\u003c\/script>/);
});
