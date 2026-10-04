import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  READY_PREFIX, buildResearchFrontendRuntime, createResearchLibraryRuntime,
  readResearchPreviewPorts, resolveResearchServiceEntry,
} from "./research-library-runtime.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "retainpdf-runtime-test-"));
  const entry = path.join(root, "native_library_service.py");
  fs.writeFileSync(entry, "# synthetic launcher fixture\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, entry };
}

function fakeChild(pid = 12345) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; child.emit("exit", null, "SIGTERM"); };
  return child;
}

function settings(entry, root) {
  return { serviceEntry: entry, pythonRuntime: { command: "/selected/bundled/python3" },
    dataRoot: path.join(root, "data"), backendBase: "http://127.0.0.1:47100",
    appVersion: "0.9.5", desktopApiKey: "synthetic-desktop-key", env: { PYTHONHOME: "/selected/bundled",
      PYTHONPATH: "selected-packages", TYPST_BIN: "/selected/typst/bin/typst",
      TYPST_PACKAGE_PATH: "/selected/typst-packages", RETAIN_PDF_TYPST_FONT_DIRS: "/selected/fonts" },
    timeoutMs: 1500 };
}

test("defaults remain unchanged until research is enabled and preview uses dedicated ports", () => {
  const original = { apiBase: "http://127.0.0.1:41000", xApiKey: "synthetic" };
  assert.equal(buildResearchFrontendRuntime(original), original);
  assert.deepEqual(buildResearchFrontendRuntime(original, {
    enabled: true, gatewayBase: "http://127.0.0.1:47500", offlinePreview: true,
  }), { ...original, apiBase: "http://127.0.0.1:47500", researchLibraryEnabled: true,
    offlineLibraryPreview: true });
  assert.deepEqual(readResearchPreviewPorts({}), { apiPort: 47100, simplePort: 47200, jobsPort: 47300,
    aiServicePort: 47400, gatewayPort: 47500 });
  assert.throws(() => readResearchPreviewPorts({ RETAIN_PDF_PREVIEW_API_PORT: "65535" }), /1024 and 65485/);
  assert.throws(() => readResearchPreviewPorts({ RETAIN_PDF_PREVIEW_API_PORT: "47200" }), /distinct/);
});

test("uses the already selected Python and keeps authentication out of arguments, UI and logs", async (t) => {
  const { entry, root } = fixture(t);
  const child = fakeChild();
  let invocation;
  const logs = [];
  const runtime = createResearchLibraryRuntime({
    spawnChild: (...args) => { invocation = args; return child; },
    logger: { warn: (message) => logs.push(message) },
    healthProbe: async (_base, token) => token === invocation[2].env.RETAIN_PDF_RESEARCH_INTERNAL_TOKEN,
  });
  t.after(() => runtime.stop());
  const starting = runtime.start({ ...settings(entry, root), connectorPort: 23219, connectorState: { status: "disabled", port: 23219 } });
  const token = invocation[2].env.RETAIN_PDF_RESEARCH_INTERNAL_TOKEN;
  assert.match(token, /^[a-f0-9]{64}$/);
  child.stderr.write(`redact ${token} and synthetic-desktop-key\n`);
  child.stdout.write(`${READY_PREFIX}{"base_`);
  child.stdout.write('url":"http://127.0.0.1:49200"}\n');
  assert.equal(await starting, "http://127.0.0.1:49200");
  assert.equal(invocation[0], "/selected/bundled/python3");
  assert.equal(invocation[2].env.READFLOW_APP_VERSION, "0.9.5");
  assert.equal(invocation[2].env.PYTHONHOME, "/selected/bundled");
  assert.equal(invocation[2].env.PYTHONPATH, "selected-packages");
  assert.equal(invocation[2].env.READFLOW_TYPST_BIN, "/selected/typst/bin/typst");
  assert.equal(invocation[2].env.READFLOW_TYPST_PACKAGES, "/selected/typst-packages");
  assert.equal(invocation[2].env.READFLOW_FONT_DIRS, "/selected/fonts");
  assert.equal(invocation[2].env.RETAIN_PDF_RESEARCH_NATIVE_API_KEY, "synthetic-desktop-key");
  assert.ok(invocation[1].includes("--connector-port"));
  assert.deepEqual(JSON.parse(invocation[1][invocation[1].indexOf("--connector-state") + 1]), { status: "disabled", port: 23219 });
  assert.ok(!invocation[1].includes(token));
  assert.ok(!invocation[1].includes("synthetic-desktop-key"));
  assert.ok(!logs.join("\n").includes(token));
  assert.ok(!logs.join("\n").includes("synthetic-desktop-key"));
  assert.equal(runtime.getInternalToken(), token);
  const killed = [];
  runtime.stop({ killProcessTreeSync: (pid) => killed.push(pid) });
  runtime.stop({ killProcessTreeSync: (pid) => killed.push(pid) });
  assert.deepEqual(killed, [child.pid]);
  assert.equal(runtime.getBaseUrl(), "");
  assert.equal(runtime.getInternalToken(), "");
});

test("sidecar exit and invalid readiness fail explicitly without creating a fallback", async (t) => {
  const { entry, root } = fixture(t);
  for (const event of ["exit", "invalid"]) {
    const child = fakeChild();
    const runtime = createResearchLibraryRuntime({ spawnChild: () => child, logger: { warn() {} } });
    const starting = runtime.start(settings(entry, root));
    if (event === "exit") child.emit("exit", 2, null);
    else child.stdout.write(`${READY_PREFIX}{"base_url":"https://remote.example"}\n`);
    await assert.rejects(starting, /native research-library startup failed/);
    assert.equal(runtime.getBaseUrl(), "");
    runtime.stop();
  }
  assert.throws(() => resolveResearchServiceEntry({ appRoot: root }), /missing native research-library/);
});

test("shutdown settles pending startup and never kills an unowned process", async (t) => {
  const { entry, root } = fixture(t);
  const child = fakeChild();
  const killed = [];
  const runtime = createResearchLibraryRuntime({ spawnChild: () => child, logger: { warn() {} } });
  const starting = runtime.start(settings(entry, root));
  runtime.stop({ killProcessTreeSync: (pid) => killed.push(pid) });
  await assert.rejects(starting, /startup cancelled/);
  assert.deepEqual(killed, [child.pid]);
  runtime.stop({ killProcessTreeSync: (pid) => killed.push(pid) });
  assert.deepEqual(killed, [child.pid]);
});

test("a healthy sidecar that later exits triggers the explicit desktop error callback", async (t) => {
  const { entry, root } = fixture(t);
  const child = fakeChild();
  const failures = [];
  const runtime = createResearchLibraryRuntime({ spawnChild: () => child, logger: { warn() {} },
    healthProbe: async () => true, onUnexpectedExit: (error) => failures.push(error.message) });
  const starting = runtime.start(settings(entry, root));
  child.stdout.write(`${READY_PREFIX}{"base_url":"http://127.0.0.1:49300"}\n`);
  await starting;
  child.emit("exit", 3, null);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /code=3/);
  assert.equal(runtime.getBaseUrl(), "");
  runtime.stop();
});

test("registry-managed shutdown cancels startup without killing the child before tree capture", async (t) => {
  const { entry, root } = fixture(t);
  const child = fakeChild();
  const runtime = createResearchLibraryRuntime({ spawnChild: () => child, logger: { warn() {} } });
  const starting = runtime.start(settings(entry, root));
  runtime.stop({ terminateChild: false });
  await assert.rejects(starting, /startup cancelled/);
  assert.equal(child.killed, false);
});
