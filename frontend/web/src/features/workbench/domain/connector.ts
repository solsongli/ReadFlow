export type ConnectorConnection = {
  status: "listening" | "busy" | "disabled" | "error";
  port: number | null; occupant: string | null; message?: string;
};
export type ConnectorPreferences = { enabled: boolean; overridden: boolean; effectivePort: number | null; restartRequired: boolean };

function portNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1024 && value <= 65535 ? value : null;
}

export function connectorConnection(value: unknown): ConnectorConnection {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const compatible = { experimental: "listening", coexist: "busy", unsupported: "error" } as const;
  const status = typeof raw.status === "string" ? compatible[raw.status as keyof typeof compatible] ?? raw.status : "";
  const port = portNumber(raw.port);
  if (!["listening", "busy", "disabled", "error"].includes(status) || (status === "listening" && port == null)) {
    return { status: "error", port, occupant: null, message: "无法读取 Connector 状态，请重试。" };
  }
  return { status: status as ConnectorConnection["status"], port,
    occupant: typeof raw.occupant === "string" ? raw.occupant.slice(0, 240) : null,
    message: typeof raw.message === "string" ? raw.message.slice(0, 240) : undefined };
}

export function connectorPreferences(value: unknown): ConnectorPreferences {
  if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).enabled !== "boolean") {
    throw new Error("Connector 设置读取失败，请重试。");
  }
  const raw = value as Record<string, unknown>;
  return { enabled: raw.enabled as boolean, overridden: raw.overridden === true,
    effectivePort: portNumber(raw.effectivePort), restartRequired: raw.restartRequired === true };
}

export function connectorStatusText(value: ConnectorConnection): string {
  switch (value.status) {
    case "listening": return `正在接收 · 127.0.0.1:${value.port}`;
    case "busy": return "端口已被占用（Zotero 可能正在运行），未启用";
    case "disabled": return "已关闭";
    case "error": return `出错：${value.message || "接收服务暂时不可用，请重试。"}`;
  }
}
