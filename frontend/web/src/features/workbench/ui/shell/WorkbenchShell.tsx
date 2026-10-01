import { useEffect, useState, type DragEvent } from "react";
import { FileUp } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { LIBRARY_TAB } from "../../domain/workbench-store.js";
import { useWb, useWorkbench } from "../context.js";
import { DeskView } from "../desk/DeskView.js";
import { PDF_PICKER_ID } from "../import/pdf-picker.js";
import { Inspector } from "../inspector/Inspector.js";
import { ItemList } from "../library/ItemList.js";
import { LibraryHeader } from "../library/LibraryHeader.js";
import { ReaderHost } from "../reader/ReaderHost.js";
import { Sidebar } from "../sidebar/Sidebar.js";
import { CommandPalette } from "./CommandPalette.js";
import { NoticeToast } from "./NoticeToast.js";
import { StatusBar } from "./StatusBar.js";
import { TitleBar } from "./TitleBar.js";
import { useWorkbenchKeys } from "./useWorkbenchKeys.js";

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export function WorkbenchShell() {
  const wb = useWorkbench();
  const main = useWb((state) => state.main);
  const activeTab = useWb((state) => state.activeTab);
  const tabs = useWb((state) => state.tabs);
  const theme = useWb((state) => state.theme);
  const [dropping, setDropping] = useState(false);
  useWorkbenchKeys();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.wbTheme;
    else root.dataset.wbTheme = theme;
  }, [theme]);

  useEffect(() => {
    void wb.refreshAll();
    // Papers saved from the browser (Zotero Connector) appear when the user comes back to the window.
    const onFocus = () => {
      void wb.refreshList();
      if (wb.store.getSnapshot().main === "desk") void wb.refreshDesk();
    };
    const jobs = window.setInterval(() => {
      if (document.visibilityState === "visible") void wb.refreshJobs();
    }, 6000);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(jobs);
    };
  }, [wb]);

  const libraryActive = activeTab === LIBRARY_TAB;
  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDropping(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDropping(false);
        void wb.importPdfs(Array.from(event.dataTransfer.files));
      }}
    >
      <TitleBar />
      <div className="relative flex min-h-0 flex-1">
        <div
          className={cn(
            "grid min-h-0 flex-1",
            main === "desk" ? "grid-cols-[220px_minmax(0,1fr)]" : "grid-cols-[220px_minmax(0,1fr)_344px]",
            !libraryActive && "hidden",
          )}
        >
          <Sidebar />
          {main === "desk" ? (
            <DeskView />
          ) : (
            <>
              <main aria-label="文献列表" className="flex min-h-0 min-w-0 flex-col bg-wb-panel">
                <LibraryHeader />
                <ItemList />
              </main>
              <Inspector />
            </>
          )}
        </div>
        {tabs.map((tab) => (
          <ReaderHost key={tab.id} tab={tab} active={activeTab === tab.id} />
        ))}
        {dropping ? (
          <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-wb-accent bg-wb-accent-soft">
            <span className="inline-flex items-center gap-2 rounded-lg bg-wb-panel px-4 py-2.5 text-[13px] font-medium shadow-wb-pop">
              <FileUp size={16} aria-hidden="true" className="text-wb-accent" />
              松开即导入 PDF{wb.store.getSnapshot().groupId ? "，并加入当前分组" : ""}
            </span>
          </div>
        ) : null}
      </div>
      <StatusBar />
      <CommandPalette />
      <NoticeToast />
      <input
        id={PDF_PICKER_ID}
        type="file"
        hidden
        multiple
        accept="application/pdf,.pdf"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) void wb.importPdfs(files);
        }}
      />
    </div>
  );
}
