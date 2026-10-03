import { build, context } from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const outdir = path.join(frontendRoot, "dist");

// --watch: esbuild context 增量重建(开发态:sourcemap 开、minify 关)
const watchMode = process.argv.includes("--watch");

// 导入路径仍写 .js/.jsx（兼容存量 import），解析时映射到 .ts/.tsx。
// TypeScript bundler 约定：import "./foo.js" 可对应 foo.ts。
function jsToTsResolvePlugin() {
  const map = new Map([
    [".js", [".ts", ".tsx", ".js"]],
    [".jsx", [".tsx", ".jsx"]],
    [".mjs", [".mts", ".mjs"]],
  ]);
  return {
    name: "js-to-ts-resolve",
    setup(buildApi) {
      buildApi.onResolve({ filter: /\.(jsx?|mjs)$/ }, (args) => {
        if (args.namespace !== "file" && args.namespace !== "") return;
        if (args.path.startsWith("http") || args.path.startsWith("data:")) return;
        const candidates = map.get(path.extname(args.path));
        if (!candidates) return;

        let dir = args.resolveDir;
        if (args.importer) {
          dir = path.dirname(args.importer);
        }
        const absBase = path.isAbsolute(args.path)
          ? args.path
          : path.join(dir, args.path);
        // 依赖包交回 esbuild 原生解析。本插件只为"项目源码 import 写 .js、
        // 实际是 .ts"这一条兼容存在，node_modules 里没有这种情况。
        //
        // 必须跳过：onResolve 返回 { path } 会绕过 esbuild 对 package.json
        // 的读取，连带丢掉 sideEffects: false，于是该文件被当成有副作用、
        // 无法 tree-shake。lucide-react 内部全是 `./icons/xxx.mjs` 相对导入，
        // 正好落进本插件的 filter，结果 1787 个图标一个不漏地进了产物——
        // 实测同一句 `import { Save, Check } from "lucide-react"`，拦截时
        // 572.7 KB，跳过时 10.7 KB。
        if (absBase.includes("node_modules")) {
          return undefined;
        }
        const withoutExt = absBase.replace(/\.(jsx?|mjs)$/, "");
        for (const ext of candidates) {
          const candidate = `${withoutExt}${ext}`;
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return { path: candidate };
          }
        }
        return undefined;
      });
    },
  };
}

// 工作台与阅读器各自打包，避免跨页共享 chunk 引入无关代码。
const PAGE_BUNDLES = [
  //   workbench.html → src/app/workbench/entry.tsx → dist/workbench.bundle.js
  {
    name: "workbench",
    entry: path.join(frontendRoot, "src/app/workbench/entry.tsx"),
    out: "workbench.bundle",
  },
];

// Native reader and workspace share one bundle; dynamic chunks retain content hashes.
function bundleOptions({ entry, out }) {
  return {
    entryPoints: [{ in: entry, out }],
    outdir,
    splitting: true,
    chunkNames: `chunks/${out.replace(/\.bundle$/, "")}/[name]-[hash]`,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    jsx: "automatic",
    alias: {
      "@": path.join(frontendRoot, "src"),
    },
    // Workspace package peers resolve through the host's installed dependency tree.
    nodePaths: [path.join(frontendRoot, "node_modules")],
    // Reader 与其它 workspace 包一样只通过 package.json exports 消费；
    // 禁止在宿主构建里维护第二份 subpath→源码路径映射。
    plugins: [jsToTsResolvePlugin()],

    loader: {
      ".html": "text",
      ".ts": "ts",
      ".tsx": "tsx",
    },
    minify: !watchMode,
    sourcemap: watchMode ? "inline" : false,
    logLevel: "info",
    legalComments: "none",
  };
}

// 只清 JS 产物，保留 dist/css/（build:css 独立写入；整目录 rm 会把主页样式弄没）
// chunks/ 整个重建：chunk 名带内容哈希，不清会随构建次数堆积成旧版本垃圾。
fs.mkdirSync(outdir, { recursive: true });
for (const page of PAGE_BUNDLES) {
  try {
    fs.rmSync(path.join(outdir, `${page.out}.js`), { force: true });
  } catch {
    // ignore
  }
}
try {
  fs.rmSync(path.join(outdir, "chunks"), { recursive: true, force: true });
} catch {
  // ignore
}

if (watchMode) {
  const contexts = await Promise.all(
    PAGE_BUNDLES.map((page) => context(bundleOptions(page))),
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log(`[watch] 监听中:${PAGE_BUNDLES.map((p) => p.name).join(", ")}(Ctrl+C 退出)`);
} else {
  for (const page of PAGE_BUNDLES) {
    await build(bundleOptions(page));
  }
}
