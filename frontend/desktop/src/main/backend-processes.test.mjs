import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { createBackendProcessRegistry, linuxChildren, parseProcStat, readLinuxProcess } from "./backend-processes.js";

function fixture(t, behaviour = "term") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-pids-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const backendRoot = path.join(root, "resources/backend");
  const userData = path.join(root, "profile");
  fs.mkdirSync(backendRoot, { recursive: true });
  const processes = new Map();
  const signals = [];
  let time = 0;
  const registry = createBackendProcessRegistry({
    backendRoot, userData, bootId: "synthetic-boot", logger: { warn() {} },
    readProcess: (pid) => processes.get(pid) || null,
    childrenOf: (pid) => [...processes.values()].filter((item) => item.ppid === pid).map((item) => item.pid),
    now: () => time, delay: async (ms) => { time += ms; }, termTimeoutMs: 25, killTimeoutMs: 25,
    signal(pid, name) {
      signals.push([pid, name]);
      if (behaviour === "term" || name === "SIGKILL") processes.delete(pid);
      if (behaviour === "reuse") processes.set(pid, { ...processes.get(pid), startTime: "99999" });
    },
  });
  function processEntry(pid = 200, filename = "bin/rust_api", ppid = 100) {
    const entry = { pid, ppid, state: "S", startTime: "12345678901234567890", executable: path.join(backendRoot, filename) };
    processes.set(pid, entry);
    return entry;
  }
  function writeJournal(entries, overrides = {}) {
    fs.mkdirSync(path.dirname(registry.filename), { recursive: true });
    fs.writeFileSync(registry.filename, JSON.stringify({
      application: "app.readflow.desktop", version: 1, bootId: "synthetic-boot", backendRoot, processes: entries, ...overrides,
    }));
  }
  return { root, backendRoot, registry, processes, signals, processEntry, writeJournal };
}

test("proc stat field 22 is parsed losslessly with spaces and parentheses in comm", () => {
  const value = `200 (a worker (name)) S 100 ${Array(17).fill("0").join(" ")} 12345678901234567890 42`;
  assert.deepEqual(parseProcStat(value), { pid: 200, state: "S", ppid: 100, startTime: "12345678901234567890" });
  assert.equal(parseProcStat("broken record"), null);
});

test("descendant discovery includes children spawned by non-leader Rust threads", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-proc-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [tid, children] of [[200, "300"], [201, "301 302"], [202, "302"]]) {
    const directory = path.join(root, `200/task/${tid}`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "children"), children);
  }
  assert.deepEqual(linuxChildren(200, root).sort(), [300, 301, 302]);
});

test("startup terminates a matching recorded backend with TERM and clears the journal", async (t) => {
  const f = fixture(t);
  f.writeJournal([f.processEntry()]);
  await f.registry.recover();
  assert.deepEqual(f.signals, [[200, "SIGTERM"]]);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.registry.filename)).processes, []);
  assert.equal(fs.statSync(f.registry.filename).mode & 0o777, 0o600);
});

test("startup escalates to KILL only for the same process after its TERM timeout", async (t) => {
  const f = fixture(t, "kill");
  f.writeJournal([f.processEntry()]);
  await f.registry.recover();
  assert.deepEqual(f.signals, [[200, "SIGTERM"], [200, "SIGKILL"]]);
});

test("a reused PID with a different start time is never signalled", async (t) => {
  const f = fixture(t);
  f.writeJournal([{ ...f.processEntry(), startTime: "old-start-time".length.toString() }]);
  await f.registry.recover();
  assert.deepEqual(f.signals, []);
  assert.ok(f.processes.has(200));
});

test("a PID reused during the TERM grace period is not sent KILL", async (t) => {
  const f = fixture(t, "reuse");
  f.writeJournal([f.processEntry()]);
  await f.registry.recover();
  assert.deepEqual(f.signals, [[200, "SIGTERM"]]);
  assert.equal(f.processes.get(200).startTime, "99999");
});

