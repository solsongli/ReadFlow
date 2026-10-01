import type { ReactNode } from "react";
import { Languages, Link2, ScanText } from "lucide-react";
import type { WorkbenchDesk, WorkbenchNote, WorkbenchRow } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { Button } from "@/ui/wb/Button.js";
import { ProgressBar } from "@/ui/wb/Segmented.js";
import { readingPercent, relativeTime, shortAuthors, SOURCE_LABEL } from "../../domain/format.js";
import { useWorkbench } from "../context.js";

export function Panel({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("flex flex-col overflow-hidden rounded-lg border border-wb-line bg-wb-panel", className)}>
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-wb-line-soft px-3.5">
        <h2 className="m-0 text-[12px] font-semibold">{title}</h2>
        <span className="flex-1" />
        {aside}
      </div>
      {children}
    </section>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="m-0 px-3.5 py-4 text-[12px] leading-relaxed text-wb-text-3">{children}</p>;
}

function Title({ row }: { row: WorkbenchRow }) {
  return (
    <span className="flex min-w-0 flex-col gap-px">
      <span className="wb-truncate text-[13px]" title={row.title}>{row.title}</span>
      <span className={cn("wb-truncate text-[12px]", row.title_translated ? "text-wb-text-2" : "text-wb-text-4")}>
        {row.title_translated || [shortAuthors(row.authors), row.venue_short, row.year].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

export function ContinueReading({ rows }: { rows: WorkbenchRow[] }) {
  const wb = useWorkbench();
  return (
    <Panel title="继续阅读">
      {rows.length === 0 ? <EmptyLine>还没有打开过文献。在文献库里选中一篇，按 Enter 开始阅读。</EmptyLine> : null}
      {rows.map((row) => {
        const percent = readingPercent(row);
        return (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_150px_76px_auto] items-center gap-x-3.5 border-b border-wb-line-soft px-3.5 py-2 last:border-b-0">
            <Title row={row} />
            <span className="flex items-center gap-2">
              <ProgressBar value={percent ?? 0} className="flex-1" label="阅读进度" />
              <span className="wb-numeric w-9 text-right text-[12px] text-wb-text-2">{percent != null ? `${percent}%` : "—"}</span>
            </span>
            <span className="text-[12px] text-wb-text-3">{relativeTime(row.last_opened_at)}</span>
            <Button size="sm" onClick={() => void wb.openReader(row.id)}>继续</Button>
          </div>
        );
      })}
    </Panel>
  );
}

const HL: Record<string, string> = {
  yellow: "bg-wb-hl-yellow",
  green: "bg-wb-hl-green",
  blue: "bg-wb-hl-blue",
  red: "bg-wb-hl-red",
  purple: "bg-wb-hl-purple",
};

function highlightClass(color: string): string {
  const name = Object.keys(HL).find((key) => color.toLowerCase().includes(key));
  return name ? HL[name] : "bg-wb-hl-yellow";
}

export function RecentAnnotations({ notes }: { notes: WorkbenchNote[] }) {
  const wb = useWorkbench();
  return (
    <Panel title="最近批注">
      {notes.length === 0 ? <EmptyLine>阅读时划线或添加批注后，会按时间出现在这里，点一下回到原文。</EmptyLine> : null}
      {notes.map((note) => (
        <button
          key={note.id}
          type="button"
          onClick={() => void wb.openReader(note.item_id)}
          className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-x-3 border-0 border-b border-wb-line-soft bg-transparent px-3.5 py-2.5 text-left last:border-b-0 hover:bg-wb-hover"
        >
          <span aria-hidden="true" className={cn("mt-1.5 h-2.5 w-2.5 rounded-sm", highlightClass(note.color))} />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="line-clamp-2 font-wb-serif text-[13.5px] leading-normal text-wb-text">{note.quote}</span>
            {note.body ? <span className="line-clamp-1 text-[12px] text-wb-text-2">{note.body}</span> : null}
          </span>
          <span className="text-right text-[11.5px] leading-normal text-wb-text-3">
            <span className="block max-w-[180px] wb-truncate">{note.item_title}</span>
            {note.page_idx != null ? <span className="wb-numeric">p.{note.page_idx + 1} · </span> : null}
            {relativeTime(note.created_at)}
          </span>
        </button>
      ))}
    </Panel>
  );
}

export function RecentItems({ rows }: { rows: WorkbenchRow[] }) {
  const wb = useWorkbench();
  return (
    <Panel title="最近添加">
      {rows.length === 0 ? <EmptyLine>还没有文献。</EmptyLine> : null}
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => { wb.browse({}); wb.select(row.id); }}
          className="grid h-[34px] grid-cols-[minmax(0,1fr)_128px_88px] items-center gap-x-3.5 border-0 border-b border-wb-line-soft bg-transparent px-3.5 text-left last:border-b-0 hover:bg-wb-hover"
        >
          <span className="wb-truncate">{row.title}</span>
          <span className="text-[12px] text-wb-text-2">{SOURCE_LABEL[row.source] ?? row.source}</span>
          <span className="whitespace-nowrap text-right text-[12px] text-wb-text-3">{relativeTime(row.created_at)}</span>
        </button>
      ))}
    </Panel>
  );
}

