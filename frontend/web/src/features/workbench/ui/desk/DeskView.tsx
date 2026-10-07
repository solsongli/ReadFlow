import { ReviewEntry } from "@/features/flashcards/index.js";
import { TodoPanel } from "@/features/todos/index.js";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/ui/wb/Button.js";
import { deskSubtitle } from "../../domain/desk.js";
import { useWb, useWorkbench } from "../context.js";
import { ContinueReading, RecentAnnotations, ToRead } from "./DeskPanels.js";
import { LibraryOverview } from "./LibraryOverview.js";
import { TranslationPanel } from "./TranslationPanel.js";

const MORE_KEY = "readflow.desk.more";

export function DeskView() {
  const wb = useWorkbench();
  const { status, error, data: desk } = useWb((state) => state.desk);
  const unread = useWb((state) => state.list.result?.counts.unread);
  const [more, setMore] = useState(() => {
    try {
      return localStorage.getItem(MORE_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => { void wb.refreshDesk(); void wb.refreshJobs(); }, [wb]);
  const search = useCallback(
    async (query: string, signal: AbortSignal) =>
      (await wb.api.list({ view: "all", query, sort: "added", order: "desc" }, signal)).items.map((row) => ({ id: row.id, title: row.title })),
    [wb],
  );
  const open = useCallback((id: string) => void wb.openReader(id), [wb]);
  const toggleMore = () => setMore((value) => {
    try { localStorage.setItem(MORE_KEY, value ? "0" : "1"); } catch { /* per-window convenience only */ }
    return !value;
  });
  return (
    <div className="wb-scroll @container min-h-0 flex-1 bg-wb-desk-bg">
      <div className="mx-auto flex w-full max-w-[1230px] flex-col gap-[1.125rem] px-5 pb-8 pt-2 @min-[850px]:px-10">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[1.875rem] font-bold leading-[1.15] tracking-[-0.025em]">书桌</h1>
          <p className="m-0 text-[0.875rem] text-wb-text-3">{deskSubtitle(desk?.today)}</p>
        </div>
        {status === "error" ? <div role="status" className="flex items-center gap-3 rounded-xl bg-wb-desk-card p-3 text-wb-text-3"><span className="flex-1">{error || "书桌暂时没有加载出来。"}</span><Button onClick={() => void wb.refreshAll()}>重试</Button></div> : null}
        {status === "loading" && !desk ? <p role="status" className="m-0 text-[0.75rem] text-wb-text-3">正在整理书桌…</p> : null}
        <div className="grid grid-cols-12 items-start gap-3.5">
          <TranslationPanel translation={desk?.translation} className="col-span-12 @min-[850px]:col-span-5" />
          <TodoPanel search={search} open={open} className="col-span-12 @min-[850px]:col-span-7" />
          <ContinueReading rows={desk?.continue_reading ?? []} />
        </div>
        <section aria-label="今日复习" className="rounded-xl bg-wb-desk-card px-2 py-1"><ReviewEntry widget /></section>
        <section aria-label="更多" className="flex flex-col gap-3.5">
          <button type="button" aria-expanded={more} onClick={toggleMore} className="flex items-center gap-1.5 self-start border-0 bg-transparent p-0 text-[0.8125rem] text-wb-text-3 hover:text-wb-text">
            {more ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}更多：最近批注、待读、文献库概览
          </button>
          {more ? <div className="grid grid-cols-12 items-stretch gap-3.5">
            <RecentAnnotations notes={desk?.recent_annotations ?? []} />
            <ToRead rows={desk?.to_read ?? []} count={unread} total={desk?.total} />
            <LibraryOverview desk={desk} />
          </div> : null}
        </section>
      </div>
    </div>
  );
}
