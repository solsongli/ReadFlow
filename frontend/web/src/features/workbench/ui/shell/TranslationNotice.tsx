import { useEffect } from "react";
import { Button } from "@/ui/wb/Button.js";
import { useWb, useWorkbench } from "../context.js";

export function TranslationNotice() {
  const wb = useWorkbench();
  const issue = useWb((state) => state.translationIssue);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, stopped = false, epoch = 0;
    const tick = async (generation = epoch) => {
      if (stopped || generation !== epoch) return;
      await wb.translations.poll();
      if (!stopped && generation === epoch) timer = setTimeout(() => void tick(generation), wb.translations.active() ? 2000 : 20000);
    };
    void tick();
    const changed = () => { clearTimeout(timer); epoch++; void tick(); };
    const unsubscribe = wb.store.subscribe((state, meta) => {
      if (state.translatingIds?.length !== (meta?.previousState as typeof state)?.translatingIds?.length && !state.translatingIds?.length) changed();
    });
    return () => { stopped = true; clearTimeout(timer); unsubscribe(); };
  }, [wb]);
  if (!issue) return null;
  return <section role="status" aria-label="翻译提示" className="shrink-0 border-b border-wb-line-soft bg-wb-panel-2 px-4 py-2 text-[0.8125rem]">
    <div className="flex flex-wrap items-center gap-2"><span className="flex-1 text-wb-text-2">{issue.error.message}</span>
      {issue.error.code !== "unconfigured" && issue.error.code !== "ocr_missing" ? <Button size="sm" onClick={() => void (issue.error.code === "cancel_failed" ? wb.translations.cancel(issue.itemId) : wb.translations.start([issue.itemId]))}>重试</Button> : null}
      {issue.error.settings ? <Button size="sm" onClick={() => wb.openSettings(issue.error.settings!)}>去设置</Button> : null}
      <Button size="sm" variant="ghost" onClick={() => wb.translations.clearIssue()}>收起</Button></div>
    {issue.error.details ? <details className="mt-1 text-wb-text-3"><summary>详情</summary><p className="whitespace-pre-wrap break-words">{issue.error.details}</p></details> : null}
  </section>;
}