test("wrong executable, sibling path prefix and outside-backend records are all rejected", async (t) => {
  for (const variant of ["different", "sibling", "outside"]) {
    const f = fixture(t);
    const original = f.processEntry();
    const executable = variant === "different" ? path.join(f.backendRoot, "bin/other")
      : variant === "sibling" ? `${f.backendRoot}-other/bin/rust_api` : "/usr/bin/python3";
    f.processes.set(200, { ...original, executable });
    f.writeJournal([variant === "outside" ? { ...original, executable } : original]);
    await f.registry.recover();
    assert.deepEqual(f.signals, [], variant);
    assert.ok(f.processes.has(200));
  }
});

test("malformed JSON or a corrupt entry refuses the entire PID file", async (t) => {
  for (const variant of ["json", "schema"]) {
    const f = fixture(t);
    f.writeJournal([f.processEntry(), { pid: 201 }]);
    if (variant === "json") fs.writeFileSync(f.registry.filename, '{"processes":[');
    await f.registry.recover();
    assert.deepEqual(f.signals, []);
    assert.ok(f.processes.has(200));
  }
});

test("records from another install or boot never authorize cleanup", async (t) => {
  for (const overrides of [{ backendRoot: "/opt/RetainPDF/resources/backend" }, { bootId: "previous-boot" }]) {
    const f = fixture(t);
    f.writeJournal([f.processEntry()], overrides);
    await f.registry.recover();
    assert.deepEqual(f.signals, []);
  }
});

test("tracking captures only the owned tree and retains children when the parent exits", async (t) => {
  const f = fixture(t);
  const parent = f.processEntry();
  f.processEntry(201, "python/bin/python3", 200);
  f.processEntry(202, "bin/retain-jobsd", 200);
  f.processEntry(203, "bin/rust_api", 999); // Another instance, same executable.
  const child = new EventEmitter();
  child.pid = parent.pid;
  f.registry.trackChild(child);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.registry.filename)).processes.map((item) => item.pid), [200, 201, 202]);
  f.processes.delete(200); // Abrupt parent exit/reparenting.
  for (const pid of [201, 202]) f.processes.set(pid, { ...f.processes.get(pid), ppid: 1 });
  await f.registry.stopAll();
  assert.deepEqual(f.signals, [[201, "SIGTERM"], [202, "SIGTERM"]]);
  assert.ok(f.processes.has(203));
});

test("a fresh registry cleans a real recorded orphan after its parent was killed", { skip: process.platform !== "linux" }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-orphan-integration-"));
  const backendRoot = path.join(root, "resources/backend");
  const userData = path.join(root, "profile");
  fs.mkdirSync(backendRoot, { recursive: true });
  // Only synthetic temporary helpers run here, never the packaged application.
  for (const name of ["sh", "sleep"]) {
    fs.copyFileSync(`/bin/${name}`, path.join(backendRoot, name));
    fs.chmodSync(path.join(backendRoot, name), 0o755);
  }
  const settings = { backendRoot, userData, logger: { warn() {} }, termTimeoutMs: 500 };
  const registry = createBackendProcessRegistry(settings);
  let recovered;
  t.after(async () => {
    registry.stopMonitoring();
    await (recovered || registry).stopAll();
    fs.rmSync(root, { recursive: true, force: true });
  });
  await registry.recover();
  const child = registry.trackChild(spawn(path.join(backendRoot, "sh"),
    ["-c", '"$1" 60 & wait', "readflow-fixture", path.join(backendRoot, "sleep")], { stdio: "ignore" }));
  await once(child, "spawn");
  let records = [];
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    records = registry.snapshot();
    if (records.length === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(records.length, 2);
  const sleeper = records.find((record) => record.pid !== child.pid);
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  assert.ok(readLinuxProcess(sleeper.pid), "fixture child survives its parent");
  recovered = createBackendProcessRegistry(settings);
  await recovered.recover();
  assert.equal(readLinuxProcess(sleeper.pid), null);
  assert.deepEqual(JSON.parse(fs.readFileSync(recovered.filename)).processes, []);
});
