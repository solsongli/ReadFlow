const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PRODUCT_NAME, configureDesktopIdentity } = require("./src/main/brand");
const { requiresIsolatedBackend } = require("./src/main/desktop-startup");
const { createBackendProcessRegistry } = require("./src/main/backend-processes");
const { installDesktopShutdown } = require("./src/main/desktop-shutdown");
const {
  canConnectToPort,
  createBackendStartupDiagnostics,
  waitForPort,
} = require("./src/main/backend-startup-diagnostics");
const { buildBackendEnv } = require("./src/main/backend-env");
const { createBackendHttp } = require("./src/main/backend-http");
const { createPortOccupant } = require("./src/main/port-occupant");
const { createPortAllocator } = require("./src/main/port-allocator");
const { createLocalGateway } = require("./src/main/local-gateway");
const {
  buildResearchFrontendRuntime,
  createResearchLibraryRuntime,
  readResearchPreviewPorts,
} = require("./src/main/research-library-runtime");
const { createBackendRuntime } = require("./src/main/backend-runtime");
const { createDesktopConfigStore } = require("./src/main/desktop-config");
const { createConnectorSettings } = require("./src/main/connector-settings");
const { createInstalledFonts } = require("./src/main/installed-fonts");
const { createDesktopLogger } = require("./src/main/desktop-logging");
const { createDesktopWindows } = require("./src/main/desktop-windows");

// Set paths before logging, config access or the single-instance lock.
configureDesktopIdentity(app);
const desktopLogger = createDesktopLogger(app);
const {
  appendDesktopLog,
  getDesktopLogPath,
  logDesktop,
  logDesktopError,
  resolveDesktopLogPath,
  setDesktopLogPath,
} = desktopLogger;
const backendStartupDiagnostics = createBackendStartupDiagnostics({ getDesktopLogPath });
const backendRuntime = createBackendRuntime(app, { appRoot: __dirname });
const {
  bundledPythonImportPaths,
  preparePythonRuntime,
  resolveBackendBinary,
  resolveBackendRoot,
  resolveBundledPythonHome,
  resolvePipelineCommand,
  resolvePythonRuntime,
  resolveTypstBinary,
} = backendRuntime;

const DESKTOP_API_KEY = "retain-pdf-desktop";
const backendHttp = createBackendHttp({
  desktopApiKey: DESKTOP_API_KEY,
  logger: console,
});
const { canReuseExistingBackend } = backendHttp;
const portOccupant = createPortOccupant({ canConnectToPort, logger: console });
const { killProcessTreeSync } = portOccupant;
const desktopConfigStore = createDesktopConfigStore(app, { desktopApiKey: DESKTOP_API_KEY });
const {
  buildDesktopConfigResponse,
  buildDesktopRuntimeConfig,
  loadDesktopConfig,
  saveDesktopConfig,
  setBackendApiPort,
} = desktopConfigStore;
const connectorSettings = createConnectorSettings({ app, loadDesktopConfig, saveDesktopConfig,
  canConnectToPort, getPortOccupant: portOccupant.getPortOccupant });
const installedFonts = createInstalledFonts();
// The shared local service now also owns OCR settings for the original shell.
const researchLibraryEnabled = process.env.RETAIN_PDF_RESEARCH_LIBRARY !== "0";
const offlineLibraryPreview = researchLibraryEnabled && process.env.RETAIN_PDF_OFFLINE_LIBRARY_PREVIEW === "1";
const isolatedBackend = requiresIsolatedBackend({ isPackaged: app.isPackaged, offlinePreview: offlineLibraryPreview });
const previewPorts = offlineLibraryPreview ? readResearchPreviewPorts() : null;
let frontendGateway = null;
let backendChild = null;
let aiServiceChild = null;
let backendStopping = false;
// Same-origin gateway base URL (http://127.0.0.1:<port>). Empty until the
// gateway starts after backend readiness; windows fall back to loadFile.
let frontendGatewayBaseUrl = "";
// Startup retry rounds spawn short-lived backends; their crash dialogs would
// be noise (the startup error itself is reported). Only show crash dialogs
// for backends that die after a successful startup.
let suppressBackendCrashDialog = false;
let splashWindow = null;
let usingExternalBackend = false;
let isQuitting = false;
let backendProcesses = null;

