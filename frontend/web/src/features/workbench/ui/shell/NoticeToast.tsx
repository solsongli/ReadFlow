import { useEffect } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { useWb, useWorkbench } from "../context.js";

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const;

export function NoticeToast() {
  const wb = useWorkbench();
  const notice = useWb((state) => state.notice);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => wb.dismissNotice(), notice.tone === "error" ? 8000 : notice.undo ? 6000 : 3200);
    return () => window.clearTimeout(timer);
  }, [notice, wb]);

  if (!notice) return null;
  const Icon = ICON[notice.tone];
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className="pointer-events-auto fixed bottom-9 left-1/2 z-50 flex max-w-[560px] -translate-x-1/2 items-center gap-2.5 rounded-lg border border-wb-line-strong bg-wb-panel py-2 pl-3 pr-1.5 text-[12.5px] shadow-wb-pop"
    >
      <Icon size={15} aria-hidden="true" className={cn(notice.tone === "error" ? "text-wb-danger" : notice.tone === "success" ? "text-wb-accent" : "text-wb-text-3")} />
      <span className="min-w-0 flex-1">{notice.text}</span>
      {notice.undo ? (
        <button
          type="button"
          onClick={() => {
            notice.undo?.();
            wb.dismissNotice();
          }}
          className="h-6 rounded border-0 bg-transparent px-2 font-medium text-wb-accent hover:bg-wb-accent-soft"
        >
          撤销
        </button>
      ) : null}
      <button type="button" aria-label="关闭提示" onClick={wb.dismissNotice} className="inline-flex h-6 w-6 items-center justify-center rounded border-0 bg-transparent text-wb-text-3 hover:bg-wb-hover">
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
