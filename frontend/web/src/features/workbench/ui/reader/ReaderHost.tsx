import { ReaderTranslation } from "./ReaderTranslation.js";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { Button } from "@/ui/wb/Button.js";
import { WbEmptyState } from "@/ui/wb/EmptyState.js";
import type { ReaderTab } from "../../domain/workbench-store.js";
import { ReaderFrame } from "./ReaderFrame.js";
import { useWorkbench } from "../context.js";

/**
 * One tab = one same-origin iframe of the existing reader (阶段 2 会换成新阅读器).
 * Iframes stay mounted while hidden so switching tabs keeps scroll position and annotations.
 * When the legacy reader navigates away (its own 关闭 button goes back to the old home page),
 * the tab closes instead of showing the old UI inside the workbench.
 */
export function ReaderHost({ tab, active }: { tab: ReaderTab; active: boolean }) {
  const wb = useWorkbench();

  return (
    <div data-wb-reader-active={active} className={cn("absolute inset-0 flex flex-col bg-wb-bg", !active && "hidden")}>
      <ReaderTranslation tab={tab} />
      {tab.status === "loading" ? (
        <WbEmptyState className="flex-1" icon={<LoaderCircle size={22} />} title="正在准备阅读器…" hint={tab.title} />
      ) : null}
      {tab.status === "error" ? (
        <WbEmptyState
          className="flex-1"
          icon={<CircleAlert size={24} />}
          title="这篇文献暂时打不开"
          hint={tab.error ?? undefined}
          action={
            <div className="flex gap-1.5">
              <Button onClick={() => { wb.closeTab(tab.id); void wb.openReader(tab.itemId, { attachmentId: tab.attachmentId, page: tab.resumePage ?? undefined }); }}>重试</Button>
              <Button variant="ghost" onClick={() => wb.closeTab(tab.id)}>关闭标签页</Button>
            </div>
          }
        />
      ) : null}
      {tab.status === "ready" && tab.url ? (
        <ReaderFrame key={`${tab.url}:${tab.navigationKey ?? 0}`} tab={tab} />
      ) : null}
    </div>
  );
}
