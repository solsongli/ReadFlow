import { useEffect, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { librarySettingsStats } from "../../domain/settings.js";
import { useWorkbench } from "../context.js";
import { ImportMenu } from "../import/ImportMenu.js";
import { SettingsCard, SettingsStatus } from "./SettingsParts.js";
import { ConnectorSettings } from "./ConnectorSettings.js";

export function LibrarySettings() {
  const wb = useWorkbench();
  const [stats, setStats] = useState<ReturnType<typeof librarySettingsStats> | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    wb.api.list({ view: "all", sort: "added", order: "desc" }, abort.signal).then((value) => { if (!abort.signal.aborted) { setStats(librarySettingsStats(value.items, value.groups.length)); setError(""); } }).catch(() => { if (!abort.signal.aborted) setError("文献库统计读取失败。"); });
    return () => abort.abort();
  }, [attempt, wb]);
  return <>
    <ConnectorSettings />
    <SettingsCard title="文献库统计"><div className="grid grid-cols-2 gap-y-5 p-5 sm:grid-cols-4">{[["文献", stats?.papers], ["附件", stats?.attachments], ["笔记与批注", stats?.notes], ["分组", stats?.groups]].map(([label, value]) => <div key={label} className="flex flex-col gap-1"><strong className="text-[1.625rem] font-semibold tracking-[-0.03em]">{value ?? "…"}</strong><span className="text-[0.75rem] text-wb-text-3">{label}</span></div>)}</div></SettingsCard>
    {error ? <div className="flex items-center gap-3"><SettingsStatus message={error} tone="error" /><Button size="sm" onClick={() => setAttempt(attempt + 1)}>重试</Button></div> : null}
    <SettingsCard title="导入"><div className="flex flex-wrap items-center justify-between gap-3 p-3.5"><span className="text-[0.75rem] text-wb-text-3">保留现有文献，识别同一来源的重复条目。</span><ImportMenu onImported={() => setAttempt((value) => value + 1)}><Button>从 Zotero / CSL JSON 导入…</Button></ImportMenu></div></SettingsCard>
    <SettingsCard title="回收站" description="回收站支持恢复文献，暂不支持永久清空。"><div className="flex items-center justify-between p-3.5"><span>查看与恢复文献</span><Button size="sm" onClick={() => wb.browse({ view: "trash", query: "" })}>打开回收站</Button></div></SettingsCard>
  </>;
}