function spawnBackend(command, args, options) {
  if (backendStopping || isQuitting) throw new Error("Desktop is shutting down");
  const child = spawn(command, args, options);
  return backendProcesses ? backendProcesses.trackChild(child) : child;
}

const AI_SERVICE_PORT = previewPorts?.aiServicePort || 41100;
const researchLibraryRuntime = createResearchLibraryRuntime({
  spawnChild: spawnBackend,
  logger: { warn: logDesktop },
  onUnexpectedExit(error) {
    if (backendStopping || isQuitting) return;
    logDesktopError(`[desktop] native research-library stopped: ${error.message}`);
    dialog.showErrorBox(`${PRODUCT_NAME} 文献服务已停止`, error.message);
    app.quit();
  },
});

function desktopRuntimeConfig(config) {
  return buildResearchFrontendRuntime(buildDesktopRuntimeConfig(config), {
    enabled: researchLibraryEnabled,
    gatewayBase: frontendGatewayBaseUrl,
    offlinePreview: offlineLibraryPreview,
  });
}

function desktopConfigResponse(config) {
  const response = buildDesktopConfigResponse(config);
  return { ...response, runtimeConfig: desktopRuntimeConfig(config) };
}

async function startDesktopGateway({ apiPort, backendRoot, pythonRuntime, env }) {
  if (backendStopping || isQuitting) throw new Error("Desktop is shutting down");
  if (researchLibraryEnabled) {
    updateSplashProgress(88, "正在启动文献管理", "正在连接独立本地文献库");
    await researchLibraryRuntime.start({
      appRoot: __dirname,
      backendRoot,
      pythonRuntime,
      env,
      codeRoot: process.env.RETAIN_PDF_RESEARCH_CODE_ROOT,
      serviceEntry: process.env.RETAIN_PDF_RESEARCH_SERVICE_ENTRY,
      dataRoot: path.join(app.getPath("userData"), "data", "research-library"),
      backendBase: `http://127.0.0.1:${apiPort}`,
      desktopApiKey: DESKTOP_API_KEY,
      ...(await connectorSettings.prepare()),
    });
  }
  try {
    frontendGateway = createLocalGateway({
      frontendRoot: resolveFrontendRoot(),
      getBackendBase: () => `http://127.0.0.1:${apiPort}`,
      getResearchBase: () => researchLibraryRuntime.getBaseUrl(),
      getResearchInternalToken: () => researchLibraryRuntime.getInternalToken(),
      getRuntimeConfig: () => desktopRuntimeConfig(loadDesktopConfig()),
      canConnectToPort,
      logger: console,
    });
    frontendGatewayBaseUrl = await frontendGateway.start("127.0.0.1", previewPorts?.gatewayPort || 40001);
  } catch (error) {
    frontendGatewayBaseUrl = "";
    if (researchLibraryEnabled) {
      throw new Error(`native research-library gateway failed: ${error?.message || error}`);
    }
    logDesktopError(`[desktop] local gateway unavailable, falling back to file: ${error?.message || error}`);
  }
}

