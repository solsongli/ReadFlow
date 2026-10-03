const PORT_VARIABLE = "RETAIN_PDF_RESEARCH_CONNECTOR_PORT";

function resolveConnectorPort(config, env = {}) {
  const overridden = Object.hasOwn(env, PORT_VARIABLE);
  const value = overridden ? String(env[PORT_VARIABLE] ?? "").trim() : config.zoteroConnector?.enabled === false ? "" : "23119";
  if (!value) return { port: null, overridden };
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1024 || port > 65535) {
    return { port: null, overridden, message: "Connector 启动端口须为 1024–65535 的整数。" };
  }
  return { port, overridden };
}

function occupantDescription(occupant) {
  if (!occupant) return null;
  const image = typeof occupant.image === "string" ? occupant.image.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 120) : "";
  const pid = /^\d+$/.test(String(occupant.pid)) ? String(occupant.pid) : "";
  return image ? `${image}${pid ? `（PID ${pid}）` : ""}` : pid ? `进程 PID ${pid}` : null;
}

function createConnectorSettings({ app, loadDesktopConfig, saveDesktopConfig, canConnectToPort, getPortOccupant, env = process.env }) {
  let startupPreference = null;
  let startupChoice = null;
  let restarting = false;

  function preferences(config = loadDesktopConfig()) {
    const choice = startupChoice || resolveConnectorPort(config, env);
    const enabled = config.zoteroConnector?.enabled !== false;
    return { enabled, overridden: choice.overridden, effectivePort: choice.port,
      restartRequired: startupPreference !== null && enabled !== startupPreference };
  }

  async function prepare() {
    const config = loadDesktopConfig();
    startupPreference = config.zoteroConnector?.enabled !== false;
    startupChoice = resolveConnectorPort(config, env);
    const { port, message } = startupChoice;
    const state = { status: message ? "error" : "disabled", port, occupant: null, ...(message ? { message } : {}) };
    if (port === null) return { connectorPort: null, connectorState: state };
    try {
      if (await canConnectToPort("127.0.0.1", port)) {
        let occupant = null;
        try { occupant = occupantDescription(await getPortOccupant("127.0.0.1", port)); } catch { /* Identification is optional. */ }
        return { connectorPort: null, connectorState: { ...state, status: "busy", occupant } };
      }
      // Python still binds exclusively and handles a listener appearing after this probe.
      return { connectorPort: port, connectorState: state };
    } catch {
      return { connectorPort: null, connectorState: { ...state, status: "error", message: "无法检查 Connector 接收端口，请重启后重试。" } };
    }
  }

  function save(enabled) {
    if (typeof enabled !== "boolean") throw new Error("Connector 开关必须是布尔值。");
    return preferences(saveDesktopConfig({ zoteroConnector: { enabled } }));
  }

  function restart() {
    if (restarting) return;
    app.relaunch();
    restarting = true;
    // before-quit waits for T7's owned-process cleanup before the final quit.
    app.quit();
  }

  return { preferences, prepare, save, restart };
}

module.exports = { createConnectorSettings, resolveConnectorPort };
