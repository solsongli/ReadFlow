import { useRef } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { Button } from "@/ui/wb/Button.js";
import { WbEmptyState } from "@/ui/wb/EmptyState.js";
import type { ReaderTab } from "../../domain/workbench-store.js";
import { useWorkbench } from "../context.js";

/**
 * One tab = one same-origin iframe of the existing reader (阶段 2 会换成新阅读器).
 * Iframes stay mounted while hidden so switching tabs keeps scroll position and annotations.
 * When the legacy reader navigates away (its own 关闭 button goes back to the old home page),
 * the tab closes instead of showing the old UI inside the workbench.
 */
export function ReaderHost({ tab, active }: { tab: ReaderTab; active: boolean }) {
  const wb = useWorkbench();
  const frame = useRef<HTMLIFrameElement>(null);

  function onLoad() {
    try {
      const path = frame.current?.contentWindow?.location.pathname ?? "";
      if (path && !path.endsWith("/reader.html")) wb.closeTab(tab.id);
    } catch {
      // Cross-origin would be a misconfiguration; keep the tab rather than guessing.
    }
  }

  return (
    <div className={cn("absolute inset-0 flex flex-col bg-wb-bg", !active && "hidden")}>
      {tab.status === "loading" ? (
        <WbEmptyState className="flex-1" icon={<LoaderCircle size={22} className="animate-spin" />} title="正在准备阅读器…" hint={tab.title} />
      ) : null}
      {tab.status === "error" ? (
        <WbEmptyState
          className="flex-1"
          icon={<CircleAlert size={24} />}
          title="这篇文献暂时打不开"
          hint={tab.error ?? undefined}
          action={
            <div className="flex gap-1.5">
              <Button onClick={() => { wb.closeTab(tab.id); void wb.openReader(tab.itemId); }}>重试</Button>
              <Button variant="ghost" onClick={() => wb.closeTab(tab.id)}>关闭标签页</Button>
            </div>
          }
        />
      ) : null}
      {tab.status === "ready" && tab.url ? (
        <iframe ref={frame} title={tab.title} src={tab.url} onLoad={onLoad} className="min-h-0 w-full flex-1 border-0 bg-wb-panel" />
      ) : null}
    </div>
  );
}
