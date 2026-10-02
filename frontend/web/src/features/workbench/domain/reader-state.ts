import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import type { WorkbenchState } from "./workbench-store.js";

/** Patch only known occurrences of one row; the current query/order/selection remain intact. */
export function mergeReaderRow(state: WorkbenchState, row: WorkbenchRow, now: Date = new Date()): Partial<WorkbenchState> {
  const result = state.list.result;
  const desk = state.desk.data;
  const before = result?.items.find((entry) => entry.id === row.id)
    ?? desk?.continue_reading.find((entry) => entry.id === row.id)
    ?? desk?.to_read.find((entry) => entry.id === row.id)
    ?? desk?.recent_items.find((entry) => entry.id === row.id)
    ?? state.tabs.find((tab) => tab.itemId === row.id)?.row;
  const replace = (rows: WorkbenchRow[]) => rows.map((entry) => entry.id === row.id ? row : entry);
  const counts = result ? { ...result.counts } : null;
  if (counts && before) {
    counts.unread += Number(row.read_status === "unread") - Number(before.read_status === "unread");
    counts.recent += Number(Boolean(row.last_opened_at)) - Number(Boolean(before.last_opened_at));
    counts.notes = (counts.notes ?? 0) + Number(row.notes_count > 0) - Number(before.notes_count > 0);
  }
  const nextDesk = desk ? { ...desk, recent_items: replace(desk.recent_items), to_read: replace(desk.to_read).filter((entry) => entry.read_status === "unread") } : null;
  if (nextDesk) {
    nextDesk.continue_reading = row.last_opened_at && !row.deleted_at
      ? [row, ...desk!.continue_reading.filter((entry) => entry.id !== row.id)]
        .sort((a, b) => (b.last_opened_at ?? "").localeCompare(a.last_opened_at ?? "")).slice(0, 5)
      : replace(desk!.continue_reading);
    if (before) {
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const openedToday = (value: string | null) => Boolean(value && new Date(value).getTime() >= midnight);
      nextDesk.today = { ...nextDesk.today, opened: nextDesk.today.opened + Number(openedToday(row.last_opened_at)) - Number(openedToday(before.last_opened_at)) };
    }
    if (nextDesk.counts && before) nextDesk.counts = {
      ...nextDesk.counts,
      notes: nextDesk.counts.notes + row.notes_count - row.annotations_count - before.notes_count + before.annotations_count,
      annotations: nextDesk.counts.annotations + row.annotations_count - before.annotations_count,
    };
  }
  return {
    list: result ? { ...state.list, result: { ...result, items: replace(result.items), counts: counts! } } : state.list,
    desk: nextDesk ? { ...state.desk, data: nextDesk } : state.desk,
    tabs: state.tabs.map((tab) => tab.itemId === row.id ? { ...tab, row } : tab),
  };
}
