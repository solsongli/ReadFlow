import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildCopyright, debMetadata, findCachedElectron, normalizeDebPermissions, packageReadFlow } from "./package-readflow-linux.mjs";

test("offline cache lookup selects the exact Electron version from a hashed cache", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-electron-cache-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "hash"));
  fs.writeFileSync(path.join(root, "electron-v43.0.0-linux-x64.zip"), "old fixture");
  const archive = path.join(root, "hash/electron-v44.4.3-linux-x64.zip");
  fs.writeFileSync(archive, "fixture");
  assert.equal(findCachedElectron([path.join(root, "missing"), root], "44.4.3"), archive);
  assert.equal(findCachedElectron([archive], "44.4.3"), archive);
  assert.throws(() => findCachedElectron([root], "45.0.0"), /no download will be attempted/);
});

test("misspelled skip-build flags stop before any build or filesystem mutation", async () => {
  await assert.rejects(packageReadFlow(["--skip-web"]), /Usage:/);
});

test("Debian modes normalize private roots, umask artifacts, shared libraries and sandbox without following links", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readflow-deb-permissions-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stage = path.join(root, "stage");
  fs.mkdirSync(stage, { mode: 0o700 });
  fs.mkdirSync(path.join(stage, "dir"));
  fs.chmodSync(path.join(stage, "dir"), 0o775);
  for (const [name, mode] of [["data", 0o664], ["executable", 0o777], ["python.so.1", 0o640], ["chrome-sandbox", 0o4755]]) {
    fs.writeFileSync(path.join(stage, name), "fixture");
    fs.chmodSync(path.join(stage, name), mode);
  }
  const outside = path.join(root, "outside");
  fs.writeFileSync(outside, "must stay private", { mode: 0o600 });
  fs.symlinkSync(outside, path.join(stage, "link"));
  const result = normalizeDebPermissions(stage);
  const mode = (file) => fs.statSync(file).mode & 0o7777;
  assert.equal(mode(stage), 0o755);
  assert.equal(mode(path.join(stage, "dir")), 0o755);
  assert.equal(mode(path.join(stage, "data")), 0o644);
  for (const name of ["executable", "python.so.1", "chrome-sandbox"]) assert.equal(mode(path.join(stage, name)), 0o755);
  assert.equal(mode(outside), 0o600);
  assert.deepEqual(result, { directories: 2, files: 1, executables: 3, symlinks: 1 });
});

test("copyright embeds the complete upstream license and locates Inter's OFL", () => {
  const license = fs.readFileSync(new URL("../../../LICENSE", import.meta.url), "utf8");
  const copyright = buildCopyright(license);
  assert.ok(copyright.includes(license));
  assert.ok(copyright.indexOf("ReadFlow") < copyright.indexOf(license));
  assert.ok(copyright.indexOf("Inter font") > copyright.indexOf(license));
  assert.match(copyright, /\/usr\/share\/doc\/readflow\/Inter-OFL\.txt/);
});

test("control uses ReadFlow maintenance metadata while preserving the upstream code author", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const { control } = debMetadata(pkg, 100);
  assert.match(control, /Maintainer: Lsy-aia <ZahnenClineman53@outlook\.com>/);
  assert.match(control, /Homepage: https:\/\/github\.com\/Lsy-aia\/ReadFlow/);
  assert.equal(pkg.author.name, "wxyhgk");
});
