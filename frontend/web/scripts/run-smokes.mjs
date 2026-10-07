import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(web, "../..");

function files(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(folder, entry.name);
    return entry.isDirectory() ? files(target) : entry.name.endsWith("-smoke.mjs") ? [target] : [];
  });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, UV_THREADPOOL_SIZE: "2" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

const python = path.join(
  repo,
  "frontend/desktop/dist-readflow/linux-unpacked/resources/backend/python/bin/python3",
);
if (!existsSync(python)) {
  throw new Error("Offline smoke Python runtime is missing; build the unpacked desktop runtime first.");
}
const fixtureArgs = [
  "-I",
  "-B",
  "ops/development/reader_inline_fixtures.py",
  "--output",
  "/tmp/readflow-x6",
];
const paperData = process.env.READFLOW_SMOKE_CORPUS_DIR || path.resolve(repo, "../readflow-maint/corpus");
if (existsSync(paperData)) {
  fixtureArgs.push("--paper-data-root", paperData);
  process.env.READFLOW_SMOKE_CORPUS_DIR = paperData;
}
run(python, fixtureArgs, repo);
await new Promise((resolve) => setTimeout(resolve, 1500));

const smokeFiles = files(path.join(web, "tests"))
  .map((file) => path.relative(web, file))
  .sort((left, right) => {
    const priority = (file) =>
      file.endsWith("paper-reader/alignment-smoke.mjs")
        ? 2
        : file.endsWith("paper-reader/x16-smoke.mjs")
          ? 3
        : file.endsWith("paper-reader/x16b-smoke.mjs")
          ? 4
        : file.endsWith("paper-blocks/inline-corpus-smoke.mjs")
          ? 5
          : 1;
    return priority(left) - priority(right) || left.localeCompare(right);
  });
console.log(`Running ${smokeFiles.length} offline smoke scripts serially.`);
for (const [index, file] of smokeFiles.entries()) {
  console.log(`[${index + 1}/${smokeFiles.length}] ${file}`);
  run(process.execPath, ["--import", "./tests/helpers/register-jsx.mjs", file], web);
  await new Promise((resolve) => setTimeout(resolve, 350));
}
console.log(`PASS ${smokeFiles.length}/${smokeFiles.length} offline smoke scripts.`);
