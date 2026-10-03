import { FileText, Library, PanelsTopLeft, X } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { IconButton } from "@/ui/wb/Button.js";
import { LIBRARY_TAB } from "../../domain/workbench-store.js";
import { useWb, useWorkbench } from "../context.js";

/** A Safari-style strip exists only while a reader is open. */
export function TitleBar() {
  const wb = useWorkbench();
  const tabs = useWb((state) => state.tabs);
  const activeTab = useWb((state) => state.activeTab);
  if (!tabs.length) return null;
  const entries = [{ id: LIBRARY_TAB, title: "文献库" }, ...tabs];
  return (
    <nav aria-label="阅读器标签页" className="wb-scroll flex h-9 shrink-0 items-center gap-1 border-b border-wb-line-soft bg-wb-chrome px-2">
      {entries.map((tab) => (
        <div key={tab.id} className={cn("group wb-transition flex h-7 min-w-[100px] max-w-[220px] flex-1 items-center gap-1 rounded-lg px-1", activeTab === tab.id ? "bg-wb-panel text-wb-text" : "text-wb-text-3 hover:bg-wb-hover")}>
          <button
            onDragEnter={event => {
              if (tab.id.startsWith("canvas:") && event.dataTransfer.types.includes("application/x-readflow-canvas")) {
                wb.activateTab(tab.id);
              }
            }}
            type="button"
            aria-current={activeTab === tab.id ? "page" : undefined}
            title={tab.title}
            onClick={() => tab.id === LIBRARY_TAB ? wb.setMain("library") : wb.activateTab(tab.id)}
            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md border-0 bg-transparent px-2 text-[0.75rem]"
          >
            {tab.id === LIBRARY_TAB ? <Library size={13} className="shrink-0" aria-hidden="true" /> : tab.id.startsWith("canvas:") ? <PanelsTopLeft size={13} className="shrink-0" aria-hidden="true" /> : <FileText size={13} className="shrink-0" aria-hidden="true" />}
            <span className="wb-truncate">{tab.title}</span>
          </button>
          {tab.id !== LIBRARY_TAB ? (
            <IconButton label={`关闭「${tab.title}」`} size="xs" onClick={() => wb.closeTab(tab.id)} className="opacity-60 hover:opacity-100 focus-visible:opacity-100">
              <X size={12} aria-hidden="true" />
            </IconButton>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
