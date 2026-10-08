// Obfuscate the shipped JavaScript of a protected release IN PLACE and mark package.json as protected.
//
//   node scripts/protect-js.mjs --obfuscator <dir of javascript-obfuscator> [--dry-run]
//
// Runs only on a disposable CI checkout (CI=true) because it rewrites tracked files; the obfuscator is
// installed into a temporary prefix by the workflow, so it is not a dependency of the repository.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = args.includes("--dry-run");
if (!dryRun && process.env.CI !== "true") {
  throw new Error("protect-js rewrites files in place; run it only on a disposable CI checkout (CI=true) or with --dry-run");
}

// Settings measured on the packaged reader (2 cores, OpenVLA): base64-encoded string tables made opening
// 1.8x slower (1.26 s -> 2.27 s); a plain rotated/shuffled table at 0.5 keeps open/jump/scroll unchanged.
// Mangled identifiers plus the string table keep logic and texts unreadable. The core logic is the
// Nuitka-compiled backend; the renderer is UI code.
const COMMON = {
  compact: true,
  identifierNamesGenerator: "mangled",
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: [],
  stringArrayThreshold: 0.5,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 0,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  splitStrings: false,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  sourceMap: false,
};

function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

export function protectedTargets(root = desktopRoot) {
  const browser = walk(path.join(root, "app/frontend/dist"), (f) => f.endsWith(".js"));
  const node = [path.join(root, "main.js"), path.join(root, "preload.js"),
    ...walk(path.join(root, "src/main"), (f) => f.endsWith(".js") && !f.endsWith(".test.js"))];
  return { browser, node: node.filter((f) => fs.existsSync(f)) };
}

function main() {
  const targets = protectedTargets();
  if (!targets.browser.length) throw new Error("No frontend bundle found; run the web build and prepare-app first");
  if (dryRun) {
    console.log(JSON.stringify({ browser: targets.browser.length, node: targets.node.length }));
    return;
  }
  const obfuscatorDir = option("--obfuscator");
  if (!obfuscatorDir) throw new Error("--obfuscator <path to javascript-obfuscator package> is required");
  const JavaScriptObfuscator = createRequire(path.join(obfuscatorDir, "package.json"))(obfuscatorDir);
  const report = [];
  for (const [target, files] of [["browser", targets.browser], ["node", targets.node]]) {
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      if (/sourceMappingURL=/.test(source)) throw new Error(`Source map reference left in ${file}`);
      const result = JavaScriptObfuscator.obfuscate(source, { ...COMMON, target });
      fs.writeFileSync(file, result.getObfuscatedCode());
      if (target === "node") {
        const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
        if (check.status !== 0) throw new Error(`Obfuscated ${file} no longer parses: ${check.stderr}`);
      }
      report.push({ file: path.relative(desktopRoot, file), target, before: source.length, after: fs.statSync(file).size });
    }
  }
  const pkgFile = path.join(desktopRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  pkg.readflowProtected = true;
  fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`PROTECT_JS ${JSON.stringify({ files: report.length, report })}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("protect-js.mjs")) main();
