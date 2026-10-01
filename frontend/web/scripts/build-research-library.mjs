import { build } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(frontend, "dist", "research-library");
const require = createRequire(path.join(frontend, "package.json"));
const reactPdfRequire = createRequire(require.resolve("react-pdf/package.json"));
const pdfjsPackage = reactPdfRequire.resolve("pdfjs-dist/package.json");
const pdfjsRoot = path.dirname(pdfjsPackage);
const pdfjsVersion = JSON.parse(await fs.readFile(pdfjsPackage, "utf8")).version;
await fs.mkdir(outdir, { recursive: true });
await build({
  entryPoints: [path.join(frontend, "src", "app", "research-library", "entry.tsx")],
  outfile: path.join(outdir, "app.js"),
  bundle: true, format: "esm", platform: "browser", target: ["es2022"], jsx: "automatic",
  minify: !process.argv.includes("--development"), sourcemap: process.argv.includes("--development"),
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  nodePaths: [path.join(frontend, "node_modules")],
  legalComments: "eof", logLevel: "info",
});
await fs.copyFile(path.join(pdfjsRoot, "build", "pdf.worker.min.mjs"), path.join(outdir, "pdf.worker.min.mjs"));
for (const asset of ["cmaps", "standard_fonts"]) {
  await fs.cp(path.join(pdfjsRoot, asset), path.join(outdir, asset), { recursive: true });
}
await fs.writeFile(path.join(outdir, "build-info.json"), JSON.stringify({ entry: "research-library.html", pdfjs: pdfjsVersion }, null, 2) + "\n");
console.log(`RetainPDF 文献库已构建；PDF.js ${pdfjsVersion}。仅写入 dist/research-library/，原入口产物保持不变。`);
