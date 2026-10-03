import { useEffect, useState, type ReactNode } from "react";
import type { ResearchOcrJob, ResearchOcrModule } from "@/platform/contracts/research-library.js";
import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import { Button } from "@/ui/wb/Button.js";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "@/ui/wb/Menu.js";
import { canStartOcr, ocrAvailability } from "../../domain/desk.js";
import { startDeskOcr } from "../../state/desk-actions.js";
import { useWorkbench } from "../context.js";

export function OcrLauncher({ children }: { children: ReactNode }) {
  const wb = useWorkbench();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WorkbenchRow[]>([]);
  const [modules, setModules] = useState<ResearchOcrModule[]>([]);
  const [jobs, setJobs] = useState<ResearchOcrJob[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const { ready, reason } = ocrAvailability(modules);
  useEffect(() => {
    if (!open) { setSelected([]); return; }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      wb.api.list({ view: "needs_ocr", sort: "added", order: "desc" }, controller.signal),
      wb.api.ocrModules(controller.signal), wb.api.ocrJobs(controller.signal),
    ]).then(([result, available, active]) => {
      if (controller.signal.aborted) return;
      setRows(result.items); setModules(available.modules); setJobs(active.jobs);
    }).catch(() => { if (!controller.signal.aborted) setError("本地 OCR 状态没有加载出来，请重试。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, attempt, wb]);
  async function start() {
    setBusy(true); setError("");
    try {
      const result = await startDeskOcr(wb, rows.filter((row) => selected.includes(row.id)));
      wb.notify(result.started ? `已开始 ${result.started} 篇文献的本地 OCR` : "所选文献已有 OCR 任务或不再需要识别。");
      setSelected([]);
      if (result.failed.length) { const message = `${result.failed.length} 篇未能开始 OCR，请重试。`; setError(message); wb.failure(new Error(message), start); }
      else setAttempt((value) => value + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "OCR 未能开始，请重试。"); wb.failure(failure, start); }
    finally { setBusy(false); }
  }
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" aria-label="本地 OCR" className="w-[440px] max-w-[calc(100vw-24px)] p-4">
        <h2 className="m-0 text-[0.9375rem] font-semibold">本地 OCR</h2>
        <p className="mb-3 mt-2 text-[0.75rem] text-wb-text-3">{loading ? "正在检查模块与文献…" : reason}</p>
        {error ? <p role="alert" className="text-[0.75rem] text-wb-text-2">{error} <Button size="sm" disabled={busy} onClick={() => setAttempt(attempt + 1)}>重试</Button></p> : null}
        {!loading ? <div className="wb-scroll max-h-[min(320px,40vh)]">
          {rows.length ? rows.map((row) => {
            const available = canStartOcr(row, jobs);
            return (
              <label key={row.id} className="wb-transition flex items-start gap-2 rounded-lg px-2 py-2.5 hover:bg-wb-hover">
                <input type="checkbox" aria-label={row.title} checked={selected.includes(row.id)} disabled={!ready || !available || busy || Boolean(error)}
                  onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id))} className="mt-0.5 accent-wb-text" />
                <span className="min-w-0 text-[0.8125rem]"><span className="line-clamp-2" title={row.title}>{row.title}</span>{!available ? <span className="text-[0.75rem] text-wb-text-3">已有 OCR 任务</span> : null}</span>
              </label>
            );
          }) : <p className="py-4 text-[0.75rem] text-wb-text-3">没有需要 OCR 的文献。</p>}
        </div> : null}
        <div className="mt-3 flex items-center justify-end gap-2">
          {!ready || error ? <Button onClick={() => wb.openSettings("ocr")}>打开 OCR 设置</Button> : null}
          <Button disabled={!ready || !selected.length || loading || busy || Boolean(error)} onClick={() => void start()}>{busy ? "正在开始…" : "开始 OCR"}</Button>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
