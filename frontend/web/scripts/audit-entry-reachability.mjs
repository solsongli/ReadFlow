// Read-only production reachability: esbuild runtime edges + TS type and CSS imports.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const roots = ["frontend/web/src/app/workbench/entry.tsx"];
const packages = new Map();
for (const name of fs.readdirSync(path.join(repo, "frontend/packages"))) {
  const dir = `frontend/packages/${name}`;
  const file = path.join(repo, dir, "package.json");
  if (!fs.existsSync(file)) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  packages.set(pkg.name, { dir, pkg });
}
function sourceFile(base) {
  return [base, base.replace(/\.jsx?$/, ".ts"), base.replace(/\.jsx?$/, ".tsx"),
    base.replace(/\.ts$/, ".tsx"), `${base}.ts`, `${base}/index.ts`]
    .find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
}
function resolve(specifier, importer) {
  if (specifier.startsWith(".")) return sourceFile(path.resolve(path.dirname(importer), specifier));
  if (specifier.startsWith("@/")) return sourceFile(path.join(repo, "frontend/web/src", specifier.slice(2)));
  const parts = specifier.split("/");
  const entry = packages.get(parts.slice(0, 2).join("/"));
  const sub = parts.length > 2 ? `./${parts.slice(2).join("/")}` : ".";
  const item = entry?.pkg.exports?.[sub];
  const target = typeof item === "string" ? item : item?.types || item?.import;
  if (!target) return undefined;
  return sourceFile(path.join(repo, entry.dir, target.replace(/^\.\/dist\//, "src/").replace(/\.d\.ts$/, ".ts")));
}
const result = await build({
  absWorkingDir: repo, entryPoints: roots, bundle: true, write: false, metafile: true,
  outdir: "/tmp/readflow-entry-audit", splitting: true, format: "esm", platform: "browser", jsx: "automatic",
  alias: { "@": path.join(repo, "frontend/web/src") }, nodePaths: [path.join(repo, "frontend/web/node_modules")],
  external: ["@antv/infographic", "@terrastruct/d2", "mermaid", "stream-diffs"],
  loader: { ".html": "text" }, define: { PACKAGE_VERSION: '"3.2.1"' }, logLevel: "silent",
  plugins: [{ name: "workspace-source", setup(api) {
    api.onResolve({ filter: /^@retainpdf\// }, (args) => {
      const target = resolve(args.path, args.importer);
      return target ? { path: target } : undefined;
    });
  } }],
});
const runtime = Object.keys(result.metafile.inputs).filter((p) => p.startsWith("frontend/") && !p.includes("node_modules"));
const visited = new Set();
const queue = [...roots, "frontend/web/src/styles/entries/workbench.css"]
  .map((p) => path.join(repo, p));
while (queue.length) {
  const file = queue.pop();
  if (visited.has(file)) continue;
  visited.add(file);
  const source = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const refs = file.endsWith(".css") ? [...source.matchAll(/@import\s+["']([^"']+)["']/g)]
    : [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)];
  for (const [, specifier] of refs) {
    const target = resolve(specifier, file);
    if (target) queue.push(target);
  }
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory()
    ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
const sourceRoots = ["frontend/web/src", ...[...packages.values()].map(({ dir }) => `${dir}/src`)];
const candidates = sourceRoots.flatMap((p) => walk(path.join(repo, p))).filter((p) => /\.(?:tsx?|jsx?|css|html)$/.test(p));
const unreachable = candidates.filter((p) => !visited.has(p)).map((p) => path.relative(repo, p));
const report = { roots, runtime, reachable: [...visited].map((p) => path.relative(repo, p)).sort(), unreachable };
const output = process.argv[2];
if (output) {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "metafile.json"), JSON.stringify(result.metafile, null, 2));
  fs.writeFileSync(path.join(output, "reachability.json"), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ runtime: runtime.length, reachable: visited.size, unreachable }, null, 2));
if (unreachable.length) process.exitCode = 1;
