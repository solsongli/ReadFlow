import type { WorkbenchApi } from "@/platform/api/workbench.js";
import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import type { WorkbenchStore } from "../domain/workbench-store.js";

export interface ReaderTarget { page?: number; attachmentId?: string }
export function createReaderActions({ api, store, rowById, notify, failure, opened }: {
  api: WorkbenchApi; store: WorkbenchStore; rowById: (id: string) => WorkbenchRow | undefined;
  notify: (text: string, tone: "error") => void; opened: (id: string) => Promise<void>;
  failure?: (error: unknown, retry: () => Promise<unknown>) => void;
}) {
  return async function openReader(itemId: string, target: ReaderTarget = {}) {
    const get = () => store.getSnapshot();
    let row = rowById(itemId);
    try {
      if (!row && api.row) row = await api.row(itemId);
      let detail = get().detail.item?.id === itemId ? get().detail.item : null;
      if (!row && !detail) detail = await api.item(itemId);
      const title = row?.title ?? detail?.title ?? "阅读";
      const attachmentId = target.attachmentId ?? row?.attachment_id ?? detail?.attachments?.[0]?.id ?? null;
      if (!attachmentId) { notify("这篇文献还没有 PDF 附件。", "error"); return false; }
      const tabId = "reader:" + itemId;
      const existing = get().tabs.find((tab) => tab.id === tabId);
      const page = Number.isInteger(target.page) && target.page! >= 1 && target.page! <= 100000 ? target.page : undefined;
      const sameAttachment = existing && (!existing.attachmentId || existing.attachmentId === attachmentId);
      if (sameAttachment && page == null) { store.actions.patch({ activeTab: tabId }); return true; }
      if (sameAttachment && existing.url && page != null) {
        // An explicit note jump reopens via the existing page_idx anchor; normal tab switches never reload.
        store.actions.updateTab(tabId, { resumePage: page, navigationKey: (existing.navigationKey ?? 0) + 1 });
        store.actions.patch({ activeTab: tabId }); return true;
      }
      store.actions.openTab({ id: tabId, itemId, title, url: null, status: "loading", error: null, row, attachmentId,
        resumePage: page ?? row?.read_page ?? null, navigationKey: (existing?.navigationKey ?? 0) + 1 });
      try {
        const result = await api.nativeReader(attachmentId);
        let url = result.attachment?.reader_url ?? null;
        if (url && row?.translation.status === "done" && row.translation.job_id) {
          const parsed = new URL(url, "http://reader.invalid");
          parsed.searchParams.set("job_id", row.translation.job_id);
          url = parsed.pathname + parsed.search;
        }
        if (!url) throw new Error(result.native_bridge?.message || "阅读器暂不可用。");
        store.actions.updateTab(tabId, { url, status: "ready" });
        void opened(itemId); return true;
      } catch (error) {
        store.actions.updateTab(tabId, { status: "error", error: error instanceof Error ? error.message : "阅读器暂不可用。" });
        failure?.(error, async () => { store.actions.closeTab(tabId); return openReader(itemId, target); });
        return false;
      }
    } catch (error) { if (failure) failure(error, () => openReader(itemId, target)); else notify(error instanceof Error ? error.message : "阅读器暂不可用。", "error"); return false; }
  };
}
