import { useEffect, useState } from "react";
import { cn } from "@/ui/lib/utils.js";
import { Button } from "@/ui/wb/Button.js";
import { connectorStatusText } from "../../domain/connector.js";
import type { createSettingsConnector } from "../../state/settings-connector.js";
import { useWorkbench } from "../context.js";
import { SettingsCard, SettingsRow, SettingsStatus } from "./SettingsParts.js";

type ConnectorState = Awaited<ReturnType<ReturnType<typeof createSettingsConnector>["load"]>>;

export function ConnectorSettings() {
  const wb = useWorkbench();
  const service = wb.settingsServices().connector;
  const [state, setState] = useState<ConnectorState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [restarting, setRestarting] = useState(false);
  useEffect(() => {
    let live = true;
    service.load().then((value) => { if (live) { setState(value); setError(value.preferenceError); } })
      .catch(() => { if (live) setError("Connector 状态读取失败，请重试。"); });
    return () => { live = false; };
  }, [service, attempt]);
  async function toggle(enabled: boolean) {
    setBusy(true); setError("");
    try {
      const preferences = await service.save(enabled);
      setState((current) => current && { ...current, preferences, preferenceError: "" });
      wb.dismissNotice();
    } catch { setError("Connector 设置保存失败，请重试。"); wb.failure(new Error("Connector 设置保存失败。"), () => toggle(enabled)); }
    finally { setBusy(false); }
  }
  async function restart() {
    setRestarting(true); setError("");
    try { await service.restart(); }
    catch { setRestarting(false); setError("无法重启 ReadFlow，请手动退出后重新打开。"); wb.failure(new Error("无法重启 ReadFlow。"), restart); }
  }
  const preferences = state?.preferences;
  return <SettingsCard title="Zotero Connector" description="在浏览器中安装 Zotero Connector 后，点保存即可把文献和 PDF 存进 ReadFlow。Zotero 桌面版运行时两者会争用同一端口。">
    {service.desktop() ? <div className="wb-info-row relative flex min-h-12 items-center justify-between gap-4 px-3.5 py-2">
      <span>接收浏览器 Zotero Connector 的保存</span>
      <button type="button" role="switch" aria-label="接收浏览器 Zotero Connector 的保存" title="接收浏览器 Zotero Connector 的保存" aria-checked={preferences?.enabled ?? false} disabled={!preferences || busy || restarting} onClick={() => void toggle(!preferences?.enabled)}
        className={cn("wb-transition inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 disabled:opacity-50", preferences?.enabled ? "justify-end bg-wb-accent" : "justify-start bg-[var(--wb-switch-track)]")}>
        <span aria-hidden="true" className="h-5 w-5 rounded-full bg-[var(--wb-switch-thumb)] shadow-wb-card" />
      </button>
    </div> : null}
    <SettingsRow label="状态"><p role="status" className="m-0 text-[0.75rem] leading-relaxed text-wb-text-3">{state ? connectorStatusText(state.connection) : "正在读取…"}</p></SettingsRow>
    {state?.connection.status === "busy" && state.connection.port ? <SettingsRow label="占用端口"><span className="text-[0.75rem] text-wb-text-3">127.0.0.1:{state.connection.port}{state.connection.occupant ? ` · ${state.connection.occupant}` : " · 未能识别占用者"}</span></SettingsRow> : null}
    {preferences?.overridden ? <p className="m-0 px-3.5 py-2 text-[0.75rem] leading-relaxed text-wb-text-3">当前由启动环境变量控制接收端口；重启也会保留该覆盖。保存的开关用于下次从应用菜单正常启动。</p> : null}
    {!service.desktop() ? <p className="m-0 px-3.5 py-2 text-[0.75rem] text-wb-text-3">请在 ReadFlow 桌面版中更改接收设置。</p> : null}
    <div className="wb-info-row relative flex flex-wrap items-center justify-between gap-3 p-3.5">
      <Button size="sm" disabled={busy || restarting} onClick={() => setAttempt((value) => value + 1)}>刷新状态</Button>
      {preferences?.restartRequired ? <div className="flex flex-wrap items-center gap-3"><span className="text-[0.75rem] text-wb-text-3">重启 ReadFlow 后生效</span><Button size="sm" variant="primary" disabled={busy || restarting} onClick={() => void restart()}>{restarting ? "正在重启…" : "立即重启"}</Button></div> : null}
      {error ? <SettingsStatus message={error} /> : null}
    </div>
  </SettingsCard>;
}
