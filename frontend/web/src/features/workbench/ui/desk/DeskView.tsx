import { useEffect } from "react";
import { Download, NotebookPen } from "lucide-react";
import { Button } from "@/ui/wb/Button.js";
import { WbEmptyState } from "@/ui/wb/EmptyState.js";
import { ProgressBar } from "@/ui/wb/Segmented.js";
import { longDate } from "../../domain/format.js";
import { openPdfPicker } from "../import/pdf-picker.js";
import { useWb, useWorkbench } from "../context.js";
import { Attention, ContinueReading, EmptyLine, Panel, RecentAnnotations, RecentItems, RecentNotes, ToRead } from "./DeskPanels.js";

function BackgroundTasks() {
  const jobs = useWb((state) => state.ocrJobs);
  const active = jobs.filter((job) => job.status === "running" || job.status === "queued" || job.status === "error").slice(0, 4);
  return (
    <Panel title="后台任务">
      {active.length === 0 ? <EmptyLine>没有正在进行的 OCR 任务。</EmptyLine> : null}
      {active.map((job) => (
        <div key={job.id} className="flex flex-col gap-1.5 border-b border-wb-line-soft px-3.5 py-2 last:border-b-0">
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="flex-1">本地 OCR</span>
            <span className="wb-numeric text-[12px] text-wb-text-2">
              {job.status === "error" ? "失败" : job.status === "queued" ? "排队中" : `${job.completed_pages}/${job.total_pages} 页`}
            </span>
          </div>
          {job.status === "running" ? <ProgressBar value={job.total_pages ? (job.completed_pages / job.total_pages) * 100 : 0} label="OCR 进度" /> : null}
        </div>
      ))}
    </Panel>
  );
}

export function DeskView() {
  const wb = useWorkbench();
  const status = useWb((state) => state.desk.status);
  const error = useWb((state) => state.desk.error);
  const desk = useWb((state) => state.desk.data);

  useEffect(() => {
    void wb.refreshDesk();
    void wb.refreshJobs();
  }, [wb]);

  if (status === "error" && !desk) {
    return <WbEmptyState title="书桌没有加载出来" hint={error ?? undefined} action={<Button onClick={() => void wb.refreshDesk()}>重试</Button>} className="flex-1" />;
  }
  if (desk && desk.total === 0) {
    return (
      <WbEmptyState
        className="flex-1"
        icon={<NotebookPen size={30} />}
        title="欢迎使用 ReadFlow"
        hint="先导入几篇论文：PDF 文件、Zotero / CSL JSON 导出，或用浏览器里的 Zotero Connector 直接保存。"
        action={<Button variant="primary" icon={<Download size={13} aria-hidden="true" />} onClick={openPdfPicker}>导入 PDF</Button>}
      />
    );
  }

  return (
    <div className="wb-scroll flex min-h-0 flex-1 flex-col gap-3.5 px-[18px] py-3.5">
      <div className="flex h-8 shrink-0 items-center gap-3">
        <h1 className="m-0 text-[15px] font-semibold">书桌</h1>
        <span className="wb-numeric text-[12px] text-wb-text-3">{longDate()}</span>
        {desk ? (
          <>
            <span aria-hidden="true" className="h-3.5 w-px bg-wb-line-strong" />
            <span className="text-wb-text-2">
              今天：打开 <span className="wb-numeric">{desk.today.opened}</span> 篇 · 新增批注 <span className="wb-numeric">{desk.today.annotations}</span> 条 · 笔记 <span className="wb-numeric">{desk.today.notes}</span> 篇
            </span>
          </>
        ) : null}
        <span className="flex-1" />
        <Button variant="primary" icon={<Download size={13} aria-hidden="true" />} onClick={openPdfPicker}>导入 PDF</Button>
      </div>
      {desk ? (
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_400px] items-start gap-3.5">
          <div className="flex min-w-0 flex-col gap-3.5">
            <ContinueReading rows={desk.continue_reading} />
            <RecentAnnotations notes={desk.recent_annotations} />
            <RecentItems rows={desk.recent_items} />
          </div>
          <div className="flex min-w-0 flex-col gap-3.5">
            <Attention attention={desk.attention} />
            <ToRead rows={desk.to_read} />
            <BackgroundTasks />
            <RecentNotes notes={desk.recent_notes} />
          </div>
        </div>
      ) : (
        <p className="m-0 text-wb-text-3">正在整理书桌…</p>
      )}
    </div>
  );
}
