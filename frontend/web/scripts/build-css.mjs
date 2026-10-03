import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRIES = [
  { in: "src/styles/entries/workbench.css", out: "dist/css/workbench.css" },
];

mkdirSync(join(ROOT, "dist/css"), { recursive: true });

const minify = !process.argv.includes("--no-minify");
const watch = process.argv.includes("--watch");


function runOne(entry, { watchMode = false } = {}) {
  const tailwindBin = join(ROOT, "node_modules/.bin/tailwindcss");
  const useDirect = existsSync(tailwindBin);
  const baseArgs = ["-i", join(ROOT, entry.in), "-o", join(ROOT, entry.out)];
  if (minify && !watchMode) baseArgs.push("--minify");
  if (watchMode) baseArgs.push("--watch");
  const args = useDirect ? baseArgs : ["tailwindcss", ...baseArgs];
  const cmd = useDirect ? tailwindBin : "npx";
  console.log(`[build-css] ${entry.in} → ${entry.out}${useDirect ? " (direct)" : ""}`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }
}

if (watch) {
  // 并行 watch 三个入口
  const tailwindBin = join(ROOT, "node_modules/.bin/tailwindcss");
  const useDirect = existsSync(tailwindBin);
  const kids = ENTRIES.map((entry) => {
    const baseArgs = ["-i", join(ROOT, entry.in), "-o", join(ROOT, entry.out), "--watch"];
    const args = useDirect ? baseArgs : ["tailwindcss", ...baseArgs];
    const cmd = useDirect ? tailwindBin : "npx";
    console.log(`[build-css:watch] ${entry.in} → ${entry.out}${useDirect ? " (direct)" : ""}`);
    return spawnSync(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  });
  process.exit(kids.some((k) => k.status !== 0) ? 1 : 0);
}

for (const entry of ENTRIES) {
  runOne(entry);
}




console.log("[build-css] done");
