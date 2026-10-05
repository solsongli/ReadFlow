import { useRef } from "react";
import { usePaperBlocks } from "@/features/paper-blocks/index.js";
import { useReaderAssistance } from "./useReaderAssistance.js";
import { useReaderCanvas } from "./useReaderCanvas.js";
import { Settings } from "lucide-react";
import { IconButton } from "@/ui/wb/Button.js";
import { PaperReader, quoteReference } from "@/features/paper-reader/index.js";
import { buildApiHeaders, buildApiUrl } from "@/platform/config/runtime.js";
import { cn } from "@/ui/lib/utils.js";
import type { ReaderTab } from "../../domain/workbench-store.js";
import { formatGbt7714 } from "../../domain/citation.js";
import { useWb, useWorkbench } from "../context.js";
export function ReaderHost({ tab, active }: { tab: ReaderTab; active: boolean }) {
  const wb = useWorkbench();
  const annotationSemantics = useWb((state) => state.annotationSemantics);
  const tone = useWb((state) => state.paperTone);
  const language = useWb((state) => state.blockLanguage);
  const format = useWb((state) => state.translationFormat);
  const imageText = useWb((state) => state.blockImageText);
  const density = useWb((state) => state.layoutDensity);
  const disabled = useWb((state) => state.blockModeDisabled);
  const hintDismissed = useWb((state) => state.blockModeHintDismissed);
  const row = tab.row;
  const currentPage = useRef(row?.read_page || 1);
  const canvas = useReaderCanvas(tab.itemId, active, row?.notes_count ?? 0);
  const assistance = useReaderAssistance(tab.itemId, row?.title || "", canvas.addText);
  const blocks = usePaperBlocks(
    tab.itemId,
    tab.attachmentId || "",
    assistance,
    active,
    language,
    row?.translation.status === "done",
    (message) => wb.notify(message, "success"),
    { disabled, hintDismissed, save: (prefs) => wb.setPrefs(prefs) },
    { imageText, density, currentPage: () => currentPage.current, format, setFormat: (translationFormat) => wb.setPrefs({ translationFormat }) },
  );
  if (!row || !tab.attachmentId) {
    return (
      <div role="status" className={cn("p-6 text-wb-text-3", !active && "hidden")}>
        论文信息尚未就绪，请重新打开文献。
      </div>
    );
  }
  const headers = buildApiHeaders();
  const job = row.translation.status === "done" ? row.translation.job_id : null;
  return (
    <div data-wb-reader-active={active} className={cn("absolute inset-0", !active && "hidden")}>
      <PaperReader
        assistance={assistance}
        blockOverlay={blocks.overlay}
        inlineAvailable={blocks.inlineAvailable}
        layoutAligned={blocks.layoutAligned}
        registerBlockNavigation={blocks.registerBlockNavigation}
        translationPanel={blocks.sidebar}
        {...canvas.ports}
        canvas={canvas.dock}
        panels={{ 画布: canvas.dock }}
        flashAnnotationId={tab.annotationId}
        attachmentId={tab.attachmentId}
        annotationSemantics={annotationSemantics}
        annotationsChanged={() => {
          void wb.readerNotesChanged(tab.itemId);
          canvas.changed();
        }}
        key={tab.attachmentId}
        toolbarTools={
          <>
            {blocks.tools}
            <IconButton label="工作台设置" title="工作台设置（Ctrl ,）" onClick={() => wb.openSettings()}>
              <Settings size={16} />
            </IconButton>
          </>
        }
        onFocusChange={(focused) => wb.store.actions.updateTab(tab.id, { focused })}
        metadata={row}
        active={active}
        tone={tone}
        setTone={(paperTone) => wb.setPrefs({ paperTone })}
        lastReadPage={row.read_page}
        resumePage={tab.resumePage}
        navigationKey={tab.navigationKey}
        source={{
          url: buildApiUrl("/api/research", `/attachments/${encodeURIComponent(tab.attachmentId)}/pdf`),
          headers,
        }}
        translated={
          blocks.translated
            ? { url: blocks.translated, headers }
            : job
              ? {
                  url: buildApiUrl("/api/v1", `/jobs/${encodeURIComponent(job)}/pdf`),
                  headers,
                }
              : undefined
        }
        onPageChange={(page) => {
          currentPage.current = page;
        }}
        progress={(page, pages) => {
          currentPage.current = page;
          void wb.readerProgress({ itemId: tab.itemId, page, pages });
        }}
        quote={(text, page, format) =>
          quoteReference(text, row.authors, row.year, page, format === "gbt" ? formatGbt7714(row) : undefined)
        }
        lookup={async (query) =>
          (
            await wb.api.list({
              view: "all",
              query,
              sort: "title",
              order: "asc",
            })
          ).items.map(({ id, title }) => ({ id, title }))
        }
        reveal={(id) => void wb.revealNotePaper(id)}
        translation={blocks.translation}
      />
      {canvas.picker}
      {blocks.panel}
    </div>
  );
}