function updateSplashProgress(progress, title, detail) {
  if (!splashWindow || splashWindow.isDestroyed()) {
    return;
  }
  splashWindow.webContents.send("startup-progress", {
    progress,
    title,
    detail,
  });
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

const desktopWindows = createDesktopWindows(app, {
  appRoot: __dirname,
  closeSplashWindow,
  getFrontendBaseUrl: () => frontendGatewayBaseUrl,
  // Packaged defaults to workbench; explicit preview/development choices win.
  startPage: process.env.RETAIN_PDF_START_PAGE,
  offlinePreview: process.env.RETAIN_PDF_OFFLINE_LIBRARY_PREVIEW === "1",
  isQuitting: () => isQuitting,
  loadDesktopConfig,
  logDesktop,
  logDesktopError,
  markQuitting: () => {
    isQuitting = true;
  },
  saveDesktopConfig,
  updateSplashProgress,
});
const {
  createTray,
  createWindow,
  hasLiveMainWindow,
  resolveFrontendRoot,
  resolveWindowIcon,
  setCloseToTrayHintShown,
  showExistingDesktopWindow,
  showMainWindow,
} = desktopWindows;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    logDesktop("[desktop] second instance requested; restoring existing window");
    showExistingDesktopWindow(splashWindow);
  });
}

