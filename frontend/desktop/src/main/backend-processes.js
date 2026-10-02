const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");

function parseProcStat(value) {
  // comm (field 2) can itself contain spaces and parentheses.
  const end = value.lastIndexOf(")");
  const pid = Number(value.slice(0, value.indexOf(" ")));
  const fields = value.slice(end + 1).trim().split(/\s+/);
  if (end < 0 || !Number.isInteger(pid) || pid <= 1 || !/^\d+$/.test(fields[19] || "")) return null;
  return { pid, state: fields[0], ppid: Number(fields[1]), startTime: fields[19] };
}

function readLinuxProcess(pid, procRoot = "/proc") {
  try {
    const directory = path.join(procRoot, String(pid));
    const before = parseProcStat(fs.readFileSync(path.join(directory, "stat"), "utf8"));
    const executable = fs.readlinkSync(path.join(directory, "exe")).replace(/ \(deleted\)$/, "");
    const after = parseProcStat(fs.readFileSync(path.join(directory, "stat"), "utf8"));
    if (!before || !after || before.pid !== pid || before.startTime !== after.startTime
      || ["Z", "X"].includes(after.state)) return null;
    return { ...after, executable };
  } catch {
    return null;
  }
}

function linuxChildren(pid, procRoot = "/proc") {
  const children = new Set();
  try {
    const tasks = path.join(procRoot, String(pid), "task");
    // Rust's Tokio supervisor can spawn from any thread, not just its leader.
    for (const tid of fs.readdirSync(tasks)) {
      try {
        for (const child of fs.readFileSync(path.join(tasks, tid, "children"), "utf8").trim().split(/\s+/)) {
          if (/^\d+$/.test(child) && Number(child) > 1) children.add(Number(child));
        }
      } catch { /* A thread can exit while the tree is being sampled. */ }
    }
  } catch { /* Parent already exited. */ }
  return [...children];
}

