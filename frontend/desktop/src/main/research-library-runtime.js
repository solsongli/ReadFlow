const { spawn } = require("child_process");
const { randomBytes } = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const READY_PREFIX = "RETAINPDF_RESEARCH_READY=";
const INTERNAL_HEADER = "X-RetainPDF-Internal";

function readResearchPreviewPorts(env = process.env) {
  const names = {
    apiPort: ["RETAIN_PDF_PREVIEW_API_PORT", 47100],
    simplePort: ["RETAIN_PDF_PREVIEW_SIMPLE_PORT", 47200],
    jobsPort: ["RETAIN_PDF_PREVIEW_JOBS_PORT", 47300],
    aiServicePort: ["RETAIN_PDF_PREVIEW_AI_PORT", 47400],
    gatewayPort: ["RETAIN_PDF_PREVIEW_GATEWAY_PORT", 47500],
  };
  const ports = {};
  for (const [role, [name, fallback]] of Object.entries(names)) {
    const value = env[name];
    const port = value ? Number(value) : fallback;
    if (!Number.isInteger(port) || port < 1024 || port > 65485) {
      throw new Error(`${name} must be an integer between 1024 and 65485`);
    }
    ports[role] = port;
  }
  if (new Set(Object.values(ports)).size !== Object.keys(ports).length) {
    throw new Error("offline preview service ports must be distinct");
  }
  return ports;
}

function buildResearchFrontendRuntime(config, options = {}) {
  if (!options.enabled) return config;
  return {
    ...config,
    apiBase: options.gatewayBase || config.apiBase,
    researchLibraryEnabled: true,
    offlineLibraryPreview: options.offlinePreview === true,
  };
}

function resolveResearchServiceEntry(options = {}) {
  const candidates = [
    options.serviceEntry,
    options.codeRoot && path.join(options.codeRoot, "ops", "development", "native_library_service.py"),
    options.backendRoot && path.join(options.backendRoot, "research-library", "native_library_service.py"),
    options.appRoot && path.resolve(options.appRoot, "..", "..", "ops", "development", "native_library_service.py"),
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!found) {
    throw new Error("missing native research-library service; set RETAIN_PDF_RESEARCH_CODE_ROOT to the source checkout");
  }
  return path.resolve(found);
}

function validateLoopbackBase(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !parsed.port
      || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function probeHealth(baseUrl, token, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const request = http.get(`${baseUrl}/api/research/healthz`, {
      agent: false,
      headers: { [INTERNAL_HEADER]: token },
      timeout: timeoutMs,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 16384) response.destroy();
      });
      response.on("error", () => resolve(false));
      response.on("end", () => {
        try {
          const health = JSON.parse(body);
          resolve(response.statusCode === 200 && health.ok === true && health.data_mode === "isolated"
            && health.ai?.status === "not-verified");
        } catch {
          resolve(false);
        }
      });
    });
    request.once("timeout", () => { request.destroy(); resolve(false); });
    request.once("error", () => resolve(false));
  });
}

