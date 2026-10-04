// Optional complete Electron check. Never launches the installed application or uses the real profile.
import { mkdtempSync, mkdirSync, realpathSync, readFileSync, readlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const { _electron } = createRequire(new URL("../../web/package.json", import.meta.url))("playwright");
const { createBackendProcessRegistry, readLinuxProcess } = createRequire(import.meta.url)(
  "../src/main/backend-processes.js",
);
const headed = process.argv.includes("--headed");
const input = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const unpacked = realpathSync(path.resolve(input || "frontend/desktop/dist-readflow/linux-unpacked"));
if (unpacked === "/opt" || unpacked.startsWith("/opt/"))
  throw new Error("Installed applications are forbidden");
const root = mkdtempSync(path.join(tmpdir(), "readflow-electron-restart-"));
const profile = path.join(root, "profile/chromium");
mkdirSync(profile, { recursive: true });
const env = {
  PATH: "/usr/bin:/bin",
  LANG: "C.UTF-8",
  HOME: root,
  XDG_CONFIG_HOME: path.join(root, ".config"),
  RETAIN_PDF_OFFLINE_LIBRARY_PREVIEW: "1",
  RETAIN_PDF_RESEARCH_LIBRARY: "1",
  RETAIN_PDF_RESEARCH_CONNECTOR_PORT: "",
};
if (headed) {
  for (const name of ["DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "XAUTHORITY"]) {
    if (process.env[name]) env[name] = process.env[name];
  }
}
const seed = spawnSync(
  path.join(unpacked, "resources/backend/python/bin/python3"),
  [
    "-I",
    "-B",
    path.resolve("ops/development/check_packaged_restart.py"),
    unpacked,
    "--seed",
    path.join(profile, "data/research-library"),
  ],
  { env, encoding: "utf8", timeout: 30000 },
);
if (seed.status !== 0) throw new Error("Synthetic data initialization failed");
for (const role of ["API", "SIMPLE", "JOBS", "AI", "GATEWAY"]) {
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
  env[`RETAIN_PDF_PREVIEW_${role}_PORT`] = String(port);
}
let application;
let cleaning;
async function cleanup(force = false) {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    if (application && !force)
      await Promise.race([
        application.close().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
    // A stalled graphical environment may also stall app.quit(). Only this freshly-created profile is eligible.
    try {
      const lock = readlinkSync(path.join(profile, "SingletonLock"));
      const pid = Number(lock.match(/-(\d+)$/)?.[1]);
      const identity = Number.isSafeInteger(pid) && pid > 1 ? readLinuxProcess(pid) : null;
      if (identity?.executable === path.join(unpacked, "readflow")) {
        const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
        if (
          args.includes(`--user-data-dir=${profile}`) &&
          readLinuxProcess(pid)?.startTime === identity.startTime
        ) {
          process.kill(pid, "SIGKILL");
        }
      }
    } catch {
      /* Already exited; never infer ownership by an executable name alone. */
    }
    await createBackendProcessRegistry({
      userData: profile,
      backendRoot: path.join(unpacked, "resources/backend"),
    }).recover();
  })();
  return cleaning;
}
process.once("SIGINT", () => void cleanup(true).finally(() => process.exit(130)));
for (let run = 1; run <= 2; run++) {
  application = null;
  cleaning = null;
  console.log(JSON.stringify({ run, phase: "starting", profile, headed }));
  const watchdog = setTimeout(() => {
    console.error("Isolated Electron check timed out; stopping only this test profile.");
    void cleanup(true).finally(() => process.exit(2));
  }, 90000);
  try {
    application = await _electron.launch({
      executablePath: path.join(unpacked, "readflow"),
      env,
      args: [
        `--user-data-dir=${profile}`,
        "--disable-gpu",
        ...(headed ? [] : ["--ozone-platform=headless"]),
        "--disable-background-networking",
        "--disable-component-update",
        "--no-first-run",
      ],
      timeout: 45000,
    });
    const deadline = Date.now() + 60000;
    let ready = false;
    while (Date.now() < deadline) {
      const page = application.windows().find((window) => window.url().includes("workbench.html"));
      if (page) {
        await page.getByRole("button", { name: "全部文献", exact: true }).click({ timeout: 30000 });
        await page.locator("[data-wb-list] [role=option]").first().waitFor({ timeout: 30000 });
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error("Workbench did not become ready");
    const version = await application.evaluate(({ app }) => app.getVersion());
    console.log(JSON.stringify({ run, ready, version, profile }));
  } finally {
    await cleanup();
    clearTimeout(watchdog);
  }
}
