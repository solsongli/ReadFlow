import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isProtectedBuild } = require("./protection.js");

test("only a package.json marked readflowProtected disables developer tools", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-protect-"));
  assert.equal(isProtectedBuild(root), false);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "readflow" }));
  assert.equal(isProtectedBuild(root), false);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ readflowProtected: true }));
  assert.equal(isProtectedBuild(root), true);
  fs.writeFileSync(path.join(root, "package.json"), "{not json");
  assert.equal(isProtectedBuild(root), false);
  fs.rmSync(root, { recursive: true, force: true });
});
