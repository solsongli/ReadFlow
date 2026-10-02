function installDesktopShutdown({ app, processEvents = process, markStopping, cleanup, logger = console }) {
  let shutdown = null;
  let complete = false;
  const signals = ["SIGTERM", "SIGINT", "SIGHUP"];

  function requestShutdown() {
    if (shutdown) return shutdown;
    markStopping();
    shutdown = Promise.resolve().then(cleanup).catch((error) => {
      logger.warn(`[desktop] shutdown cleanup failed: ${error.message}`);
    }).finally(() => {
      complete = true;
      app.quit();
    });
    return shutdown;
  }

  function beforeQuit(event) {
    if (complete) return;
    event.preventDefault();
    void requestShutdown();
  }

  app.on("before-quit", beforeQuit);
  for (const signal of signals) processEvents.on(signal, requestShutdown);
  function dispose() {
    app.removeListener("before-quit", beforeQuit);
    for (const signal of signals) processEvents.removeListener(signal, requestShutdown);
  }
  app.once("will-quit", dispose);
  return { requestShutdown, dispose };
}

module.exports = { installDesktopShutdown };
