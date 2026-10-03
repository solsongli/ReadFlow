import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

test("only workbench and reader HTML shells are shipped", () => {
  assert.deepEqual(readdirSync(".").filter((name) => name.endsWith(".html")).sort(), ["reader.html", "workbench.html"]);
});

test("production source, type imports and CSS remain reachable from the two entries", () => {
  const output = execFileSync(process.execPath, ["scripts/audit-entry-reachability.mjs"], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.deepEqual(report.unreachable, []);
  assert.ok(report.runtime > 400);
});
