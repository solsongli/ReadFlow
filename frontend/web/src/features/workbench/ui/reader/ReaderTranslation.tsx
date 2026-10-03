import type { ReaderTab } from "../../domain/workbench-store.js";
import { translationProgress, activeTranslation } from "../../domain/translation.js";
import { Button } from "@/ui/wb/Button.js";
import { useWb, useWorkbench } from "../context.js";

export function ReaderTranslation({ tab }: { tab: ReaderTab }) {
  const wb = useWorkbench();
  const row = useWb((state) => state.tabs.find((entry) => entry.id === tab.id)?.row);
  const busy = useWb((state) => state.translatingIds?.includes(tab.itemId));
  const translation = row?.translation ?? { status: "none" as const };
  const active = activeTranslation(translation);
  if (translation.status === "done") return null;
  return <div aria-label="阅读器翻译工具栏" className="shrink-0 border-b border-wb-line-soft bg-wb-panel px-3 py-1.5 text-[0.75rem]">
    <div className="flex items-center gap-3"><span className="flex-1 text-wb-text-3">{translationProgress(translation)}</span>
      {translation.status === "failed" ? <Button size="sm" onClick={() => void wb.translations.details(tab.itemId)}>失败详情</Button> : null}
      {active ? <Button size="sm" onClick={() => void wb.translations.cancel(tab.itemId)}>取消翻译</Button> : <Button size="sm" disabled={busy} onClick={() => void wb.translations.start([tab.itemId])}>{busy ? "正在提交…" : "翻译这篇"}</Button>}
    </div>
    {active ? <div role="progressbar" aria-label="全文翻译进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={translation.percent ?? undefined} aria-valuetext={translationProgress(translation)} className="mt-1 h-1 w-full overflow-hidden rounded-full bg-wb-fill"><div className="h-full rounded-full bg-wb-accent" style={{ width: `${translation.percent ?? 0}%` }} /></div> : null}
  </div>;
}
