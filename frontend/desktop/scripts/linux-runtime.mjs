import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MAX_LINUX_GLIBC = "2.35";

function cleanEnv() {
  const env = { ...process.env, LC_ALL: "C" };
  // A build-machine loader path can make an otherwise broken bundle pass.
  for (const key of ["LD_LIBRARY_PATH", "LD_PRELOAD", "PYTHONHOME", "PYTHONPATH"]) {
    delete env[key];
  }
  return env;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: cleanEnv(), encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function elfFiles(root, bundleRoot = root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...elfFiles(file, bundleRoot));
    } else if (entry.isFile()) {
      const fd = fs.openSync(file, "r");
      const magic = Buffer.alloc(4);
      try {
        fs.readSync(fd, magic, 0, 4, 0);
      } finally {
        fs.closeSync(fd);
      }
      if (magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) files.push(file);
    } else if (entry.isSymbolicLink()) {
      const target = fs.realpathSync(file);
      const relative = path.relative(bundleRoot, target);
      if (path.isAbsolute(fs.readlinkSync(file))) {
        throw new Error(`Linux bundle contains an absolute symlink: ${file} -> ${target}`);
      }
      if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
        throw new Error(`Linux bundle symlink escapes the bundle: ${file} -> ${target}`);
      }
    }
  }
  return files;
}

function dynamicInfo(file) {
  const output = run("readelf", ["--wide", "--dynamic", file]);
  const paths = [...output.matchAll(/\((?:RUNPATH|RPATH)\).*?\[([^\]]*)\]/g)]
    .flatMap((match) => match[1].split(":"));
  const needed = [...output.matchAll(/\(NEEDED\).*?\[([^\]]+)\]/g)].map((match) => match[1]);
  return { paths, needed };
}

function originPath(file, directory) {
  const relative = path.relative(path.dirname(file), directory).split(path.sep).join("/");
  return relative ? `$ORIGIN/${relative}` : "$ORIGIN";
}

function isOriginPath(value) {
  return /^\$(?:ORIGIN|\{ORIGIN\})(?:\/|$)/.test(value);
}

function isWithinBundle(file, value, root) {
  const resolved = path.resolve(path.dirname(file), value.replace(/^\$(?:ORIGIN|\{ORIGIN\})\/?/, ""));
  const relative = path.relative(root, resolved);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

export function relocateLinuxPython(pythonRoot) {
  const root = path.resolve(pythonRoot);
  let patched = 0;
  for (const file of elfFiles(root)) {
    const info = dynamicInfo(file);
    const isLauncher = /^python(?:3(?:\.\d+)?)?$/.test(path.basename(file));
    const isLibPython = /^libpython.*\.so(?:\..*)?$/.test(path.basename(file));
    const isWheelLibrary = path.dirname(file).split(path.sep).some((part) => part.endsWith(".libs"));
    if (!isLauncher && !isLibPython && !isWheelLibrary && !info.paths.some((item) => path.isAbsolute(item))) continue;
    const relativePaths = info.paths.filter(isOriginPath);
    // Preserve auditwheel's sibling *.libs paths, but remove builder prefixes.
    const paths = [...new Set([
      ...relativePaths,
      ...(isWheelLibrary ? ["$ORIGIN"] : []),
      originPath(file, path.join(root, "lib")),
    ])];
    run("patchelf", ["--set-rpath", paths.join(":"), file]);
    patched += 1;
  }
  return { patched };
}

function versionGreaterThan(version, maximum) {
  const actual = version.split(".").map(Number);
  const limit = maximum.split(".").map(Number);
  for (let i = 0; i < Math.max(actual.length, limit.length); i += 1) {
    if ((actual[i] || 0) !== (limit[i] || 0)) return (actual[i] || 0) > (limit[i] || 0);
  }
  return false;
}

export function checkLinuxCompatibility(bundleRoot, { maxGlibc = MAX_LINUX_GLIBC } = {}) {
  const root = path.resolve(bundleRoot);
  const errors = [];
  const files = elfFiles(root);
  let highestGlibc = "0.0";
  for (const file of files) {
    const label = path.relative(root, file);
    const versions = run("readelf", ["--wide", "--version-info", file]);
    for (const match of versions.matchAll(/\bName: GLIBC_(\d+(?:\.\d+)+)\b/g)) {
      if (versionGreaterThan(match[1], highestGlibc)) highestGlibc = match[1];
      if (versionGreaterThan(match[1], maxGlibc)) errors.push(`${label} requires GLIBC_${match[1]} (maximum ${maxGlibc})`);
    }
    if (/\bName: GLIBC_PRIVATE\b/.test(versions)) errors.push(`${label} requires GLIBC_PRIVATE`);
    const info = dynamicInfo(file);
    for (const item of info.paths) {
      if (!isOriginPath(item)) {
        errors.push(`${label} has non-relocatable RPATH/RUNPATH: ${item || "<empty>"}`);
        continue;
      }
      if (!isWithinBundle(file, item, root)) errors.push(`${label} has RPATH/RUNPATH outside the bundle: ${item}`);
    }
    for (const item of info.needed) {
      if (item.includes("/") && (!isOriginPath(item) || !isWithinBundle(file, item, root))) {
        errors.push(`${label} has a host-specific NEEDED library: ${item}`);
      }
    }
    if (info.needed.length > 0) {
      const result = spawnSync("ldd", [file], { env: cleanEnv(), encoding: "utf8", timeout: 30_000 });
      const output = `${result.stdout || ""}\n${result.stderr || ""}`;
      if (result.error || result.status !== 0 || /not found/.test(output)) {
        errors.push(`${label} has unresolved native dependencies: ${result.error?.message || output.trim()}`);
      }
    }
  }
  if (files.length === 0) throw new Error(`No ELF files found in Linux bundle: ${root}`);
  if (errors.length > 0) {
    throw new Error(`Linux bundle is incompatible with Ubuntu 22.04 (GLIBC ${maxGlibc}):\n${[...new Set(errors)].join("\n")}\nRebuild all native components on Ubuntu 22.04 or an older compatible system.`);
  }
  return { elfFiles: files.length, highestGlibc, maxGlibc };
}

export function probeLinuxPython(pythonRoot, { dependencyImports = true } = {}) {
  const root = path.resolve(pythonRoot);
  const executable = path.join(root, "bin", "python3");
  const modules = ["_socket", "ssl", "ctypes", "sqlite3", "bz2", "lzma"];
  if (dependencyImports) modules.push("requests", "fitz", "pikepdf", "PIL", "urllib3", "fastapi", "uvicorn", "retainpdf_pipeline.entrypoints.console");
  return run(executable, ["-I", "-c", [
    "import importlib, sys",
    `for name in ${JSON.stringify(modules)}: importlib.import_module(name)`,
    "print('linux_python_import_check=ok')",
    "print('python=' + sys.version.split()[0])",
  ].join("\n")], { cwd: path.dirname(root) }).trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.length % 2 !== 0) throw new Error("Usage: linux-runtime.mjs [--repair-python ROOT] [--check ROOT] [--probe-python ROOT]");
    for (let i = 0; i < args.length; i += 2) {
      if (args[i] === "--repair-python") console.log(JSON.stringify(relocateLinuxPython(args[i + 1])));
      else if (args[i] === "--check") console.log(JSON.stringify(checkLinuxCompatibility(args[i + 1])));
      else if (args[i] === "--probe-python") console.log(probeLinuxPython(args[i + 1]));
      else throw new Error(`Unknown option: ${args[i]}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
