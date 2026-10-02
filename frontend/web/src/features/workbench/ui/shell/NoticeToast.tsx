import { useEffect } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { useWb, useWorkbench } from "../context.js";

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const;

export function NoticeToast() {
  const wb = useWorkbench();
  const notice = useWb((state) => state.notice);

  useEffect(() => {
    if (!notice || (notice.tone === "error" && notice.canUndo)) return undefined;
    const timer = window.setTimeout(() => wb.dismissNotice(), notice.tone === "error" ? 8000 : notice.canUndo ? 6000 : 3200);
    return () => window.clearTimeout(timer);
  }, [notice?.id, notice?.tone, notice?.canUndo, wb]);

  if (!notice) return null;
  const Icon = ICON[notice.tone];
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className="pointer-events-auto fixed bottom-5 left-1/2 z-50 flex w-max max-w-[min(560px,calc(100vw-32px))] -translate-x-1/2 items-center gap-2.5 rounded-xl border-0 bg-wb-panel py-2 pl-3 pr-1.5 text-[12.5px] shadow-wb-pop"
    >
      <Icon size={15} aria-hidden="true" className={cn(notice.tone === "error" ? "text-wb-danger" : notice.tone === "success" ? "text-wb-link" : "text-wb-text-3")} />
      <span className="min-w-0 flex-1">{notice.text}</span>
      {notice.canUndo ? (
        <button
          type="button"
          onClick={() => wb.undoNotice(notice.id)}
          className="h-6 rounded border-0 bg-transparent px-2 font-medium text-wb-link hover:bg-wb-accent-soft"
        >
          {notice.actionLabel ?? "撤销"}
        </button>
      ) : null}
      <button type="button" aria-label="关闭提示" title="关闭提示" onClick={wb.dismissNotice} className="inline-flex h-6 w-6 items-center justify-center rounded border-0 bg-transparent text-wb-text-3 hover:bg-wb-hover">
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
