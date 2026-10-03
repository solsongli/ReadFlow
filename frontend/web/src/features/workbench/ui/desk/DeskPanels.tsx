import type { ReactNode } from "react";
import type { WorkbenchNote, WorkbenchRow } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { mailDate, readingPercent } from "../../domain/format.js";
import { rowMetadata } from "../../domain/presentation.js";
import { useWorkbench } from "../context.js";

export function Panel({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col gap-3 rounded-2xl bg-wb-desk-card px-[1.125rem] py-4 shadow-wb-card", className)}>
      <div className="flex items-baseline justify-between gap-2"><h2 className="m-0 text-[0.9375rem] font-semibold tracking-[-0.012em]">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="m-0 py-5 text-[0.78125rem] leading-relaxed text-wb-text-3">{children}</p>;
}

export function ContinueReading({ rows }: { rows: WorkbenchRow[] }) {
  const wb = useWorkbench();
  return (
    <Panel title="继续阅读" className="col-span-12 @min-[850px]:col-span-8" aside={<button type="button" onClick={() => wb.browse({ view: "recent", query: "" })} className="text-[0.75rem] text-wb-text-3 hover:text-wb-text">全部</button>}>
      {rows.length ? <div className="grid gap-3 @min-[650px]:grid-cols-3">
        {rows.slice(0, 3).map((row) => {
          const percent = readingPercent(row);
          const meta = [row.venue_short, row.year].filter(Boolean).join(" · ");
          return (
            <button key={row.id} type="button" onClick={() => void wb.openReader(row.id)} className="wb-transition flex min-h-[10.375rem] min-w-0 flex-col gap-1.5 rounded-xl border-0 bg-wb-desk-inset p-3.5 text-left hover:bg-wb-hover">
              {meta ? <span className="wb-truncate max-w-full text-[0.71875rem] text-wb-text-3">{meta}</span> : null}
              <span className="line-clamp-3 text-[0.84375rem] font-semibold leading-[1.32] tracking-[-0.01em]" title={row.title}>{row.title}</span>
              {row.title_translated ? <span className="wb-truncate max-w-full text-[0.75rem] text-wb-text-2" title={row.title_translated}>{row.title_translated}</span> : null}
              <span className="mt-auto flex w-full items-center gap-2 pt-2 text-[0.71875rem] text-wb-text-3">
                {percent != null ? <span role="progressbar" aria-label={`${row.title} 阅读进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1 flex-1 overflow-hidden rounded-full bg-wb-fill"><span className="block h-full rounded-full bg-wb-text-3" style={{ width: `${percent}%` }} /></span> : <span className="flex-1">进度待同步</span>}
                <span className="shrink-0" title={row.last_opened_at ?? undefined}>{percent != null ? `${percent}%` : mailDate(row.last_opened_at)}</span>
              </span>
            </button>
          );
        })}
      </div> : <EmptyLine>打开一篇文献，阅读记录会留在这里。</EmptyLine>}
    </Panel>
  );
}

export function RecentAnnotations({ notes }: { notes: WorkbenchNote[] }) {
  const wb = useWorkbench();
  return (
    <Panel title="最近批注" className="col-span-12 @min-[650px]:col-span-6" aside={<button type="button" onClick={() => void wb.notes.open()} className="text-[0.75rem] text-wb-text-3 hover:text-wb-text">全部</button>}>
      {notes.length ? <div className="flex flex-col">
        {notes.slice(0, 3).map((note) => (
          <button key={note.id} type="button" onClick={() => void wb.openReader(note.item_id, { attachmentId: note.attachment_id ?? undefined, page: note.page_idx == null ? undefined : note.page_idx + 1 })} className="wb-transition flex gap-2.5 border-0 border-t border-wb-line-soft bg-transparent py-2.5 text-left first:border-0 hover:bg-wb-hover">
            <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-wb-text-3" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="line-clamp-2 font-wb-serif text-[0.875rem] leading-[1.45]">{note.quote || note.body || "PDF 选区批注"}</span>
              <span className="wb-truncate text-[0.75rem] text-wb-text-3">{[note.item_title, note.page_idx != null ? `第 ${note.page_idx + 1} 页` : "", mailDate(note.created_at)].filter(Boolean).join(" · ")}</span>
            </span>
          </button>
        ))}
      </div> : <EmptyLine>阅读时留下批注，就能从这里回到原文。</EmptyLine>}
    </Panel>
  );
}

export function ToRead({ rows, count, total }: { rows: WorkbenchRow[]; count?: number; total?: number }) {
  const wb = useWorkbench();
  return (
    <Panel title="待读" className="col-span-12 @min-[650px]:col-span-6 @min-[850px]:col-span-3" aside={<button type="button" onClick={() => wb.browse({ view: "unread", query: "" })} className="text-[0.75rem] text-wb-text-3 hover:text-wb-text">{count == null ? "全部" : `${count} 篇`}</button>}>
      {rows.length ? <div className="flex flex-col">
        {rows.slice(0, 4).map((row) => (
          <button key={row.id} type="button" onClick={() => void wb.openReader(row.id)} className="wb-transition flex min-w-0 flex-col gap-1 border-0 border-t border-wb-line-soft bg-transparent py-2 text-left first:border-0 hover:bg-wb-hover">
            <span className="wb-truncate max-w-full text-[0.8125rem] font-semibold" title={row.title}>{row.title}</span>
            {rowMetadata(row) ? <span className="wb-truncate max-w-full text-[0.75rem] text-wb-text-3">{rowMetadata(row)}</span> : null}
          </button>
        ))}
      </div> : <EmptyLine>{total === 0 ? "导入文献后，可以在这里安排阅读。" : "待读清单已清空。"}</EmptyLine>}
    </Panel>
  );
}
