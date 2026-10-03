import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import type { WorkbenchNoteKind } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { Button, IconButton } from "@/ui/wb/Button.js";
import { mailDate } from "../../domain/format.js";
import { NOTE_DATE_GROUPS, noteDateGroup, noteSummary } from "../../domain/notes-format.js";
import { useWb, useWorkbench } from "../context.js";
import { NoteDot } from "./NoteQuote.js";

export function NotesList() {
  const wb = useWorkbench();
  const state = useWb((value) => value.notes);
  const [search, setSearch] = useState(state.query);
  useEffect(() => setSearch(state.query), [state.query]);
  useEffect(() => {
    if (search === state.query) return;
    const timer = setTimeout(() => { void wb.notes.filters({ query: search }); }, 180);
    return () => clearTimeout(timer);
  }, [search, state.query, wb]);
  const items = state.result?.items ?? [];
  return <aside aria-label="笔记列表" className="flex w-[300px] max-w-[42%] min-w-[230px] shrink-0 flex-col border-r border-wb-line-soft bg-wb-panel">
    <div className="flex shrink-0 flex-col gap-3 px-3 py-3.5">
      {state.itemId ? <div className="flex min-w-0 items-center gap-1"><span className="line-clamp-2 flex-1 text-[0.75rem] text-wb-text-3">《{state.itemTitle}》的笔记</span><IconButton label="清除文献过滤" size="xs" onClick={() => void wb.notes.filters({ itemId: null, itemTitle: "" })}><X size={13} aria-hidden="true" /></IconButton></div> : null}
      <label className="flex h-8 items-center gap-2 rounded-lg bg-wb-fill px-2.5 text-wb-text-3"><Search size={14} aria-hidden="true" /><input data-notes-search aria-label="搜索笔记" maxLength={500} placeholder="搜索笔记、引文或文献" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-[0.75rem] text-wb-text outline-none" /></label>
      <div role="group" aria-label="笔记类型" className="flex rounded-lg bg-wb-fill p-0.5">{([["all", "全部"], ["notes", "笔记"], ["annotations", "批注"]] as const).map(([kind, label]) => <button key={kind} type="button" aria-pressed={state.kind === kind} onClick={() => void wb.notes.filters({ kind: kind as WorkbenchNoteKind })} className={cn("wb-transition h-7 flex-1 rounded-md text-[0.75rem]", state.kind === kind ? "bg-wb-panel font-medium shadow-wb-card" : "text-wb-text-3")}>{label}</button>)}</div>
    </div>
    <div className="wb-scroll min-h-0 flex-1 px-2" aria-busy={state.status === "loading"}>
      {NOTE_DATE_GROUPS.map((group) => {
        const rows = items.filter((note) => noteDateGroup(note.updated_at) === group);
        return rows.length ? <section key={group} aria-label={group}><h2 className="sticky top-0 z-10 m-0 bg-wb-sticky px-3 py-2 text-[0.75rem] font-semibold text-wb-text-3 backdrop-blur-sm">{group}</h2>
          {rows.map((note) => { const summary = noteSummary(note); return <button key={note.id} type="button" data-note-id={note.id} aria-current={state.draft?.note.id === note.id ? "true" : undefined} onClick={() => void wb.notes.select(note)} className={cn("wb-transition my-1 flex w-full min-w-0 flex-col gap-1.5 rounded-xl px-3 py-3 text-left", state.draft?.note.id === note.id ? "bg-wb-accent-soft" : "hover:bg-wb-hover")}>
            <span className="wb-truncate w-full text-[0.84375rem] font-semibold" title={summary.title}>{summary.title}</span>
            <span className="wb-truncate w-full text-[0.75rem] text-wb-text-3">{mailDate(note.updated_at)}{summary.excerpt ? `　${summary.excerpt}` : ""}</span>
            <span className="flex w-full min-w-0 items-center gap-1.5 text-[0.71875rem] text-wb-text-3">{note.kind === "annotation" ? <NoteDot color={note.color} /> : null}<span className="wb-truncate flex-1" title={note.item_title_translated || note.item_title}>{note.item_title_translated || note.item_title}</span>{note.page_idx != null ? <span className="shrink-0">第 {note.page_idx + 1} 页</span> : null}</span>
          </button>; })}</section> : null;
      })}
      {state.status === "error" ? <p role="alert" className="px-3 text-[0.75rem] text-wb-text-3">{state.error} <Button size="sm" onClick={() => void wb.notes.refresh()}>重试</Button></p> : !items.length ? <p className="px-3 py-4 text-[0.75rem] text-wb-text-3">{state.status === "loading" ? "正在读取笔记…" : "还没有符合条件的笔记。"}</p> : null}
      {state.result && state.result.total > items.length ? <Button className="my-3 w-full" disabled={state.status === "loading"} onClick={() => void wb.notes.refresh(true)}>加载更多（{items.length} / {state.result.total}）</Button> : null}
    </div>
    <p className="m-0 shrink-0 border-t border-wb-line-soft px-4 py-3 text-[0.71875rem] text-wb-text-3">笔记 {state.result?.counts.notes ?? "…"} 条 · 批注 {state.result?.counts.annotations ?? "…"} 条</p>
  </aside>;
}
