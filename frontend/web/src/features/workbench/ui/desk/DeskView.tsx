import { ReviewEntry } from "@/features/flashcards/index.js";
import { useEffect } from "react";
import { Button } from "@/ui/wb/Button.js";
import { deskSubtitle } from "../../domain/desk.js";
import { useWb, useWorkbench } from "../context.js";
import { ContinueReading, RecentAnnotations, ToRead } from "./DeskPanels.js";
import { LibraryOverview } from "./LibraryOverview.js";
import { QuickStart } from "./QuickStart.js";
import { TranslationPanel } from "./TranslationPanel.js";

export function DeskView() {
  const wb = useWorkbench();
  const { status, error, data: desk } = useWb((state) => state.desk);
  const unread = useWb((state) => state.list.result?.counts.unread);
  useEffect(() => { void wb.refreshDesk(); void wb.refreshJobs(); }, [wb]);
  return (
    <div className="wb-scroll @container min-h-0 flex-1 bg-wb-desk-bg">
      <div className="mx-auto flex w-full max-w-[1230px] flex-col gap-[1.125rem] px-5 pb-8 pt-2 @min-[850px]:px-10">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[1.875rem] font-bold leading-[1.15] tracking-[-0.025em]">书桌</h1>
          <p className="m-0 text-[0.875rem] text-wb-text-3">{deskSubtitle(desk?.today)}</p>
        </div>
        <QuickStart />
        <section className="rounded-xl bg-wb-desk-card p-3"><ReviewEntry widget /></section>
        {status === "error" ? <div role="status" className="flex items-center gap-3 rounded-xl bg-wb-desk-card p-3 text-wb-text-3"><span className="flex-1">{error || "书桌暂时没有加载出来。"}</span><Button onClick={() => void wb.refreshAll()}>重试</Button></div> : null}
        {status === "loading" && !desk ? <p role="status" className="m-0 text-[0.75rem] text-wb-text-3">正在整理书桌…</p> : null}
        <div className="grid grid-cols-12 items-stretch gap-3.5">
          <ContinueReading rows={desk?.continue_reading ?? []} />
          <TranslationPanel translation={desk?.translation} />
          <RecentAnnotations notes={desk?.recent_annotations ?? []} />
          <ToRead rows={desk?.to_read ?? []} count={unread} total={desk?.total} />
          <LibraryOverview desk={desk} />
        </div>
      </div>
    </div>
  );
}
