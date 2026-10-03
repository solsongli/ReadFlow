import type { WorkbenchApi } from "@/platform/api/workbench.js";
interface ReaderProgressMessage { itemId: string; page: number; pages: number }
function validReaderProgress(page: number, pages: number) { return Number.isInteger(page) && Number.isInteger(pages) && page >= 1 && page <= pages && pages <= 100000; }
import { mergeReaderRow } from "../domain/reader-state.js";
import type { WorkbenchStore } from "../domain/workbench-store.js";

export function createReaderSync({ api, store, notify, failure, loadDetail, refreshDesk, refreshNotes }: {
  api: WorkbenchApi;
  store: WorkbenchStore;
  notify: (text: string, tone?: "info" | "success" | "error") => void;
  failure?: (error: unknown, retry: () => Promise<unknown>) => void;
  loadDetail: (id: string) => Promise<void>;
  refreshDesk: () => Promise<void>;
  refreshNotes?: () => Promise<void>;
}) {
  // Per-workbench queues serialize writes for each item; slow requests cannot overwrite a newer page.
  const pending = new Map<string, { page?: number; pages?: number }>();
  const saving = new Map<string, Promise<void>>();
  const noteRequests = new Map<string, number>();
  function opened(itemId: string, progress: { page?: number; pages?: number } = {}): Promise<void> {
    pending.set(itemId, progress);
    const running = saving.get(itemId);
    if (running) return running;
    const work = async () => {
      try {
        while (pending.has(itemId)) {
          const next = pending.get(itemId)!;
          pending.delete(itemId);
          try {
            const row = await api.markOpened(itemId, next);
            if (row?.id === itemId) {
              const state = store.getSnapshot();
              const latest = state.list.result?.items.find((entry) => entry.id === itemId) ?? state.tabs.find((tab) => tab.itemId === itemId)?.row;
              const updated = latest ? { ...latest, read_page: row.read_page, read_pages: row.read_pages,
                read_status: row.read_status, last_opened_at: row.last_opened_at, updated_at: row.updated_at } : row;
              store.actions.patch(mergeReaderRow(state, updated));
            }
          } catch (error) { if (failure) failure(error, () => opened(itemId, next)); else notify("阅读进度未能保存，下次翻页会重试。", "error"); }
        }
      } finally { saving.delete(itemId); }
    };
    const promise = work();
    saving.set(itemId, promise);
    void promise.then(() => { if (saving.get(itemId) === promise) saving.delete(itemId); });
    return promise;
  }
  function progress(message: ReaderProgressMessage) {
    if (!validReaderProgress(message.page, message.pages)) return Promise.resolve();
    return opened(message.itemId, { page: message.page, pages: message.pages });
  }
  async function notesChanged(itemId: string) {
    const version = (noteRequests.get(itemId) ?? 0) + 1;
    noteRequests.set(itemId, version);
    try {
      const row = await api.row(itemId);
      if (noteRequests.get(itemId) !== version || row.id !== itemId) return;
      // A count response must not overwrite progress saved concurrently.
      const state = store.getSnapshot();
      const latest = state.list.result?.items.find((entry) => entry.id === itemId) ?? state.tabs.find((tab) => tab.itemId === itemId)?.row;
      store.actions.patch(mergeReaderRow(state, latest ? { ...latest, notes_count: row.notes_count, annotations_count: row.annotations_count } : row));
      if (state.selectedIds.length === 1 && state.selectedIds[0] === itemId) await loadDetail(itemId);
      await Promise.all([refreshDesk(), refreshNotes?.()]);
    } catch { notify("笔记与批注已保存，文献统计未能刷新。", "error"); }
  }
  return { opened, progress, notesChanged };
}
