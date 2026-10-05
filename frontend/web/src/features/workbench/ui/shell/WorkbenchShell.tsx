import { ReviewView } from "@/features/flashcards/index.js";
import { FlashcardBridge } from "./FlashcardBridge.js";
import { CanvasBridge } from "../reader/CanvasBridge.js";
import { CanvasView } from "@/features/thought-canvas/index.js";
import { TranslationNotice } from "./TranslationNotice.js";
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
import { useWorkbenchTypography } from "./useWorkbenchTypography.js";

export function WorkbenchShell() { return <WorkbenchErrorBoundary><CanvasBridge><FlashcardBridge><WorkbenchLayout /></FlashcardBridge></CanvasBridge></WorkbenchErrorBoundary>; }

function WorkbenchLayout() {
  const wb = useWorkbench();
  const main = useWb((state) => state.main);
  const activeTab = useWb((state) => state.activeTab);
  const tabs = useWb((state) => state.tabs);
  const readerFocus = useWb((state) => state.main !== "settings" && state.tabs.some((tab) => tab.id === state.activeTab && tab.focused));
  const theme = useWb((state) => state.theme);
  const total = useWb((state) => state.list.result?.counts.all ?? state.desk.data?.total);
  const view = useWb((state) => state.view);
  const hasRows = useWb((state) => Boolean(state.list.result?.items.length));
  const empty = total === 0 && (main === "desk" || (main === "library" && view !== "trash"));
  useWorkbenchKeys();
  useWorkbenchTypography();
  useNotesLifecycle();
  useEffect(() => { document.title = workbenchTitle(main, tabs.find((tab) => tab.id === activeTab)?.title); }, [main, tabs, activeTab]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.wbTheme;
    else root.dataset.wbTheme = theme;
  }, [theme]);

  useEffect(() => {
    void wb.refreshAll();
    let lastInput = Date.now();
    const activity = () => { lastInput = Date.now(); };
    const auto = window.setInterval(() => void wb.autoTranslation.tick(Date.now() - lastInput > 2500), 2000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
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
      window.clearInterval(auto);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      wb.dispose();
    };
  }, [wb]);

  const libraryActive = activeTab === LIBRARY_TAB;
  return (
    <div className="flex h-full overflow-hidden">
      {activeTab === LIBRARY_TAB || activeTab.startsWith("canvas:") || main === "settings" ? <Sidebar /> : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {main !== "settings" && !readerFocus ? <TitleBar /> : null}
        <TranslationNotice />
        {!libraryActive ? <ServiceBanner /> : null}
        <div className="relative flex min-h-0 flex-1">
          <div className={cn("flex min-h-0 min-w-0 flex-1", !libraryActive && "hidden")}>
            {main === "settings" ? <SettingsView /> : main === "notes" ? <NotesView /> : main === "review" ? <ReviewView active={libraryActive} /> : <main aria-label={main === "desk" ? "书桌" : "文献库"} className="flex min-h-0 min-w-0 flex-1 flex-col bg-wb-panel">
              <LibraryHeader />
              {empty ? <WelcomeView /> : main === "desk" ? <DeskView /> : <ItemList />}
            </main>}
            {main === "library" && !empty && (total !== 0 || hasRows) ? <Inspector /> : null}
          </div>
          {tabs.map((tab) => tab.kind === "canvas" ?
            <div key={tab.id} className={cn("absolute inset-0", activeTab !== tab.id && "hidden")}>
              <CanvasView id={tab.canvasId!} focusNode={tab.canvasNode} focusKey={tab.navigationKey} active={activeTab === tab.id} />
            </div> : <ReaderHost key={tab.id} tab={tab} active={activeTab === tab.id} />)}

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
