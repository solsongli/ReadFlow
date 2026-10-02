import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { PRODUCT_NAME, configureDesktopIdentity, resolveBrandIcon } = require("./brand.js");

function observeMkdir(t) {
  const calls = [];
  const mkdir = fs.mkdirSync;
  t.mock.method(fs, "mkdirSync", (directory, options) => {
    calls.push([directory, options.recursive, options.mode]);
    return mkdir(directory, options);
  });
  return calls;
}

test("brand comes from package.json and is not hardcoded in the module", () => {
  assert.equal(PRODUCT_NAME, "ReadFlow");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(new URL("./brand.js", import.meta.url), "utf8"), {
    module,
    require: (name) => name === "../../package.json" ? { productName: "Future Name" } : require(name),
  });
  assert.equal(module.exports.PRODUCT_NAME, "Future Name");
});

test("installed identity creates its isolated storage before setting Electron paths", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const userData = path.join(root, "ReadFlow");
  const calls = [];
  const mkdirCalls = observeMkdir(t);
  const app = {
    commandLine: { hasSwitch(name) { assert.equal(name, "user-data-dir"); return false; } },
    setName: (name) => calls.push(["name", name]),
    getPath(name) {
      if (name === "userData") {
        assert.deepEqual(calls, [], "capture userData before setName");
        return path.join(root, "unused-default-profile");
      }
      assert.equal(name, "appData");
      return root;
    },
    setPath: (name, value) => {
      assert.ok(fs.statSync(value).isDirectory(), "Electron requires the directory before setPath");
      calls.push([name, value]);
    },
  };
  assert.equal(configureDesktopIdentity(app), userData);
  assert.deepEqual(calls, [
    ["name", "ReadFlow"], ["userData", userData], ["sessionData", userData],
  ]);
  assert.deepEqual(fs.readdirSync(root), ["ReadFlow"]);
  assert.deepEqual(fs.readdirSync(userData), []);
  assert.deepEqual(mkdirCalls, [[userData, true, 0o700]]);
});

for (const isPackaged of [false, true]) {
  test(`--user-data-dir preserves both Electron paths and creates only the selected directory (packaged=${isPackaged})`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-cli-identity-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const userData = path.join(root, "selected-profile", "chromium");
    const calls = [];
    const mkdirCalls = observeMkdir(t);
    const app = {
      isPackaged,
      commandLine: { hasSwitch(name) { assert.equal(name, "user-data-dir"); return true; } },
      getPath(name) {
        assert.equal(name, "userData", "an explicit profile must never consult appData");
        calls.push(["getPath", name]);
        return userData;
      },
      setName(name) { calls.push(["setName", name]); },
      setPath() { assert.fail("neither userData nor sessionData may be overridden"); },
    };
    assert.equal(configureDesktopIdentity(app), userData);
    assert.deepEqual(calls, [["getPath", "userData"], ["setName", "ReadFlow"], ["getPath", "userData"]]);
    assert.deepEqual(mkdirCalls, [[userData, true, 0o700]]);
    assert.deepEqual(fs.readdirSync(root), ["selected-profile"]);
    assert.deepEqual(fs.readdirSync(userData), []);
  });
}

test("unexpected setName path drift fails before creating or selecting another profile", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-preview-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mkdirCalls = observeMkdir(t);
  let userData = path.join(root, "selected-profile");
  assert.throws(() => configureDesktopIdentity({
    commandLine: { hasSwitch: () => true },
    getPath: () => userData,
    setName() { userData = path.join(root, "unexpected-profile"); },
    setPath() { assert.fail("must not override an explicit profile"); },
  }), /changed --user-data-dir after setName/);
  assert.deepEqual(mkdirCalls, []);
  assert.deepEqual(fs.readdirSync(root), []);
});

test("packaged tray uses the small icon; preview can use the copied asset", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-brand-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(resolveBrandIcon(root, 16), path.join(root, "assets/readflow.png"));
  const small = path.join(root, "build/readflow/16x16.png");
  fs.mkdirSync(path.dirname(small), { recursive: true });
  fs.writeFileSync(small, "synthetic icon");
  assert.equal(resolveBrandIcon(root, 16), small);
});
