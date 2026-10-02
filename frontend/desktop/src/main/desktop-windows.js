const fs = require("fs");
const path = require("path");
const { BrowserWindow, Menu, Tray, dialog, nativeImage, shell } = require("electron");
const { PRODUCT_NAME, resolveBrandIcon } = require("./brand");
const { resolveStartPage } = require("./desktop-startup");
const { appVersionArguments } = require("./app-version");

function createDesktopWindows(app, options = {}) {
  const appRoot = options.appRoot || process.cwd();
  const loadDesktopConfig = options.loadDesktopConfig;
  const saveDesktopConfig = options.saveDesktopConfig;
  const logDesktop = options.logDesktop || console.log;
  const logDesktopError = options.logDesktopError || console.error;
  const updateSplashProgress = options.updateSplashProgress || (() => {});
  const isQuitting = typeof options.isQuitting === "function" ? options.isQuitting : () => false;
  const markQuitting = typeof options.markQuitting === "function" ? options.markQuitting : () => {};
  let mainWindow = null;
  let tray = null;
  let closeToTrayHintShown = false;

  function resolveWindowIcon() {
    return resolveBrandIcon(appRoot);
  }

  /**
   * Menu bar / system tray icon.
   * Issue #76: using the 1024² window logo made the macOS menu-bar glyph huge.
   * Use the small brand artwork; avoid loading a 1024² menu-bar glyph.
   * On macOS, template images follow light/dark menu bar automatically.
   */
  function resolveTrayIcon() {
    const logoPath = resolveBrandIcon(appRoot, process.platform === "darwin" ? 32 : 16);
    const image = nativeImage.createFromPath(logoPath);
    if (image.isEmpty()) {
      return logoPath;
    }

    // Logical size ~16–18 pt in menu bar / notification area.
    const size = process.platform === "darwin" ? 18 : 16;
    const resized = image.resize({ width: size, height: size, quality: "best" });
    if (process.platform === "darwin") {
      resized.setTemplateImage(true);
    }
    return resized;
  }

  function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }

  function hideMainWindowToTray() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.hide();
    maybeShowCloseToTrayHint();
  }

  function persistCloseToTrayHintShown() {
    if (typeof loadDesktopConfig !== "function" || typeof saveDesktopConfig !== "function") {
      closeToTrayHintShown = true;
      return;
    }
    const current = loadDesktopConfig();
    saveDesktopConfig({
      ...current,
      closeToTrayHintShown: true,
    });
    closeToTrayHintShown = true;
  }

  function maybeShowCloseToTrayHint() {
    if (closeToTrayHintShown || !tray) {
      return;
    }
    if (process.platform === "win32" && typeof tray.displayBalloon === "function") {
      tray.displayBalloon({
        iconType: "info",
        title: `${PRODUCT_NAME} 正在后台运行`,
        content: "窗口已隐藏到系统托盘，本地 API 仍可继续使用。右键托盘图标可退出。",
      });
    }
    persistCloseToTrayHintShown();
  }

  function createTray() {
    if (tray) {
      return tray;
    }
    const trayIcon = resolveTrayIcon();
    tray = new Tray(trayIcon);
    // Ensure template mode even if path-based load did not auto-mark it.
    if (process.platform === "darwin" && trayIcon && typeof trayIcon !== "string") {
      try {
        tray.setImage(trayIcon);
      } catch (_err) {
        /* ignore */
      }
    }
    tray.setToolTip(PRODUCT_NAME);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "显示主窗口",
          click: () => {
            showMainWindow();
          },
        },
        {
          label: "退出",
          click: () => {
            markQuitting();
            app.quit();
          },
        },
      ]),
    );
    tray.on("click", () => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        hideMainWindowToTray();
        return;
      }
      showMainWindow();
    });
    tray.on("double-click", () => {
      showMainWindow();
    });
    return tray;
  }

  function createWindow() {
    const frontendRoot = resolveFrontendRoot();
    logDesktop(`[desktop] creating main window frontendRoot=${frontendRoot}`);

    mainWindow = new BrowserWindow({
      title: PRODUCT_NAME,
      width: 1480,
      height: 960,
      minWidth: 1200,
      minHeight: 760,
      autoHideMenuBar: true,
      show: false,
      icon: resolveWindowIcon(),
      webPreferences: {
        preload: path.join(appRoot, "preload.js"),
        additionalArguments: appVersionArguments(app, { offlinePreview: options.offlinePreview }),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    // Keep legacy page titles from overriding the desktop product identity.
    mainWindow.on("page-title-updated", (event) => event.preventDefault());
    const startPage = resolveStartPage({ frontendRoot, isPackaged: app.isPackaged, startPage: options.startPage });
    const indexPath = path.join(frontendRoot, startPage);
    const frontendBaseUrl = typeof options.getFrontendBaseUrl === "function"
      ? options.getFrontendBaseUrl()
      : "";
    if (frontendBaseUrl) {
      // Served by the local gateway: same origin for pages and /api/*, and
      // the real apiBase is inlined into the HTML. Falls back to file below.
      const indexUrl = `${String(frontendBaseUrl).replace(/\/+$/, "")}/${startPage}`;
      logDesktop(`[desktop] loading frontend via gateway ${indexUrl}`);
      mainWindow.loadURL(indexUrl);
    } else {
      logDesktop(`[desktop] loading frontend index=${indexPath}`);
      mainWindow.loadFile(indexPath);
    }

    mainWindow.on("close", (event) => {
      if (isQuitting()) {
        return;
      }
      event.preventDefault();
      hideMainWindowToTray();
    });

    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      logDesktop(`[desktop][renderer][level=${level}] ${sourceId || "unknown"}:${line || 0} ${message || ""}`);
    });

    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      const detail = `code=${errorCode} url=${validatedURL || "unknown"} error=${errorDescription || "unknown"}`;
      logDesktopError(`[desktop] renderer load failed: ${detail}`);
      dialog.showErrorBox(`${PRODUCT_NAME} 页面加载失败`, detail);
    });

    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      const detail = `reason=${details?.reason || "unknown"} exitCode=${details?.exitCode ?? "unknown"}`;
      logDesktopError(`[desktop] renderer process gone: ${detail}`);
      dialog.showErrorBox(`${PRODUCT_NAME} 渲染进程异常退出`, detail);
    });

    mainWindow.webContents.once("did-finish-load", () => {
      logDesktop("[desktop] frontend loaded; showing main window");
      updateSplashProgress(100, "准备完成", "正在进入主界面");
      mainWindow.show();
      if (typeof options.closeSplashWindow === "function") {
        options.closeSplashWindow();
      }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      const target = `${url || ""}`.trim();
      if (!target || target === "about:blank") {
        return { action: "deny" };
      }
      // 应用内页面：在主窗口打开，禁止 shell.openExternal（否则像「乱跳浏览器」）。
      // 也不要 silent deny，否则对照阅读入口会「点了没反应」。
      try {
        const next = new URL(target);
        let current = null;
        try {
          current = new URL(mainWindow.webContents.getURL() || "http://127.0.0.1/");
        } catch {
          current = null;
        }
        const sameOrigin = current && next.origin === current.origin;
        const isAppHtml = /\/(reader|index|detail)\.html(?:[?#]|$)/i.test(next.pathname);
        const isLocalDev = /^(localhost|127\.0\.0\.1)$/i.test(next.hostname || "");
        if (next.protocol === "file:" || sameOrigin || (isLocalDev && isAppHtml)) {
          logDesktop(`[desktop] in-app navigate (no openExternal): ${target}`);
          // 主窗口内导航，保证「对照阅读」等入口可用
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(target).catch((err) => {
              logDesktopError(`[desktop] loadURL failed: ${err?.message || err}`);
            });
          }
          return { action: "deny" };
        }
        if (next.protocol === "http:" || next.protocol === "https:") {
          shell.openExternal(target);
        }
      } catch (err) {
        logDesktopError(`[desktop] windowOpenHandler parse failed: ${err?.message || err}`);
      }
      return { action: "deny" };
    });
  }




  function showExistingDesktopWindow(splashWindow) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow();
      return true;
    }
    if (splashWindow && !splashWindow.isDestroyed()) {
      if (splashWindow.isMinimized()) {
        splashWindow.restore();
      }
      splashWindow.show();
      splashWindow.focus();
      return true;
    }
    return false;
  }

  function hasLiveMainWindow() {
    return !!mainWindow && !mainWindow.isDestroyed();
  }

  function setCloseToTrayHintShown(value) {
    closeToTrayHintShown = !!value;
  }

  function resolveFrontendRoot() {
    const generatedFrontendRoot = path.join(appRoot, "app", "frontend");
    if (app.isPackaged) {
      return generatedFrontendRoot;
    }
    if (fs.existsSync(path.join(generatedFrontendRoot, "index.html"))) {
      return generatedFrontendRoot;
    }
    const sourceFrontendRoot = path.resolve(appRoot, "..", "frontend");
    if (fs.existsSync(path.join(sourceFrontendRoot, "index.html"))) {
      return sourceFrontendRoot;
    }
    return generatedFrontendRoot;
  }

  return {
    createTray,
    createWindow,
    hasLiveMainWindow,
    resolveFrontendRoot,
    resolveWindowIcon,
    setCloseToTrayHintShown,
    showExistingDesktopWindow,
    showMainWindow,
  };
}

module.exports = {
  createDesktopWindows,
};
