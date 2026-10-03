import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { resolveStartPage, requiresIsolatedBackend } = require("./desktop-startup.js");

function frontend(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-start-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ["workbench.html"]) fs.writeFileSync(path.join(root, name), "fixture");
  return root;
}

test("installed and preview starts always use workbench", (t) => {
  const frontendRoot = frontend(t);
  assert.equal(resolveStartPage({ frontendRoot, isPackaged: true }), "workbench.html");
  assert.equal(resolveStartPage({ frontendRoot, isPackaged: true, startPage: "workbench.html" }), "workbench.html");
  assert.equal(resolveStartPage({ frontendRoot, isPackaged: false, startPage: "workbench.html" }), "workbench.html");
  assert.equal(resolveStartPage({ frontendRoot, isPackaged: false }), "workbench.html");
});

test("unknown/traversal entry points use the default and missing workbench falls back", (t) => {
  const frontendRoot = frontend(t);
  for (const startPage of ["../workbench.html", "https://example.org", "", "reader.html"]) {
    assert.equal(resolveStartPage({ frontendRoot, isPackaged: true, startPage }), "workbench.html");
  }
  fs.unlinkSync(path.join(frontendRoot, "workbench.html"));
  assert.equal(resolveStartPage({ frontendRoot, isPackaged: true }), "workbench.html");
  assert.equal(resolveStartPage({ frontendRoot, startPage: "workbench.html" }), "workbench.html");
});

test("installed and preview instances cannot reclaim or reuse another app's backend", () => {
  assert.equal(requiresIsolatedBackend({ isPackaged: true }), true);
  assert.equal(requiresIsolatedBackend({ isPackaged: true, offlinePreview: true }), true);
  assert.equal(requiresIsolatedBackend({ offlinePreview: true }), true);
  assert.equal(requiresIsolatedBackend({}), false);
});
