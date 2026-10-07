import { Languages } from "lucide-react";
import { translationProgress } from "../../domain/translation.js";
import type { DeskTranslation } from "@/platform/contracts/workbench.js";
import { Button } from "@/ui/wb/Button.js";
import { mailDate } from "../../domain/format.js";
import { progressPercent } from "../../domain/presentation.js";
import { useWorkbench } from "../context.js";
import { EmptyLine, Panel } from "./DeskPanels.js";
import { PaperLauncher } from "./PaperLauncher.js";

export function TranslationPanel({ translation, className }: { translation?: DeskTranslation; className?: string }) {
  const wb = useWorkbench();
  const running = translation?.running[0];
  const percent = progressPercent(running?.percent);
  const recent = translation?.recent_done;
  return (
    <Panel title="翻译 PDF" className={className} aside={translation ? <span className="text-[0.75rem] text-wb-text-3">已译 {translation.done} 篇</span> : null}>
      <PaperLauncher kind="translate"><Button variant="primary" className="h-10 w-full text-[0.875rem]" icon={<Languages size={16} aria-hidden="true" />}>翻译 PDF</Button></PaperLauncher>
      {running ? <div className="flex items-center gap-3.5">
        <svg role="progressbar" aria-label="全文翻译进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent == null ? "进度待更新" : `${percent}%`} width="58" height="58" viewBox="0 0 58 58" className="shrink-0">
          <circle cx="29" cy="29" r="24" fill="none" stroke="currentColor" strokeWidth="5" className="text-wb-fill" />
          <circle cx="29" cy="29" r="24" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(2, percent ?? 25)} 100`} transform="rotate(-90 29 29)" className="text-wb-text-3" />
        </svg>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="wb-truncate text-[0.84375rem] font-semibold" title={running.title}>{running.title_translated || running.title}</span>
          <span className="text-[0.75rem] text-wb-text-3">{translationProgress({ status: "running", percent, stage: running.stage })}</span>
          <span className="text-[0.75rem] text-wb-text-3">排队 {translation?.queued ?? 0} 篇{translation && translation.running.length > 1 ? ` · 共 ${translation.running.length} 篇进行中` : ""}</span>
        </div>
      </div> : <EmptyLine>{translation ? translation.queued ? `${translation.queued} 篇文献正在排队。` : "没有正在进行的翻译任务。" : "翻译状态待更新。"}</EmptyLine>}
      {recent ? <div className="flex items-center justify-between gap-2 border-t border-wb-line-soft pt-2.5 text-[0.75rem]">
        <span className="wb-truncate text-wb-text-3" title={`${recent.title} · ${recent.finished_at}`}>最近完成：{recent.title} · {mailDate(recent.finished_at)}</span>
        <button type="button" className="shrink-0 hover:underline" onClick={() => void wb.openReader(recent.item_id)}>对照阅读</button>
      </div> : null}
    </Panel>
  );
}
