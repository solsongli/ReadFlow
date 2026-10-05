import { useEffect, useState } from "react";
import type { PaperItem } from "@/platform/contracts/research-library.js";
import type { PdfTitleSuggestion as Suggestion } from "@/platform/contracts/workbench.js";
import { Button } from "@/ui/wb/Button.js";
import { metadataNeedsPdfReview, metadataValue, PDF_FIELD_LABELS } from "../../domain/pdf-metadata.js";
import { useWorkbench } from "../context.js";

export function PdfTitleSuggestion({ item, venue }: { item: PaperItem | null; venue: string }) {
  const wb = useWorkbench();
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const eligible = Boolean(item && metadataNeedsPdfReview(item, venue));
  const revision = JSON.stringify([item?.title, item?.authors, item?.doi, item?.url, item?.date, venue]);
  useEffect(() => {
    setSuggestion(null);
    if (!eligible || !item) return;
    const abort = new AbortController();
    void wb.api
      .pdfMetadata(item.id, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setSuggestion(value);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [wb, item?.id, revision, eligible]);
  const token = suggestion?.token;
  if (!item || !suggestion?.eligible || !token || !suggestion.changes.length) return null;
  return (
    <div className="rounded-xl bg-wb-panel-2 p-3 text-[0.75rem] text-wb-text-3" aria-label="PDF 识别建议">
      <p className="m-0 mb-2">核对后将补全以下信息：</p>
      <dl className="m-0 mb-3 space-y-2">
        {suggestion.changes.map((change) => (
          <div key={change.field} className="break-words">
            <dt className="font-medium text-wb-text-2">{PDF_FIELD_LABELS[change.field]}</dt>
            <dd className="m-0" title={metadataValue(change.after)}>
              {metadataValue(change.before)} →{" "}
              <span className="text-wb-text">{metadataValue(change.after)}</span>
            </dd>
          </div>
        ))}
      </dl>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await wb.applyPdfMetadata(item.id, token);
          } catch (error) {
            wb.failure(error, () => wb.applyPdfMetadata(item.id, token));
          } finally {
            setBusy(false);
          }
        }}
      >
        使用 PDF 中识别的信息
      </Button>
    </div>
  );
}
