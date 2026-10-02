import { useEffect, useRef, useState } from "react";
import { useGlossariesController, type GlossaryDraft, type GlossaryEntryRow } from "@/features/glossaries/index.js";
import { cn } from "@/ui/lib/utils.js";
import { Button, IconButton } from "@/ui/wb/Button.js";
import { X } from "lucide-react";
import { useWorkbench } from "../context.js";
import { SETTINGS_INPUT, SettingsCard, SettingsStatus } from "./SettingsParts.js";

export function GlossarySettings() {
  const wb = useWorkbench();
  const service = wb.settingsServices().glossaries;
  const { view, handlers } = useGlossariesController({ view: service.view, open: false });
  const draft = view.draft as GlossaryDraft;
  const actions = service.view.editor.actions;
  const [enabled, setEnabled] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { let live = true; service.open().then(() => { if (live) setEnabled(service.enabled()); }).catch(() => service.view.viewPort.setStatus("术语表读取失败，请重试。", "error")); return () => { live = false; }; }, [service]);
  useEffect(() => setConfirm(false), [view.selectedId]);
  async function run(name: string) {
    setBusy(true);
    try {
      await handlers?.[name]?.(); setEnabled(service.enabled());
      const status = service.view.store.getSnapshot().status;
      if (status.tone === "error") wb.failure(new Error(status.message), () => run(name)); else wb.dismissNotice();
    } catch (error) { wb.failure(error, () => run(name)); }
    finally { setBusy(false); }
  }
  async function toggle(id: string) {
    setBusy(true);
    try { await service.enable(enabled === id ? "" : id); setEnabled(service.enabled()); }
    catch { service.view.viewPort.setStatus("默认术语表保存失败，请重试。", "error"); wb.failure(new Error("默认术语表保存失败。"), () => toggle(id)); }
    finally { setBusy(false); }
  }
  function create() { handlers?.createNew?.(); actions.updateEntryField({ index: 0, field: "level", value: "canonical" }); }
  const update = (index: number, field: keyof GlossaryEntryRow, value: string) => actions.updateEntryField({ index, field, value });
  return <>
    <div className="flex flex-wrap justify-end gap-2"><Button disabled={busy} onClick={() => void run("reload")}>刷新</Button><Button disabled={busy} onClick={create}>新建术语表</Button></div>
    <SettingsCard title="术语表" description="启用项作为翻译任务的默认术语表，一次使用一个。">
      {view.items.length ? view.items.map((item) => <div key={item.glossary_id} className={cn("wb-info-row relative flex items-center gap-3 px-3.5 py-2", item.glossary_id === view.selectedId && "bg-wb-selected")}>
        <button type="button" className="min-w-0 flex-1 text-left" disabled={busy} onClick={() => handlers?.selectGlossary?.(item.glossary_id)}><span className="block truncate">{item.name}</span><span className="text-[12px] text-wb-text-3">{item.entry_count ?? 0} 条</span></button>
        <button type="button" aria-pressed={enabled === item.glossary_id} disabled={busy} onClick={() => void toggle(item.glossary_id!)} className={cn("wb-transition rounded-full px-2.5 py-1 text-[12px]", enabled === item.glossary_id ? "bg-wb-accent-soft font-medium text-wb-text" : "bg-wb-fill text-wb-text")}>{enabled === item.glossary_id ? "已启用" : "启用"}</button>
      </div>) : <p className="m-0 p-4 text-[12px] text-wb-text-3">还没有术语表，可以新建或导入 CSV。</p>}
    </SettingsCard>
    <SettingsCard title="编辑条目">
      <div className="flex flex-wrap gap-2 p-3.5"><input aria-label="术语表名称" placeholder="术语表名称" value={draft.name} className={cn(SETTINGS_INPUT, "min-w-32 flex-1")} disabled={busy} onChange={(event) => actions.setName(event.target.value)} /><Button disabled={busy} size="sm" onClick={() => handlers?.showImport?.()}>CSV 导入</Button>{view.selectedId ? <Button size="sm" disabled={busy} onClick={() => void run("exportCurrent")}>导出 CSV</Button> : null}</div>
      <div className="wb-scroll max-h-[420px] px-3.5">
        {draft.entries.map((row, index) => <div key={index} className="border-t border-wb-line-soft py-2.5">
          <div className="flex items-center gap-2"><input aria-label={`第 ${index + 1} 条原文`} placeholder="原文" className={SETTINGS_INPUT} value={row.source} disabled={busy} onChange={(event) => update(index, "source", event.target.value)} /><span className="text-wb-text-3">→</span><input aria-label={`第 ${index + 1} 条译文`} placeholder="译文" className={SETTINGS_INPUT} value={row.target} disabled={busy} onChange={(event) => update(index, "target", event.target.value)} /><IconButton label={`删除第 ${index + 1} 条`} size="sm" disabled={busy} onClick={() => actions.removeEntryRow(index)}><X size={13} aria-hidden="true" /></IconButton></div>
          <details className="mt-1.5 text-[12px] text-wb-text-3"><summary className="cursor-pointer">匹配规则与备注</summary><div className="mt-2 grid grid-cols-2 gap-2">
            <select aria-label={`第 ${index + 1} 条类型`} className={SETTINGS_INPUT} disabled={busy} value={row.level} onChange={(event) => update(index, "level", event.target.value)}><option value="preserve">保留原词</option><option value="canonical">固定译法</option><option value="preferred">优先译法</option></select>
            <select aria-label={`第 ${index + 1} 条匹配方式`} className={SETTINGS_INPUT} disabled={busy} value={row.match_mode} onChange={(event) => update(index, "match_mode", event.target.value)}><option value="case_insensitive">忽略大小写</option><option value="exact">精确</option><option value="regex">正则</option></select>
            <input aria-label={`第 ${index + 1} 条备注`} placeholder="备注" className={cn(SETTINGS_INPUT, "col-span-2")} value={row.note} disabled={busy} onChange={(event) => update(index, "note", event.target.value)} />
          </div></details>
        </div>)}
        {!draft.entries.length ? <p className="text-[12px] text-wb-text-3">添加“原文 → 译文”条目。</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 p-3.5"><Button size="sm" disabled={busy} onClick={() => actions.addEntryRow({ level: "canonical" })}>添加条目</Button><span className="flex-1" />{view.selectedId ? <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirm(true)}>删除术语表…</Button> : null}<Button size="sm" variant="primary" disabled={busy || !draft.name.trim()} onClick={() => void run("save")}>保存术语表</Button></div>
      {confirm ? <div role="alertdialog" aria-label="确认删除术语表" className="mx-3.5 mb-3.5 rounded-xl bg-wb-panel p-3"><p className="m-0 text-[12px]">删除「{draft.name}」及其条目？</p><div className="mt-3 flex justify-end gap-2"><Button size="sm" disabled={busy} variant="ghost" onClick={() => setConfirm(false)}>取消</Button><Button size="sm" disabled={busy} variant="danger" onClick={() => { setConfirm(false); void run("deleteCurrent"); }}>确认删除术语表</Button></div></div> : null}
    </SettingsCard>
    {view.importVisible ? <SettingsCard title="CSV 导入" description="解析后会替换当前编辑条目；点击保存术语表后才写入。">
      <div className="flex flex-col gap-3 p-3.5"><input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void file.text().then(actions.setCsvText).catch(() => service.view.viewPort.setStatus("文件读取失败。", "error")); }} /><textarea aria-label="CSV 内容" disabled={busy} rows={5} value={view.csvText} onChange={(event) => actions.setCsvText(event.target.value)} className="w-full rounded-lg border-0 bg-wb-fill p-3 outline-none" /><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => input.current?.click()}>选择 CSV 文件…</Button><span className="flex-1" /><Button size="sm" variant="ghost" disabled={busy} onClick={() => handlers?.hideImport?.()}>取消</Button><Button size="sm" disabled={busy} onClick={() => void run("applyImport")}>导入条目</Button></div></div>
    </SettingsCard> : null}
    <SettingsStatus message={view.status.message} tone={view.status.tone} />
  </>;
}