function createResearchLibraryRuntime(options = {}) {
  const spawnChild = options.spawnChild || spawn;
  const logger = options.logger || console;
  const healthProbe = options.healthProbe || probeHealth;
  let child = null;
  let baseUrl = "";
  let internalToken = "";
  let stopRequested = false;
  let starting = null;
  let cancelStartup = null;

  async function start(settings = {}) {
    if (baseUrl && child) return baseUrl;
    if (starting) return starting;
    if (!settings.pythonRuntime?.command) throw new Error("missing selected Python runtime for the research library");
    const serviceEntry = resolveResearchServiceEntry(settings);
    const nativeBase = validateLoopbackBase(settings.backendBase);
    if (!nativeBase || !settings.desktopApiKey) throw new Error("research library requires a loopback native backend");
    const connectorPort = settings.connectorPort == null || settings.connectorPort === ""
      ? null : Number(settings.connectorPort);
    if (connectorPort !== null && (!Number.isInteger(connectorPort) || connectorPort < 1024 || connectorPort > 65535)) {
      throw new Error("RETAIN_PDF_RESEARCH_CONNECTOR_PORT must be between 1024 and 65535");
    }
    internalToken = randomBytes(32).toString("hex");
    const startupToken = internalToken;
    stopRequested = false;
    let outputBuffer = "";
    let readyBase = "";
    const redact = (value) => String(value).split(startupToken).join("<internal>")
      .split(settings.desktopApiKey).join("<native-key>");
    const args = ["-B", serviceEntry, "--port", "0", "--data-root", settings.dataRoot, "--native-base", nativeBase];
    if (connectorPort !== null) args.push("--connector-port", String(connectorPort));
    if (settings.connectorState) args.push("--connector-state", JSON.stringify(settings.connectorState));
    const env = {
      ...(settings.env || process.env),
      READFLOW_TYPST_BIN: settings.env?.TYPST_BIN || "",
      READFLOW_TYPST_PACKAGES: settings.env?.TYPST_PACKAGE_PATH || "",
      READFLOW_FONT_DIRS: settings.env?.RETAIN_PDF_TYPST_FONT_DIRS || "",
      READFLOW_APP_VERSION: settings.appVersion || "",
      READFLOW_MODELS_DIR: settings.env?.READFLOW_MODELS_DIR || (settings.codeRoot
        ? path.join(settings.codeRoot, ".model-cache/runtime/models")
        : path.join(settings.backendRoot || "", "models")),
      OPENBLAS_NUM_THREADS: "1",
      OMP_NUM_THREADS: "2",
      PYTHONUNBUFFERED: "1",
      PYTHONUTF8: "1",
      PYTHONDONTWRITEBYTECODE: "1",
      RETAIN_PDF_RESEARCH_INTERNAL_TOKEN: internalToken,
      RETAIN_PDF_RESEARCH_NATIVE_API_KEY: settings.desktopApiKey,
      ...(settings.codeRoot ? { RETAIN_PDF_RESEARCH_CODE_ROOT: settings.codeRoot } : {}),
    };
    starting = new Promise((resolve, reject) => {
      cancelStartup = fail;
      let settled = false;
      let ready = false;
      let checking = false;
      const timer = setTimeout(() => fail(new Error("native research-library service did not become ready")),
        settings.timeoutMs || 30000);
      const poll = setInterval(async () => {
        if (!readyBase || checking || settled) return;
        checking = true;
        const healthy = await healthProbe(readyBase, internalToken);
        checking = false;
        if (healthy && !settled) {
          settled = true;
          ready = true;
          clearTimeout(timer);
          clearInterval(poll);
          baseUrl = readyBase;
          cancelStartup = null;
          logger.warn(`[desktop] native research-library ready on ${baseUrl}`);
          resolve(baseUrl);
        }
      }, 100);
      function fail(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(poll);
        cancelStartup = null;
        if (child && !child.killed) child.kill();
        child = null;
        baseUrl = "";
        reject(new Error(`native research-library startup failed: ${redact(error.message || error)}`));
      }
      try {
        child = spawnChild(settings.pythonRuntime.command, args, {
          cwd: path.dirname(serviceEntry), env,
          windowsHide: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        fail(error);
        return;
      }
      const ownedChild = child;
      ownedChild.stdout.on("data", (chunk) => {
        outputBuffer += String(chunk);
        if (outputBuffer.length > 65536) {
          fail(new Error("research-library startup output exceeded its limit"));
          return;
        }
        const lines = outputBuffer.split(/\r?\n/);
        outputBuffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith(READY_PREFIX)) {
            try {
              const ready = JSON.parse(line.slice(READY_PREFIX.length));
              readyBase = validateLoopbackBase(ready.base_url);
              if (!readyBase) fail(new Error("research-library announced an invalid local address"));
            } catch {
              fail(new Error("research-library announced invalid readiness data"));
            }
          } else if (line.trim()) {
            logger.warn(`[research-library] ${redact(line)}`);
          }
        }
      });
      ownedChild.stderr.on("data", (chunk) => logger.warn(`[research-library] ${redact(chunk).trimEnd()}`));
      ownedChild.once("error", (error) => fail(error));
      ownedChild.once("exit", (code, signal) => {
        const wasOwned = child === ownedChild;
        if (wasOwned) { child = null; baseUrl = ""; }
        if (stopRequested) return;
        const error = new Error(`service exited: code=${code ?? "null"} signal=${signal ?? "null"}`);
        if (!settled) fail(error);
        else if (ready && wasOwned && typeof options.onUnexpectedExit === "function") options.onUnexpectedExit(error);
      });
    });
    try {
      return await starting;
    } finally {
      starting = null;
    }
  }

  function stop(stopOptions = {}) {
    stopRequested = true;
    const ownedChild = child;
    child = null;
    baseUrl = "";
    if (cancelStartup) cancelStartup(new Error("research-library startup cancelled"));
    if (stopOptions.terminateChild !== false && ownedChild && !ownedChild.killed && ownedChild.pid) {
      if (typeof stopOptions.killProcessTreeSync === "function") stopOptions.killProcessTreeSync(ownedChild.pid);
      else ownedChild.kill();
    }
    internalToken = "";
  }

  return { start, stop, getBaseUrl: () => baseUrl, getInternalToken: () => internalToken };
}

module.exports = {
  INTERNAL_HEADER, READY_PREFIX, buildResearchFrontendRuntime, createResearchLibraryRuntime,
  readResearchPreviewPorts, resolveResearchServiceEntry,
};