function isWithinBackend(executable, backendRoot) {
  if (typeof executable !== "string" || !path.isAbsolute(executable)) return false;
  const relative = path.relative(backendRoot, executable);
  return !!relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function sameProcess(record, current, backendRoot) {
  return !!current && record.pid === current.pid && record.startTime === current.startTime
    && record.executable === current.executable && isWithinBackend(current.executable, backendRoot);
}

function createBackendProcessRegistry(options) {
  const backendRoot = fs.realpathSync(options.backendRoot);
  const runRoot = path.join(options.userData, "run");
  const filename = path.join(runRoot, "backend-pids.json");
  const bootId = options.bootId || fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  const readProcess = options.readProcess || readLinuxProcess;
  const childrenOf = options.childrenOf || linuxChildren;
  const signal = options.signal || ((pid, name) => process.kill(pid, name));
  const delay = options.delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now || Date.now;
  const logger = options.logger || console;
  const records = new Map();
  let monitor = null;
  let lastSaved = "";
  let stopping = null;

  function save() {
    const value = JSON.stringify({ application: "app.readflow.desktop", version: 1, bootId, backendRoot,
      processes: [...records.values()] }, null, 2) + "\n";
    if (value === lastSaved) return;
    fs.mkdirSync(runRoot, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(runRoot).isSymbolicLink()) throw new Error("Backend PID directory must not be a symlink");
    const temporary = `${filename}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      try { fs.writeFileSync(fd, value); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(temporary, filename);
    } finally { fs.rmSync(temporary, { force: true }); }
    lastSaved = value;
  }

  function remember(current) {
    if (!current || !isWithinBackend(current.executable, backendRoot)) return;
    records.set(current.pid, { pid: current.pid, startTime: current.startTime, executable: current.executable });
  }

  function snapshot({ bestEffort = false } = {}) {
    const visited = new Set();
    function visit(parent) {
      if (visited.has(parent.pid)) return;
      visited.add(parent.pid);
      const current = readProcess(parent.pid);
      if (!current || current.startTime !== parent.startTime || current.executable !== parent.executable) return;
      remember(current);
      for (const pid of childrenOf(parent.pid)) {
        const child = readProcess(pid);
        if (child && child.ppid === parent.pid) visit(child);
      }
    }
    for (const record of [...records.values()]) {
      if (!sameProcess(record, readProcess(record.pid), backendRoot)) records.delete(record.pid);
      else visit(record);
    }
    try { save(); } catch (error) {
      if (!bestEffort) throw error;
      logger.warn(`[desktop] PID file write failed during shutdown: ${error.message}`);
    }
    return [...records.values()];
  }

  function trackChild(child) {
    function capture() {
      remember(readProcess(child.pid));
      snapshot();
    }
    // spawn() has already completed exec on POSIX; the event also covers a
    // process not yet visible to the first /proc read.
    if (child.pid) capture();
    child.once("spawn", capture);
    return child;
  }

  function stopMonitoring() {
    if (monitor) clearInterval(monitor);
    monitor = null;
  }

  function startMonitoring() {
    if (monitor) return;
    monitor = setInterval(() => {
      try { snapshot(); } catch (error) {
        logger.warn(`[desktop] could not record backend processes: ${error.message}`);
        if (options.onError) options.onError(error);
      }
    }, options.pollMs || 100);
    monitor.unref();
  }

  function sendIfMatching(record, name) {
    // Recheck before BOTH TERM and KILL; a PID can be reused during the grace period.
    if (!sameProcess(record, readProcess(record.pid), backendRoot)) return;
    try { signal(record.pid, name); } catch (error) {
      if (error.code !== "ESRCH") logger.warn(`[desktop] ${name} failed for owned PID ${record.pid}: ${error.message}`);
    }
  }

  async function terminate() {
    const signalled = new Set();
    const deadline = now() + (options.termTimeoutMs ?? 2500);
    while (true) {
      const live = snapshot({ bestEffort: true });
      if (!live.length) return;
      // Supervisors were registered before their children. Stop them first;
      // also discover and stop any child respawned during graceful shutdown.
      for (const record of live) {
        const key = `${record.pid}:${record.startTime}`;
        if (!signalled.has(key)) { sendIfMatching(record, "SIGTERM"); signalled.add(key); }
      }
      if (now() >= deadline) break;
      await delay(25);
    }
    for (const record of snapshot({ bestEffort: true })) sendIfMatching(record, "SIGKILL");
    const killDeadline = now() + (options.killTimeoutMs ?? 1000);
    while (snapshot({ bestEffort: true }).length && now() < killDeadline) await delay(25);
    if (snapshot({ bestEffort: true }).length) throw new Error("Owned backend processes did not exit; PID records retained for next startup");
  }

  function stopAll() {
    if (!stopping) stopping = terminate().finally(() => { stopping = null; });
    return stopping;
  }

  async function recover() {
    // Called only after acquiring Electron's per-profile single-instance lock.
    // A malformed record is ignored wholesale; never infer ownership by name.
    try {
      if (fs.lstatSync(runRoot).isSymbolicLink()) throw new Error("invalid PID directory");
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("invalid PID file");
      const data = JSON.parse(fs.readFileSync(filename, "utf8"));
      if (data.application !== "app.readflow.desktop" || data.version !== 1 || data.backendRoot !== backendRoot
        || data.bootId !== bootId || !Array.isArray(data.processes) || data.processes.length > 4096
        || data.processes.some((item) => !item || !Number.isSafeInteger(item.pid) || item.pid <= 1
          || typeof item.startTime !== "string" || !/^\d+$/.test(item.startTime)
          || typeof item.executable !== "string")) throw new Error("invalid or foreign PID file");
      for (const record of data.processes) {
        if (sameProcess(record, readProcess(record.pid), backendRoot)) records.set(record.pid, record);
      }
    } catch (error) {
      if (error.code !== "ENOENT") logger.warn(`[desktop] ignored backend PID file: ${error.message}`);
    }
    await stopAll();
    save(); // Fail startup before spawning anything if the journal is unwritable.
  }

  return { recover, trackChild, snapshot, startMonitoring, stopMonitoring, stopAll, filename };
}

module.exports = { parseProcStat, readLinuxProcess, linuxChildren, sameProcess, createBackendProcessRegistry };
