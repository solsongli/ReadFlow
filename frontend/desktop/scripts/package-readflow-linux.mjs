import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { stageDocumentModels } from "./stage-document-models.mjs";

const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "../..");
export const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

export function normalizeDebPermissions(root) {
  const counts = { directories: 0, files: 0, executables: 0, symlinks: 0 };
  function visit(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) { counts.symlinks += 1; return; }
    if (stat.isDirectory()) {
      fs.chmodSync(file, 0o755); // Includes mkdtemp's initially private staging root.
      counts.directories += 1;
      for (const entry of fs.readdirSync(file)) visit(path.join(file, entry));
    } else if (stat.isFile()) {
      const executable = Boolean(stat.mode & 0o111) || /\.so(?:\.|$)/.test(path.basename(file));
      const mode = executable ? 0o755 : 0o644;
      fs.chmodSync(file, mode); // Strip umask artifacts and all special permission bits.
      if ((fs.statSync(file).mode & 0o7777) !== mode) throw new Error(`Invalid Debian file permissions: ${file}`);
      counts[executable ? "executables" : "files"] += 1;
    } else {
      throw new Error(`Unsupported Debian filesystem entry: ${file}`);
    }
  }
  visit(root);
  return counts;
}

export function buildCopyright(mitLicense) {
  return [
    "ReadFlow",
    "ReadFlow is a desktop research library with bilingual reading and PDF translation, derived from RetainPDF.",
    "ReadFlow 基于 RetainPDF 开发，提供本地文献管理、双语阅读和 PDF 翻译。",
    "Project: https://github.com/Lsy-aia/ReadFlow",
    "",
    "RetainPDF — upstream MIT license (verbatim repository LICENSE)",
    "",
    mitLicense,
    "Inter font",
    "Inter is distributed under the SIL Open Font License, Version 1.1 (OFL-1.1).",
    "Inter 字体按 SIL Open Font License 1.1 分发；完整许可及原始版权声明见：",
    "  /usr/share/doc/readflow/Inter-OFL.txt",
    "Bundled fonts and original license: /opt/ReadFlow/resources/app.asar",
    "  app/frontend/src/assets/fonts/inter/ (LICENSE.txt)",
    "",
    "Electron and Chromium license files remain in /opt/ReadFlow.",
    "CPU document models and inference component notices: /usr/share/doc/readflow/ReadFlow-components.md",
    "",
  ].join("\n");
}

export function findCachedElectron(roots, version) {
  const filename = `electron-v${version}-linux-x64.zip`;
  for (const root of roots.filter(Boolean)) {
    if (!fs.existsSync(root)) continue;
    if (fs.statSync(root).isFile()) {
      if (path.basename(root) === filename) return path.resolve(root);
      continue;
    }
    const direct = path.join(root, filename);
    if (fs.existsSync(direct)) return path.resolve(direct);
    // @electron/get stores archives one level below the cache, by URL hash.
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(root, entry.name, filename);
      if (fs.existsSync(candidate)) return path.resolve(candidate);
    }
  }
  throw new Error(`Offline Electron archive not found: ${filename}. Set ELECTRON_CACHE to an existing cache; no download will be attempted.`);
}

export function debMetadata(pkg, installedSize) {
  const { productName, version } = pkg;
  if (productName !== "ReadFlow" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("ReadFlow packaging requires productName=ReadFlow and a numeric x.y.z version");
  }
  const executable = "readflow";
  const installRoot = `/opt/${productName}`;
  const dependencies = [
    "libc6 (>= 2.35)", "libgcc-s1", "libstdc++6", "ca-certificates", "fontconfig",
    "libgtk-3-0 | libgtk-3-0t64", "libglib2.0-0 | libglib2.0-0t64",
    "libnss3 (>= 3.26)", "libnspr4", "libatk1.0-0 | libatk1.0-0t64",
    "libatk-bridge2.0-0 | libatk-bridge2.0-0t64", "libatspi2.0-0 | libatspi2.0-0t64",
    "libdrm2", "libgbm1", "libdbus-1-3", "libcups2 | libcups2t64",
    "libx11-6", "libxcb1", "libxcomposite1", "libxdamage1", "libxext6",
    "libxfixes3", "libxrandr2", "libxkbcommon0", "libasound2 | libasound2t64",
    "libxss1", "libxtst6", "libnotify4", "libuuid1", "libsecret-1-0", "xdg-utils",
  ];
  return {
    control: [
      `Package: ${executable}`, `Version: ${version}`, "Section: education", "Priority: optional",
      "Architecture: amd64", `Maintainer: ${pkg.build.linux.maintainer}`,
      `Installed-Size: ${installedSize}`, `Depends: ${dependencies.join(", ")}`,
      `Homepage: ${pkg.homepage}`,
      `Description: ${productName} research library, bilingual reading and PDF translation.`,
      " ReadFlow 提供本地文献库、双语阅读与块级翻译；内置 CPU 版面和 OCR，翻译服务由用户配置并主动调用。",
      "",
    ].join("\n"),
    desktop: [
      "[Desktop Entry]", "Type=Application", `Name=${productName}`,
      "Comment=Research library, bilingual reading and PDF translation",
      "Comment[zh_CN]=文献管理、双语阅读与 PDF 翻译",
      `Exec=${installRoot}/${executable} %U`, `TryExec=${installRoot}/${executable}`,
      `Icon=${executable}`, "Terminal=false", "Categories=Office;Education;Science;",
      `StartupWMClass=${productName}`, "StartupNotify=true", "",
    ].join("\n"),
    postinst: [
      "#!/bin/sh", "set -eu", 'if [ "$1" = configure ]; then',
      "  # Electron's SUID helper must be owned by root, never the build user.",
      `  chown root:root '${installRoot}/chrome-sandbox'`,
      `  chmod 4755 '${installRoot}/chrome-sandbox'`,
      "  if command -v update-desktop-database >/dev/null 2>&1; then",
      "    update-desktop-database /usr/share/applications || true", "  fi",
      "  if command -v gtk-update-icon-cache >/dev/null 2>&1; then",
      "    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true", "  fi",
      "fi", "",
    ].join("\n"),
    postrm: [
      "#!/bin/sh", "set -eu", 'case "$1" in remove|purge)',
      "  if command -v update-desktop-database >/dev/null 2>&1; then",
      "    update-desktop-database /usr/share/applications || true", "  fi",
      "  if command -v gtk-update-icon-cache >/dev/null 2>&1; then",
      "    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true", "  fi",
      "esac", "",
    ].join("\n"),
  };
}

