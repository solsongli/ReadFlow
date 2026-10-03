import { researchLibraryApi } from "@/platform/api/research-library.js";
import { connectorConnection, connectorPreferences } from "../domain/connector.js";

type ConnectorBridge = { loadConnectorSettings: () => Promise<unknown>; saveConnectorSettings: (enabled: boolean) => Promise<unknown>; restartReadFlow: () => Promise<unknown> };

function desktopBridge(): ConnectorBridge | null {
  const bridge = typeof window !== "undefined" ? window.retainPdfDesktop : null;
  return bridge && [bridge.loadConnectorSettings, bridge.saveConnectorSettings, bridge.restartReadFlow].every((method) => typeof method === "function")
    ? bridge as unknown as ConnectorBridge : null;
}

export function createSettingsConnector(env: { readStatus?: () => Promise<unknown>; bridge?: () => ConnectorBridge | null } = {}) {
  const readStatus = env.readStatus ?? researchLibraryApi.connectorStatus;
  const bridge = env.bridge ?? desktopBridge;
  return {
    desktop: () => bridge() !== null,
    async load() {
      const host = bridge();
      const [connection, preferences] = await Promise.allSettled([
        Promise.resolve().then(() => readStatus()), host ? Promise.resolve().then(() => host.loadConnectorSettings()).then(connectorPreferences) : Promise.resolve(null),
      ]);
      return { connection: connectorConnection(connection.status === "fulfilled" ? connection.value : null),
        preferences: preferences.status === "fulfilled" ? preferences.value : null,
        preferenceError: preferences.status === "rejected" ? "Connector 设置读取失败，请重试。" : "" };
    },
    async save(enabled: boolean) {
      const host = bridge();
      if (!host) throw new Error("请在 ReadFlow 桌面版中更改 Connector 设置。");
      return connectorPreferences(await host.saveConnectorSettings(enabled));
    },
    async restart() {
      const host = bridge();
      if (!host) throw new Error("请在 ReadFlow 桌面版中重启应用。");
      await host.restartReadFlow();
    },
  };
}