export function Attention({ attention }: { attention: WorkbenchDesk["attention"] }) {
  const wb = useWorkbench();
  const entries = [
    { key: "doi", count: attention.missing_doi.length, icon: Link2, title: "篇缺少 DOI", hint: "补全 DOI 后引用和查重更可靠；可在详情里直接填写。", action: "查看", ids: attention.missing_doi },
    { key: "ocr", count: attention.needs_ocr.length, icon: ScanText, title: "篇是扫描版 PDF", hint: "本地 OCR 后才能检索、按文字批注和翻译。", action: "查看", ids: attention.needs_ocr },
    { key: "title", count: attention.untranslated_titles.length, icon: Languages, title: "篇还没有中文题名", hint: "可在详情里手动填写；自动翻译将在翻译模块接入后提供。", action: "查看", ids: attention.untranslated_titles },
  ].filter((entry) => entry.count > 0);
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <Panel
      title="需要处理"
      aside={total ? <span className="wb-numeric rounded bg-wb-warn-soft px-1.5 text-[11.5px] leading-[18px] text-wb-warn">{entries.length}</span> : null}
    >
      {entries.length === 0 ? <EmptyLine>没有待处理的问题。</EmptyLine> : null}
      {entries.map(({ key, count, icon: Icon, title, hint, action, ids }) => (
        <div key={key} className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-wb-line-soft px-3.5 py-2 last:border-b-0">
          <Icon size={15} aria-hidden="true" className="text-wb-text-2" />
          <span className="flex min-w-0 flex-col">
            <span><span className="wb-numeric">{count}</span> {title}</span>
            <span className="text-[12px] text-wb-text-3">{hint}</span>
          </span>
          <Button size="sm" onClick={() => { wb.browse({}); if (ids[0]) wb.select(ids[0]); }}>{action}</Button>
        </div>
      ))}
    </Panel>
  );
}

export function ToRead({ rows }: { rows: WorkbenchRow[] }) {
  const wb = useWorkbench();
  return (
    <Panel title="待读" aside={<button type="button" onClick={() => wb.browse({ view: "unread" })} className="border-0 bg-transparent p-0 text-[12px] text-wb-accent">全部</button>}>
      {rows.length === 0 ? <EmptyLine>没有待读的文献。新导入的文献会自动排在这里。</EmptyLine> : null}
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-wb-line-soft px-3.5 py-1.5 last:border-b-0">
          <Title row={row} />
          <Button size="sm" variant="ghost" className="text-wb-accent" onClick={() => void wb.openReader(row.id)}>开始</Button>
        </div>
      ))}
    </Panel>
  );
}

export function RecentNotes({ notes }: { notes: WorkbenchNote[] }) {
  const wb = useWorkbench();
  return (
    <Panel title="最近笔记">
      {notes.length === 0 ? <EmptyLine>还没有独立笔记。</EmptyLine> : null}
      {notes.map((note) => (
        <button
          key={note.id}
          type="button"
          onClick={() => { wb.browse({}); wb.select(note.item_id); }}
          className="flex flex-col gap-0.5 border-0 border-b border-wb-line-soft bg-transparent px-3.5 py-2 text-left last:border-b-0 hover:bg-wb-hover"
        >
          <span className="flex justify-between gap-2">
            <span className="wb-truncate font-medium">{note.item_title || "笔记"}</span>
            <span className="shrink-0 text-[12px] text-wb-text-3">{relativeTime(note.updated_at)}</span>
          </span>
          <span className="line-clamp-1 text-[12px] text-wb-text-2">{note.body}</span>
        </button>
      ))}
    </Panel>
  );
}