function run(command, args, { capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot, env, encoding: "utf8", stdio: capture ? "pipe" : "inherit",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(command)} failed (${result.status}): ${result.error?.message || result.stderr || "see output above"}`);
  }
  return result.stdout?.trim() || "";
}

function requiredFile(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Required file missing: ${file}`);
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function packageReadFlow(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== "--skip-web-build")) {
    throw new Error("Usage: package-readflow-linux.mjs [--skip-web-build]");
  }
  if (process.platform !== "linux" || process.arch !== "x64") throw new Error("This package requires a Linux x64 build host");
  const pkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8"));
  debMetadata(pkg, 0); // Validate before building or replacing generated files.
  const output = path.join(desktopRoot, "dist-readflow");
  const unpacked = path.join(output, "linux-unpacked");
  const icons = path.join(desktopRoot, "build/readflow");
  const builder = path.join(repoRoot, "node_modules/.bin/electron-builder");
  requiredFile(builder);
  for (const tool of ["fakeroot", "dpkg-deb", "readelf", "patchelf", "ldd"]) run(tool, ["--version"], { capture: true });
  for (const size of ICON_SIZES) requiredFile(path.join(icons, `${size}x${size}.png`));
  // Read the shared cache only. Explicit electronDist prevents network fallback.
  const electronArchive = findCachedElectron([
    process.env.ELECTRON_CACHE,
    path.join(os.homedir(), ".cache/electron"),
    path.join(output, ".cache/electron"),
  ], pkg.build.electronVersion);
  const env = {
    ...process.env,
    ELECTRON_CACHE: path.join(output, ".cache/electron"),
    ELECTRON_BUILDER_CACHE: path.join(output, ".cache/electron-builder"),
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
    RETAIN_PDF_DESKTOP_PLATFORM: "linux",
    RETAIN_PDF_VERSION: pkg.version,
  };
  for (const cache of [env.ELECTRON_CACHE, env.ELECTRON_BUILDER_CACHE]) fs.mkdirSync(cache, { recursive: true });

  console.log(`[1/6] Web build: ${args.includes("--skip-web-build") ? "skipped; using existing assets" : "running"}`);
  if (!args.includes("--skip-web-build")) run("npm", ["--prefix", "../web", "run", "build"], { env });
  console.log("[2/6] Assemble app/ with prepare-app.mjs (reuse existing retainpdf2doc dist; no Rust rebuild)");
  run(process.execPath, ["scripts/prepare-app.mjs"], { env });
  stageDocumentModels(repoRoot, path.join(desktopRoot, "app/backend"));
  for (const relative of [
    "backend/research-library/library_mvp/api.py",
    "backend/research-library/native_library_service.py",
    "backend/retainpdf2doc/dist/cli.mjs",
    "backend/bin/rust_api", "backend/bin/retain-jobsd", "backend/bin/retainpdf-agent",
    "frontend/workbench.html", "frontend/dist/workbench.bundle.js", "frontend/dist/css/workbench.css",
  ]) requiredFile(path.join(desktopRoot, "app", relative));

  console.log("[3/6] electron-builder --linux dir (offline cached Electron)");
  run(builder, ["--linux", "dir", "--x64", "--publish", "never",
    `--config.directories.output=${output}`, `--config.electronDist=${electronArchive}`,
  ], { env });
  fs.rmSync(path.join(unpacked, "resources/default_app.asar"), { force: true });
  const asar = require("@electron/asar");
  const asarFile = path.join(unpacked, "resources/app.asar");
  const packaged = JSON.parse(asar.extractFile(asarFile, "package.json").toString());
  if (packaged.productName !== pkg.productName || packaged.version !== pkg.version) throw new Error("app.asar brand/version mismatch");
  for (const page of ["workbench.html"]) asar.extractFile(asarFile, `app/frontend/${page}`);
  const htmlEntries = asar.listPackage(asarFile).filter((entry) => /^\/app\/frontend\/[^/]+\.html$/.test(entry));
  if (htmlEntries.some((entry) => !["workbench.html"].includes(path.basename(entry)))) {
    throw new Error("Unexpected frontend HTML entry in app.asar");
  }
  if (asar.listPackage(asarFile).some((entry) => entry.endsWith("/runtime-config.local.js"))) {
    throw new Error("Local frontend overrides must not be packaged");
  }
  console.log(`app.asar: ${packaged.productName} ${packaged.version}; workbench entry present`);

  console.log("[4/6] Validate unpacked Linux runtime (no application launch)");
  const runtimeCheck = run(process.execPath, ["scripts/linux-runtime.mjs", "--check", unpacked], { capture: true, env });
  console.log(runtimeCheck);

  console.log("[5/6] Assemble /opt/ReadFlow, desktop entry, hicolor icons and Debian metadata");
  const stage = fs.mkdtempSync(path.join(output, ".deb-stage-"));
  const debPath = path.join(output, `readflow_${pkg.version}_amd64.deb`);
  try {
    const install = path.join(stage, "opt/ReadFlow");
    fs.mkdirSync(path.dirname(install), { recursive: true });
    fs.cpSync(unpacked, install, { recursive: true, verbatimSymlinks: true });
    fs.mkdirSync(path.join(stage, "usr/bin"), { recursive: true });
    fs.symlinkSync("/opt/ReadFlow/readflow", path.join(stage, "usr/bin/readflow"));
    for (const size of ICON_SIZES) {
      const target = path.join(stage, `usr/share/icons/hicolor/${size}x${size}/apps`);
      fs.mkdirSync(target, { recursive: true });
      fs.copyFileSync(path.join(icons, `${size}x${size}.png`), path.join(target, "readflow.png"));
    }
    const scalable = path.join(stage, "usr/share/icons/hicolor/scalable/apps");
    fs.mkdirSync(scalable, { recursive: true });
    fs.copyFileSync(path.join(icons, "readflow.svg"), path.join(scalable, "readflow.svg"));
    const documentation = path.join(stage, "usr/share/doc/readflow");
    fs.mkdirSync(documentation, { recursive: true });
    fs.writeFileSync(path.join(documentation, "copyright"), buildCopyright(fs.readFileSync(path.join(repoRoot, "LICENSE"), "utf8")));
    fs.copyFileSync(path.join(repoRoot, "LICENSE.third-party.md"), path.join(documentation, "ReadFlow-components.md"));
    fs.copyFileSync(path.join(desktopRoot, "app/frontend/src/assets/fonts/inter/LICENSE.txt"),
      path.join(documentation, "Inter-OFL.txt"));
    const installedSize = Number(run("du", ["-sk", stage], { capture: true }).split(/\s/)[0]);
    const metadata = debMetadata(pkg, installedSize);
    fs.mkdirSync(path.join(stage, "DEBIAN"));
    fs.mkdirSync(path.join(stage, "usr/share/applications"), { recursive: true });
    fs.writeFileSync(path.join(stage, "DEBIAN/control"), metadata.control);
    fs.writeFileSync(path.join(stage, "usr/share/applications/readflow.desktop"), metadata.desktop);
    for (const script of ["postinst", "postrm"]) {
      const scriptPath = path.join(stage, "DEBIAN", script);
      fs.writeFileSync(scriptPath, metadata[script], { mode: 0o755 });
      run("sh", ["-n", scriptPath]);
    }
    const permissions = normalizeDebPermissions(stage);
    console.log(`Debian permissions normalized and checked: ${JSON.stringify(permissions)}`);
    console.log("[6/6] fakeroot dpkg-deb --build (root ownership, xz compression)");
    run("fakeroot", ["dpkg-deb", "--root-owner-group", "-Zxz", "-z6", "--build", stage, debPath], {
      env: { ...env, DPKG_DEB_THREADS_MAX: "2" },
    });
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  const report = {
    productName: pkg.productName, version: pkg.version, webBuildSkipped: args.includes("--skip-web-build"),
    debPath, bytes: fs.statSync(debPath).size, sha256: await sha256(debPath),
    linuxRuntime: JSON.parse(runtimeCheck),
    frontendSnapshot: Object.fromEntries(await Promise.all([
      "workbench.html", "dist/workbench.bundle.js", "dist/css/workbench.css",
    ].map(async (entry) => [entry, await sha256(path.join(desktopRoot, "app/frontend", entry))]))),
  };
  fs.writeFileSync(path.join(output, "package-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`DEB: ${debPath}\nSize: ${report.bytes} bytes (${(report.bytes / 1024 / 1024).toFixed(2)} MiB)\nSHA256: ${report.sha256}`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packageReadFlow().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
