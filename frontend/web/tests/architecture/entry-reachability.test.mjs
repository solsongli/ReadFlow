import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

test("only workbench HTML shell are shipped", () => {
  assert.deepEqual(readdirSync(".").filter((name) => name.endsWith(".html")).sort(), ["workbench.html"]);
});

test("production source, type imports and CSS remain reachable from the workbench entry", () => {
  const output = execFileSync(process.execPath, ["scripts/audit-entry-reachability.mjs"], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.deepEqual(report.unreachable, []);
  assert.ok(report.runtime > 250);
});
