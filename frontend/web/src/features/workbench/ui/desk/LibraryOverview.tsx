import type { WorkbenchDesk, WorkbenchView } from "@/platform/contracts/workbench.js";
import { useWorkbench } from "../context.js";
import { Panel } from "./DeskPanels.js";

export function LibraryOverview({ desk }: { desk: WorkbenchDesk | null }) {
  const wb = useWorkbench();
  const counts = desk?.counts;
  const links: Array<{ view: WorkbenchView; label: string; count: number }> = [
    { view: "missing_doi", label: "缺少 DOI", count: desk?.attention.missing_doi.length ?? 0 },
    { view: "no_zh_title", label: "没有中文题名", count: desk?.attention.untranslated_titles.length ?? 0 },
    { view: "needs_ocr", label: "需要 OCR", count: desk?.attention.needs_ocr.length ?? 0 },
  ];
  return (
    <Panel title="文献库概览" className="col-span-12 @min-[650px]:col-span-6 @min-[850px]:col-span-3">
      <div className="flex items-baseline gap-1.5"><span className="text-[32px] font-bold leading-none tracking-[-0.03em]">{desk?.total ?? "…"}</span><span className="text-[12px] text-wb-text-3">篇文献</span></div>
      <div className="grid grid-cols-2 gap-2 text-[12px] text-wb-text-3">
        {[["已译", counts?.translated], ["分组", counts?.groups]].map(([label, value]) => <span key={label} className="flex flex-col gap-1"><span className="text-[17px] font-semibold text-wb-text">{value ?? "…"}</span>{label}</span>)}
      </div>
      <button type="button" onClick={() => void wb.notes.open()} className="text-left text-[12px] text-wb-text-3 hover:text-wb-link">笔记 {counts?.notes ?? "…"} 条 · 批注 {counts?.annotations ?? "…"} 条</button>
      {desk?.total === 0 ? <p className="m-0 text-[12px] text-wb-text-3">从导入第一篇文献开始。</p> : null}
      <div className="mt-auto flex flex-col gap-2 border-t border-wb-line-soft pt-2.5">
        {links.every((entry) => entry.count === 0) ? <p className="m-0 text-[12px] text-wb-text-3">一切就绪</p> : links.map((entry) => entry.count > 0 ? <button key={entry.view} type="button" onClick={() => wb.browse({ view: entry.view, query: "" })} className="wb-transition flex justify-between gap-1 rounded-md text-left text-[12px] hover:bg-wb-hover"><span>{entry.count} 篇{entry.label}</span><span className="text-wb-text-3">查看</span></button> : <p key={entry.view} className="m-0 text-[12px] text-wb-text-3">0 篇{entry.label}</p>)}
      </div>
    </Panel>
  );
}
