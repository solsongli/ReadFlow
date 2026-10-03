import type { WorkbenchGroup, WorkbenchRow } from "@/platform/contracts/workbench.js";
import type { Density, ListLayout } from "./workbench-store.js";
import { sectionsOf } from "./presentation.js";

export type VirtualEntry = { key: string; top: number; height: number } & (
  { kind: "row"; row: WorkbenchRow; sectionId?: string; position: number }
  | { kind: "header"; sectionId: string; label: string; count: number; collapsed: boolean }
);
export interface ListMetrics { compact: number; bilingual: number; normal: number; header: number }
export const DEFAULT_LIST_METRICS: ListMetrics = { compact: 36, bilingual: 81, normal: 60, header: 32 };
export interface VirtualList { entries: VirtualEntry[]; headers: number[]; height: number; order: string[]; headerHeight: number }
export function libraryRowHeight(row: WorkbenchRow, density: Density, metrics = DEFAULT_LIST_METRICS): number {
  return density === "compact" ? metrics.compact : row.title_translated ? metrics.bilingual : metrics.normal;
}
export function buildVirtualList(rows: WorkbenchRow[], groups: WorkbenchGroup[], layout: ListLayout, density: Density, browsing: string | null, collapsed: readonly string[], metrics = DEFAULT_LIST_METRICS): VirtualList {
  const entries: VirtualEntry[] = [], headers: number[] = [], order: string[] = [];
  const positions = new Map<string, number>(); let top = 0;
  const addRow = (row: WorkbenchRow, sectionId?: string) => {
    const height = libraryRowHeight(row, density, metrics);
    if (!positions.has(row.id)) { order.push(row.id); positions.set(row.id, order.length); }
    entries.push({ kind: "row", key: `${sectionId ?? "list"}:${row.id}`, row, sectionId, top, height, position: positions.get(row.id)! }); top += height;
  };
  if (layout === "list") rows.forEach((row) => addRow(row));
  else for (const section of sectionsOf(rows, groups, browsing)) {
    const closed = collapsed.includes(section.id); headers.push(entries.length);
    entries.push({ kind: "header", key: `header:${section.id}`, sectionId: section.id, label: section.label, count: section.rows.length, collapsed: closed, top, height: metrics.header }); top += metrics.header;
    if (!closed) section.rows.forEach((row) => addRow(row, section.id));
  }
  return { entries, headers, height: top, order, headerHeight: metrics.header };
}
function firstAt(entries: VirtualEntry[], offset: number): number {
  let lo = 0, hi = entries.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (entries[mid].top + entries[mid].height <= offset) lo = mid + 1; else hi = mid; }
  return lo;
}
export function virtualWindow(list: VirtualList, scrollTop: number, viewport: number, buffer = 280) {
  const top = Math.max(0, scrollTop), height = Math.max(0, viewport);
  const start = firstAt(list.entries, Math.max(0, top - buffer));
  const end = Math.min(list.entries.length, firstAt(list.entries, top + height + buffer) + 1);
  let header = -1, next = -1;
  for (const index of list.headers) { if (list.entries[index].top <= top) header = index; else { next = index; break; } }
  const stickyTop = header < 0 ? 0 : Math.min(top, next < 0 ? Infinity : list.entries[next].top - list.headerHeight);
  const indices = Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
  if (header >= 0 && !indices.includes(header)) indices.unshift(header);
  return { indices, sticky: header, stickyTop };
}
export function rowScrollTarget(list: VirtualList, id: string, scrollTop: number, viewport: number): number {
  const matches = list.entries.filter((entry) => entry.kind === "row" && entry.row.id === id);
  const visible = matches.find((entry) => entry.top >= scrollTop + (list.headers.length ? list.headerHeight : 0) && entry.top + entry.height <= scrollTop + viewport);
  if (visible || !matches.length) return scrollTop;
  const target = matches.reduce((best, entry) => Math.abs(entry.top - scrollTop) < Math.abs(best.top - scrollTop) ? entry : best);
  return Math.max(0, target.top < scrollTop + list.headerHeight ? target.top - (list.headers.length ? list.headerHeight : 0) : target.top + target.height - viewport);
}