async function createSplashWindow() {
  splashWindow = new BrowserWindow({
    title: PRODUCT_NAME,
    width: 520,
    height: 360,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    center: true,
    backgroundColor: "#f5f5f7",
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  await splashWindow.loadFile(path.join(__dirname, "splash.html"));
  updateSplashProgress(6, "正在准备运行环境", "正在检查桌面组件与本地资源");
}

async function startBundledBackend() {
  updateSplashProgress(18, "正在检查运行文件", "正在校验后端、Python 和脚本资源");
  const backendRoot = resolveBackendRoot();
  const backendBin = resolveBackendBinary(backendRoot);
  let pythonRuntime = resolvePythonRuntime(backendRoot);
  const scriptsDir = path.join(backendRoot, "pipeline");
  const pipelineCommand = typeof resolvePipelineCommand === "function"
    ? resolvePipelineCommand(backendRoot)
    : null;
  const pipelineEntrypointMode = pipelineCommand ? "console" : "script";
  const typstBin = resolveTypstBinary(backendRoot);
  const bundledFontPath = path.join(backendRoot, "fonts", "SourceHanSerifSC-Regular.otf");
  const bundledTitleBoldFontPath = path.join(backendRoot, "fonts", "SourceHanSerifSC-Bold.otf");
  const bundledTypstFontDir = path.join(backendRoot, "fonts");
  const dataRoot = path.join(app.getPath("userData"), "data");
  const rustApiRoot = path.join(dataRoot, "rust_api");
  const typstPackagePath = path.join(backendRoot, "typst-packages");
  const typstPackageCachePath = path.join(dataRoot, "typst-package-cache");
  const DEFAULT_API_PORT = previewPorts?.apiPort || 41000;
  const DEFAULT_SIMPLE_PORT = previewPorts?.simplePort || 42000;
  // Must match RUST_API_JOBS_PORT default in retain-core config/jobs_service.rs
  // (buildBackendEnv falls back to the same default when jobsPort is unset).
  const DEFAULT_JOBS_PORT = previewPorts?.jobsPort || 41002;
  let apiPort = DEFAULT_API_PORT;
  let simplePort = DEFAULT_SIMPLE_PORT;
  let jobsServicePort = DEFAULT_JOBS_PORT;
  let aiServicePort = AI_SERVICE_PORT;
  // Packaged builds use backend/ai_service; development may use backend/ai.
  let aiServiceRoot = path.join(backendRoot, "ai_service");
  if (!fs.existsSync(path.join(aiServiceRoot, "retainpdf_ai", "__main__.py"))) {
    const repoAiServices = path.join(__dirname, "..", "..", "backend", "ai");
    if (fs.existsSync(path.join(repoAiServices, "retainpdf_ai", "__main__.py"))) {
      aiServiceRoot = repoAiServices;
    }
  }

  logDesktop(
    [
      "[desktop] starting bundled backend",
      `platform=${process.platform}`,
      `packaged=${app.isPackaged}`,
      `backendRoot=${backendRoot}`,
      `backendBin=${backendBin}`,
      `python=${pythonRuntime.command || "<missing>"}`,
      `pythonHome=${pythonRuntime.bundledHome || "<system>"}`,
      `scriptsDir=${scriptsDir}`,
      `pipelineCommand=${pipelineCommand || "<missing-script-fallback>"}`,
      `entrypointMode=${pipelineEntrypointMode}`,
      `aiServiceRoot=${aiServiceRoot}`,
      `typst=${typstBin || "<missing>"}`,
      `log=${getDesktopLogPath() || "<unavailable>"}`,
    ].join(" "),
  );

  if (!fs.existsSync(backendBin)) {
    throw new Error(`missing bundled backend binary: ${backendBin}`);
  }
  if (!pythonRuntime.command) {
    throw new Error("missing python runtime");
  }
  if (!fs.existsSync(scriptsDir)) {
    throw new Error(`missing bundled scripts directory: ${scriptsDir}`);
  }
  if (!pipelineCommand) {
    logDesktop("[desktop] pipeline console wrapper missing; falling back to script entrypoint mode");
  }
  if (app.isPackaged && !typstBin) {
    throw new Error(`missing bundled typst runtime under ${path.join(backendRoot, "typst")}`);
  }

  pythonRuntime = await preparePythonRuntime(pythonRuntime, {
    updateSplashProgress,
  });
  if (app.isPackaged && !pythonRuntime.bundledHome) {
    throw new Error(
      `missing bundled python runtime under ${path.join(backendRoot, "python")}`,
    );
  }

  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(rustApiRoot, { recursive: true });
  fs.mkdirSync(typstPackageCachePath, { recursive: true });
  updateSplashProgress(34, "正在准备工作目录", "正在初始化本地数据目录");

  // Default API port busy? Try reclaiming our own residual first; a
  // compatible existing backend may be reused in development only.
  const defaultApiBusy = !isolatedBackend && await canConnectToPort("127.0.0.1", apiPort);
  logDesktop(`[desktop] port ${apiPort} busy=${defaultApiBusy}`);
  if (defaultApiBusy) {
    const reclaim = await portOccupant.reclaimPortIfOwnResidual("127.0.0.1", apiPort);
    logDesktop(
      `[desktop] port ${apiPort} occupant=${reclaim.occupant ? `${reclaim.occupant.image || "<unknown>"}:${reclaim.occupant.pid}` : "<none>"} reclaim=${reclaim.status}`,
    );
    if (reclaim.status === "reclaimed") {
      updateSplashProgress(36, "正在清理残留进程", "已回收上次残留的后端端口");
    }
  }
  const defaultApiStillBusy = defaultApiBusy
    ? await canConnectToPort("127.0.0.1", apiPort)
    : false;
  if (defaultApiStillBusy) {
    if (!isolatedBackend && await canReuseExistingBackend(apiPort)) {
      usingExternalBackend = true;
      logDesktop(`[desktop] reusing existing backend on port ${apiPort}`);
      updateSplashProgress(52, "检测到已有本地服务", "桌面端将直接复用当前后端");
      await waitForPort("127.0.0.1", apiPort, 5000);
      // 仍尝试拉起 AI（若 41100 空闲）；复用的 Rust 会反代到本机 AI
      const reuseEnv = buildBackendEnv({
        apiPort,
        aiServicePort,
        aiServiceRoot,
        backendRoot,
        bundledFontPath,
        bundledPythonHome: resolveBundledPythonHome(pythonRuntime.bundledHome),
        bundledPythonImportPaths: bundledPythonImportPaths(pythonRuntime.bundledHome),
        bundledTitleBoldFontPath,
        bundledTypstFontDir,
        dataRoot,
        desktopApiKey: DESKTOP_API_KEY,
        entrypointMode: pipelineEntrypointMode,
        inheritHostPythonPath: !app.isPackaged,
        pipelineCommand: pipelineCommand || undefined,
        pythonRuntime,
        rustApiRoot,
        scriptsDir,
        simplePort,
        typstBin,
        typstPackageCachePath,
        typstPackagePath,
      });
      await startRetainpdfAiService({
        aiServicePort,
        aiServiceRoot,
        env: reuseEnv,
        pythonCommand: pythonRuntime.command,
      });
      setBackendApiPort(apiPort);
      await startDesktopGateway({ apiPort, backendRoot, pythonRuntime, env: reuseEnv });
      updateSplashProgress(92, "本地服务已就绪", "正在加载主界面");
      return;
    }
    // Not reusable and not ours to reclaim: fall through to fresh allocation
    // on fallback ports below instead of failing. Packaged builds never
    // connect to the foreign backend, they just move to a free port.
  }

  // Allocate fresh ports for all four backend roles: reclaim own residuals,
  // otherwise take the next free port. Retried on bind races (see below).
  const excludedPorts = new Set();
  suppressBackendCrashDialog = true;
  for (let attempt = 1; ; attempt += 1) {
    const allocator = createPortAllocator({
      canConnectToPort,
      reclaimPortIfOwnResidual: isolatedBackend
        ? async () => ({ status: "unchanged", occupant: null })
        : (host, port) => portOccupant.reclaimPortIfOwnResidual(host, port),
      describeOccupant: (port, occupant) => portOccupant.describeOccupant(port, occupant),
      exclude: excludedPorts,
      logger: console,
    });
    const allocated = await allocator.allocateBackendPorts("127.0.0.1", {
      apiPort: DEFAULT_API_PORT,
      simplePort: DEFAULT_SIMPLE_PORT,
      jobsPort: DEFAULT_JOBS_PORT,
      aiServicePort: AI_SERVICE_PORT,
    });
    apiPort = allocated.ports.apiPort;
    simplePort = allocated.ports.simplePort;
    jobsServicePort = allocated.ports.jobsPort;
    aiServicePort = allocated.ports.aiServicePort;
    setBackendApiPort(apiPort);
    if (allocated.relocations.length > 0) {
      const summary = allocated.relocations.map((item) => `${item.from}→${item.to}`).join("、");
      logDesktop(`[desktop] ports relocated: ${summary}`);
      updateSplashProgress(36, "端口自动切换", `默认端口被占用，已切换：${summary}`);
    }

const bundledPythonHome = resolveBundledPythonHome(pythonRuntime.bundledHome);
// ADR-002 Phase3: 打包版默认 remote + 监督（改壳不杀任务），开发版保持 InProcess 除非显式设 env
// The isolated offline preview has no jobsd; run its local OCR tasks in process.
const jobsModeForEnv = offlineLibraryPreview ? "in_process" : process.env.RUST_API_JOBS_MODE || (app.isPackaged ? "remote" : "");
const jobsSuperviseForEnv = offlineLibraryPreview ? "0" : process.env.RUST_API_JOBS_SUPERVISE || (app.isPackaged ? "1" : "");
const aiSuperviseForEnv = offlineLibraryPreview ? "0" : process.env.RUST_API_AI_SUPERVISE || (app.isPackaged ? "1" : "");
const env = buildBackendEnv({
  apiPort,
  aiServicePort,
  aiServiceRoot,
  backendRoot,
  bundledFontPath,
  bundledPythonHome,
  bundledPythonImportPaths: bundledPythonImportPaths(pythonRuntime.bundledHome),
  bundledTitleBoldFontPath,
  bundledTypstFontDir,
  dataRoot,
  desktopApiKey: DESKTOP_API_KEY,
  entrypointMode: pipelineEntrypointMode,
  inheritHostPythonPath: !app.isPackaged,
  jobsPort: jobsServicePort,
  jobsMode: jobsModeForEnv,
  jobsSupervise: jobsSuperviseForEnv,
  pipelineCommand: pipelineCommand || undefined,
  pythonRuntime,
  rustApiRoot,
  scriptsDir,
  simplePort,
  typstBin,
  typstPackageCachePath,
  typstPackagePath,
});
if (aiSuperviseForEnv) env.RUST_API_AI_SUPERVISE = aiSuperviseForEnv;

updateSplashProgress(52, "正在启动本地服务", "Rust API 与 AI 服务正在启动");
logDesktop(`[desktop] spawning backend: ${backendBin}`);
backendStartupDiagnostics.reset(backendBin, backendRoot);
backendChild = spawnBackend(backendBin, [], {
  cwd: backendRoot,
  env,
  windowsHide: process.platform === "win32",
  stdio: ["ignore", "pipe", "pipe"],
});

backendChild.stdout.on("data", (chunk) => {
  backendStartupDiagnostics.rememberOutput("stdout", chunk);
  const message = `[rust_api] ${chunk}`;
  process.stdout.write(message);
  appendDesktopLog(message.trimEnd());
});
backendChild.stderr.on("data", (chunk) => {
  backendStartupDiagnostics.rememberOutput("stderr", chunk);
  const message = `[rust_api] ${chunk}`;
  process.stderr.write(message);
  appendDesktopLog(message.trimEnd());
});

backendChild.once("exit", (code, signal) => {
  backendChild = null;
  if (backendStopping || suppressBackendCrashDialog) {
    return;
  }
  const detail = `code=${code ?? "null"} signal=${signal ?? "null"}`;
  backendStartupDiagnostics.markExit(detail);
  logDesktopError(`[desktop] Rust API worker crashed: ${detail}`);
  dialog.showErrorBox(`${PRODUCT_NAME} 后端进程异常退出`, detail);
});

// retainpdf-ai：由壳监督（RUST_API_AI_SUPERVISE=1）时桌面端不再自拉，避免双进程
const aiSupervisedByShell = env.RUST_API_AI_SUPERVISE === "1";
const jobsdSupervisedByShell = env.RUST_API_JOBS_SUPERVISE === "1" && env.RUST_API_JOBS_MODE === "remote";
if (offlineLibraryPreview) {
  logDesktop("[desktop] offline library preview: AI service disabled, status remains not-verified");
} else if (aiSupervisedByShell) {
  logDesktop("[desktop] ai_service supervised by shell (RUST_API_AI_SUPERVISE=1); skipping desktop spawn");
} else {
  await startRetainpdfAiService({
    aiServicePort,
    aiServiceRoot,
    env,
    pythonCommand: pythonRuntime.command,
  });
}
if (jobsdSupervisedByShell) {
  logDesktop("[desktop] jobsd supervised by shell (RUST_API_JOBS_SUPERVISE=1); shell will spawn retain-jobsd");
}

let waitingProgress = 58;
const waitingTimer = setInterval(() => {
  waitingProgress = Math.min(waitingProgress + 3, 88);
  updateSplashProgress(
    waitingProgress,
    "正在连接本地服务",
    "首次启动可能稍慢，请稍候",
  );
}, 500);
const backendReadyTimeoutMs = app.isPackaged ? 90000 : 30000;
logDesktop(`[desktop] waiting for backend port ${apiPort} timeoutMs=${backendReadyTimeoutMs} (attempt ${attempt}/3)`);
try {
  await backendStartupDiagnostics.waitForBackendReady("127.0.0.1", apiPort, backendReadyTimeoutMs);
} catch (error) {
  clearInterval(waitingTimer);
  const conflict = backendStartupDiagnostics.hasExited() && backendStartupDiagnostics.hasBindConflict();
  if (backendProcesses) {
    await backendProcesses.stopAll();
    aiServiceChild = null;
    backendChild = null;
  } else if (aiServiceChild && !aiServiceChild.killed && aiServiceChild.pid) {
    killProcessTreeSync(aiServiceChild.pid);
    aiServiceChild = null;
  }
  if (conflict && attempt < 3) {
    // Bind race: someone grabbed our ports between probe and bind.
    // Re-allocate excluding them and respawn.
    excludedPorts.add(apiPort);
    excludedPorts.add(simplePort);
    excludedPorts.add(jobsServicePort);
    excludedPorts.add(aiServicePort);
    logDesktop(`[desktop] backend bind conflict on attempt ${attempt}, reallocating ports and retrying`);
    updateSplashProgress(36, "端口冲突重试", "检测到端口竞争，正在换端口重试");
    continue;
  }
  throw error;
}
  clearInterval(waitingTimer);
  if (backendProcesses) backendProcesses.snapshot();
  logDesktop(`[desktop] backend ready on port ${apiPort}`);
  await startDesktopGateway({ apiPort, backendRoot, pythonRuntime, env });
  updateSplashProgress(92, "本地服务已就绪", "正在加载主界面");
    break;
  } // end startup attempt loop
  suppressBackendCrashDialog = false;
}

async function startRetainpdfAiService({
  aiServicePort,
  aiServiceRoot,
  env,
  pythonCommand,
}) {
  if (!fs.existsSync(path.join(aiServiceRoot, "retainpdf_ai", "__main__.py"))) {
    logDesktopError(`[desktop] retainpdf-ai package missing under ${aiServiceRoot}; AI ask will return 502`);
    return;
  }

  const aiBusy = await canConnectToPort("127.0.0.1", aiServicePort);
  if (aiBusy) {
    let occupantLabel = "<none>";
    try {
      const occupant = await portOccupant.getPortOccupant("127.0.0.1", aiServicePort);
      if (occupant) {
        occupantLabel = `${occupant.image || "<unknown>"}:${occupant.pid}`;
      }
    } catch {
      occupantLabel = "<lookup-failed>";
    }
    logDesktop(
      `[desktop] AI service port ${aiServicePort} already in use; reusing (occupant=${occupantLabel})`,
    );
    return;
  }

  logDesktop(`[desktop] spawning retainpdf-ai: ${pythonCommand} -m retainpdf_ai (port ${aiServicePort})`);
  aiServiceChild = spawnBackend(pythonCommand, ["-m", "retainpdf_ai"], {
    cwd: aiServiceRoot,
    env,
    windowsHide: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  aiServiceChild.stdout.on("data", (chunk) => {
    const message = `[retainpdf_ai] ${chunk}`;
    process.stdout.write(message);
    appendDesktopLog(message.trimEnd());
  });
  aiServiceChild.stderr.on("data", (chunk) => {
    const message = `[retainpdf_ai] ${chunk}`;
    process.stderr.write(message);
    appendDesktopLog(message.trimEnd());
  });
  aiServiceChild.once("exit", (code, signal) => {
    aiServiceChild = null;
    if (backendStopping || isQuitting) {
      return;
    }
    logDesktopError(
      `[desktop] retainpdf-ai exited unexpectedly: code=${code ?? "null"} signal=${signal ?? "null"}`,
    );
  });

  const aiReadyTimeoutMs = app.isPackaged ? 60000 : 20000;
  try {
    await waitForPort("127.0.0.1", aiServicePort, aiReadyTimeoutMs);
    logDesktop(`[desktop] retainpdf-ai ready on port ${aiServicePort}`);
  } catch (error) {
    // 不阻断主程序：翻译流水线仍可用，仅 AI 问答会 502
    logDesktopError(
      `[desktop] retainpdf-ai failed to become ready: ${error && error.message ? error.message : error}`,
    );
  }
}

async function stopDesktopBackends() {
  // Snapshot Rust-supervised descendants BEFORE stopping their parents.
  if (backendProcesses) backendProcesses.snapshot({ bestEffort: true });
  researchLibraryRuntime.stop(backendProcesses ? { terminateChild: false } : { killProcessTreeSync });
  const gateway = frontendGateway;
  frontendGateway = null;
  if (gateway) {
    // Do not hold backend cleanup hostage to a renderer's keepalive socket.
    gateway.stop().catch((error) => logDesktopError(`[desktop] gateway stop failed: ${error.message}`));
  }
  if (backendProcesses) {
    try { await backendProcesses.stopAll(); } finally { backendProcesses.stopMonitoring(); }
  } else {
    if (aiServiceChild && !aiServiceChild.killed && aiServiceChild.pid) killProcessTreeSync(aiServiceChild.pid);
    if (!usingExternalBackend && backendChild && !backendChild.killed && backendChild.pid) killProcessTreeSync(backendChild.pid);
  }
  aiServiceChild = null;
  backendChild = null;
}

if (gotSingleInstanceLock) {
  installDesktopShutdown({
    app,
    markStopping() { isQuitting = true; backendStopping = true; },
    cleanup: stopDesktopBackends,
    logger: { warn: logDesktopError },
  });
  app.whenReady().then(async () => {
    if (isQuitting) return;
    setDesktopLogPath(resolveDesktopLogPath());
    appendDesktopLog("========== RetainPDF desktop startup ==========");
    logDesktop(`[desktop] app ready version=${app.getVersion()} packaged=${app.isPackaged} userData=${app.getPath("userData")}`);
    if (process.platform === "linux") {
      backendProcesses = createBackendProcessRegistry({
        userData: app.getPath("userData"), backendRoot: resolveBackendRoot(),
        logger: { warn: logDesktopError },
        onError() { app.quit(); },
      });
      await backendProcesses.recover();
      if (isQuitting) return;
      backendProcesses.startMonitoring();
    }
    setCloseToTrayHintShown(loadDesktopConfig().closeToTrayHintShown);
    await createSplashWindow();
    if (isQuitting) return;
    await startBundledBackend();
    if (!isQuitting) {
      createTray();
      createWindow();
      app.on("activate", () => {
        if (!hasLiveMainWindow()) {
          createWindow();
          return;
        }
        showMainWindow();
      });
    }
  }).catch((error) => {
    if (isQuitting) return;
    const detail = String(error && error.stack ? error.stack : error && error.message ? error.message : error);
    logDesktopError(`[desktop] startup failed: ${detail}`);
    const desktopLogPath = getDesktopLogPath();
    const dialogDetail = [
      String(error && error.message ? error.message : error),
      desktopLogPath ? `\n完整日志: ${desktopLogPath}` : "",
    ].filter(Boolean).join("\n");
    dialog.showErrorBox(`${PRODUCT_NAME} 启动失败`, dialogDetail);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) {
    app.quit();
  }
});

ipcMain.handle("desktop:invoke", async (_event, command, args = {}) => {
  switch (command) {
    case "list_installed_fonts": return installedFonts.list();
    case "load_connector_settings": return connectorSettings.preferences();
    case "save_connector_settings": return connectorSettings.save(args.enabled);
    case "restart_readflow": connectorSettings.restart(); return { ok: true };
    case "load_desktop_config": {
      const config = loadDesktopConfig();
      return desktopConfigResponse(config);
    }
    case "save_desktop_config": {
      const config = saveDesktopConfig(args?.payload || {});
      return desktopConfigResponse(config);
    }
    case "open_output_directory": {
      const outputDir = path.join(app.getPath("userData"), "data", "jobs");
      fs.mkdirSync(outputDir, { recursive: true });
      const result = await shell.openPath(outputDir);
      if (result) {
        throw new Error(result);
      }
      return { ok: true, outputDir };
    }
    default:
      throw new Error(`unsupported desktop command: ${command}`);
  }
});

ipcMain.on("desktop:renderer-issue", (_event, payload = {}) => {
  const type = payload?.type || "unknown";
  const message = payload?.message || "unknown renderer issue";
  const filename = payload?.filename || "";
  const lineno = payload?.lineno || 0;
  const colno = payload?.colno || 0;
  logDesktopError(`[desktop][renderer-issue] type=${type} file=${filename} line=${lineno} col=${colno} message=${message}`);
});
