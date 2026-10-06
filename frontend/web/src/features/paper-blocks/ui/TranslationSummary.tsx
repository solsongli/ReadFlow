import { useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import type { BlockStatus } from "../domain/model.js";
import { translationSummary } from "../domain/summary.js";
import { useSummaryDismissed } from "../state/useSummaryDismissed.js";
export function TranslationSummary({ item, status }: { item: string; status: BlockStatus | null }) {
  const { dismissed, dismiss } = useSummaryDismissed(item);
  const summary = translationSummary(status);
  const [open, setOpen] = useState(false);
  if (!summary.details.length && !summary.actionable) return null;
  const notice = summary.actionable && !dismissed;
  return (
    <section aria-label="翻译状态摘要" className={notice ? "rounded-xl bg-wb-fill p-3" : "text-wb-text-3"}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-expanded={open}
          className="min-w-0 flex-1 text-left text-xs leading-relaxed"
          onClick={() => setOpen(!open)}
        >
          {notice ? summary.title : "翻译详情"}
          {open ? " ▴" : " ▾"}
        </button>
        {notice ? (
          <Button
            size="sm"
            onClick={() => {
              dismiss();
              setOpen(false);
            }}
          >
            关闭摘要
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-2 space-y-2 text-xs leading-relaxed text-wb-text-3">
          {summary.details.map((detail) => (
            <p key={detail.kind} data-block-fallback={detail.kind} className="m-0">
              {detail.text}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
