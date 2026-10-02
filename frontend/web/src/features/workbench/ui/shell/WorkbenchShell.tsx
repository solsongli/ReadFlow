import { useEffect } from "react";
import { cn } from "@/ui/lib/utils.js";
import { workbenchTitle } from "../../domain/resilience.js";
import { WorkbenchErrorBoundary } from "./WorkbenchErrorBoundary.js";
import { WelcomeView } from "./WelcomeView.js";
import { WindowDropZone } from "./WindowDropZone.js";
import { ServiceBanner } from "./ServiceBanner.js";
import { ShortcutsPanel } from "./ShortcutsPanel.js";
import { LIBRARY_TAB } from "../../domain/workbench-store.js";
import { backgroundProgress } from "../../domain/presentation.js";
import { useWb, useWorkbench } from "../context.js";
import { DeskView } from "../desk/DeskView.js";
import { PDF_PICKER_ID } from "../import/pdf-picker.js";
import { Inspector } from "../inspector/Inspector.js";
import { ItemList } from "../library/ItemList.js";
import { LibraryHeader } from "../library/LibraryHeader.js";
import { ReaderHost } from "../reader/ReaderHost.js";
import { SettingsView } from "../settings/SettingsView.js";
import { NotesView } from "../notes/NotesView.js";
import { useNotesLifecycle } from "../notes/useNotesLifecycle.js";
import { Sidebar } from "../sidebar/Sidebar.js";
import { CommandPalette } from "./CommandPalette.js";
import { NoticeToast } from "./NoticeToast.js";
import { TitleBar } from "./TitleBar.js";
import { useWorkbenchKeys } from "./useWorkbenchKeys.js";

export function WorkbenchShell() { return <WorkbenchErrorBoundary><WorkbenchLayout /></WorkbenchErrorBoundary>; }

function WorkbenchLayout() {
  const wb = useWorkbench();
  const main = useWb((state) => state.main);
  const activeTab = useWb((state) => state.activeTab);
  const tabs = useWb((state) => state.tabs);
  const theme = useWb((state) => state.theme);
  const total = useWb((state) => state.list.result?.counts.all ?? state.desk.data?.total);
  const view = useWb((state) => state.view);
  const hasRows = useWb((state) => Boolean(state.list.result?.items.length));
  const empty = total === 0 && (main === "desk" || (main === "library" && view !== "trash"));
  useWorkbenchKeys();
  useNotesLifecycle();
  useEffect(() => { document.title = workbenchTitle(main, tabs.find((tab) => tab.id === activeTab)?.title); }, [main, tabs, activeTab]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.wbTheme;
    else root.dataset.wbTheme = theme;
  }, [theme]);

  useEffect(() => {
    void wb.refreshAll();
    // Papers saved from the browser (Zotero Connector) appear when the user comes back to the window.
    const onFocus = () => {
      if (wb.store.getSnapshot().connection.unavailable) { void wb.retryService(); return; }
      void wb.refreshList();
      if (wb.store.getSnapshot().main === "desk") void wb.refreshDesk();
      if (wb.store.getSnapshot().main === "notes") void wb.notes.refresh();
    };
    const jobs = window.setInterval(() => {
      if (document.visibilityState !== "visible" || wb.store.getSnapshot().connection.unavailable) return;
      void wb.refreshJobs().then(() => {
        const state = wb.store.getSnapshot();
        const desk = state.desk.data;
        const papers = [...(state.list.result?.items ?? []), ...(desk?.continue_reading ?? []), ...(desk?.to_read ?? []), ...(desk?.recent_items ?? [])];
        if (backgroundProgress(state.ocrJobs, papers, desk?.translation)) {
          void wb.refreshList();
          void wb.refreshDesk();
        }
      });
    }, 6000);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(jobs);
      wb.dispose();
    };
  }, [wb]);

  const libraryActive = activeTab === LIBRARY_TAB;
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {main !== "settings" ? <TitleBar /> : null}
        {!libraryActive ? <ServiceBanner /> : null}
        <div className="relative flex min-h-0 flex-1">
          <div className={cn("flex min-h-0 min-w-0 flex-1", !libraryActive && "hidden")}>
            {main === "settings" ? <SettingsView /> : main === "notes" ? <NotesView /> : <main aria-label={main === "desk" ? "书桌" : "文献库"} className="flex min-h-0 min-w-0 flex-1 flex-col bg-wb-panel">
              <LibraryHeader />
              {empty ? <WelcomeView /> : main === "desk" ? <DeskView /> : <ItemList />}
            </main>}
            {main === "library" && !empty && (total !== 0 || hasRows) ? <Inspector /> : null}
          </div>
          {tabs.map((tab) => <ReaderHost key={tab.id} tab={tab} active={activeTab === tab.id} />)}

        </div>
      </div>
      <CommandPalette />
      <ShortcutsPanel />
      <WindowDropZone />
      <NoticeToast />
      <input
        id={PDF_PICKER_ID}
        type="file"
        hidden
        multiple
        accept="application/pdf,.pdf"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void wb.importPdfs(files);
        }}
      />
    </div>
  );
}
