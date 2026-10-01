import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { checkLinuxCompatibility, relocateLinuxPython } from "./linux-runtime.mjs";

const hasTools = process.platform === "linux"
  && ["gcc", "readelf", "patchelf", "ldd"].every((command) => spawnSync(command, ["--version"]).status === 0);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function fixture(t, rpath = "builder") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "retainpdf-linux-test-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const builder = path.join(tmp, "hostedtoolcache", "lib");
  const root = path.join(tmp, "bundle", "python");
  fs.mkdirSync(builder, { recursive: true });
  fs.mkdirSync(path.join(root, "bin"), { recursive: true });
  fs.mkdirSync(path.join(root, "lib"), { recursive: true });
  const libName = "libpython3.11.so.1.0";
  const libSource = path.join(tmp, "lib.c");
  const exeSource = path.join(tmp, "main.c");
  fs.writeFileSync(libSource, "int Py_Main(void) { return 0; }\n");
  fs.writeFileSync(exeSource, "extern int Py_Main(void); int main(void) { return Py_Main(); }\n");
  run("gcc", ["-shared", "-fPIC", libSource, `-Wl,-soname,${libName}`, "-o", path.join(builder, libName)]);
  const executable = path.join(root, "bin", "python3");
  run("gcc", [exeSource, `-L${builder}`, `-l:${libName}`,
    ...(rpath ? [`-Wl,-rpath,${rpath === "builder" ? builder : rpath}`] : []), "-o", executable]);
  fs.copyFileSync(path.join(builder, libName), path.join(root, "lib", libName));
  return { tmp, root, builder, executable };
}

test("copied Python runs after relocation with the build machine directory removed", { skip: !hasTools }, (t) => {
  const { tmp, root, builder } = fixture(t);
  assert.throws(() => checkLinuxCompatibility(root), /non-relocatable RPATH\/RUNPATH/);
  relocateLinuxPython(root);
  fs.rmSync(builder, { recursive: true });
  const moved = path.join(tmp, "installed elsewhere", "python");
  fs.mkdirSync(path.dirname(moved), { recursive: true });
  fs.renameSync(root, moved);
  assert.ok(checkLinuxCompatibility(moved).elfFiles >= 2);
  const env = { ...process.env };
  delete env.LD_LIBRARY_PATH;
  assert.equal(spawnSync(path.join(moved, "bin", "python3"), [], { env }).status, 0);
});

test("repair preserves wheel sibling library search paths", { skip: !hasTools }, (t) => {
  const { root, executable } = fixture(t, "$ORIGIN/../Pillow.libs");
  relocateLinuxPython(root);
  assert.equal(run("patchelf", ["--print-rpath", executable]).trim(), "$ORIGIN/../Pillow.libs:$ORIGIN/../lib");
});

test("ABI gate rejects GLIBC 2.38 even on a builder that can load its other libraries", { skip: !hasTools }, (t) => {
  const { root, executable } = fixture(t);
  relocateLinuxPython(root);
  const elf = fs.readFileSync(executable);
  const offset = elf.indexOf(Buffer.from("GLIBC_2.34\0"));
  if (offset < 0) return t.skip("gcc does not emit a GLIBC_2.34 startup dependency on this host");
  Buffer.from("GLIBC_2.38\0").copy(elf, offset);
  fs.writeFileSync(executable, elf);
  assert.throws(() => checkLinuxCompatibility(root), /requires GLIBC_2\.38 \(maximum 2\.35\)/);
});

test("host LD_LIBRARY_PATH cannot hide a missing bundled library", { skip: !hasTools }, (t) => {
  const { root, builder } = fixture(t, "");
  const original = process.env.LD_LIBRARY_PATH;
  process.env.LD_LIBRARY_PATH = builder;
  t.after(() => {
    if (original === undefined) delete process.env.LD_LIBRARY_PATH;
    else process.env.LD_LIBRARY_PATH = original;
  });
  assert.throws(() => checkLinuxCompatibility(root), /unresolved native dependencies/);
});

test("ABI gate rejects symlinks to files outside the installed bundle", { skip: !hasTools }, (t) => {
  const { root } = fixture(t);
  fs.symlinkSync("../../../hostedtoolcache/lib/libpython3.11.so.1.0", path.join(root, "lib", "host.so"));
  assert.throws(() => checkLinuxCompatibility(root), /symlink escapes the bundle/);
});
