import type { Position } from "./types.js";
export interface History {
  entries: Position[];
  cursor: number;
}
export const initialHistory = (): History => ({ entries: [], cursor: -1 });
export function jumpHistory(history: History, from: Position, to: Position): History {
  const entries = history.entries.slice(0, history.cursor + 1);
  if (entries.length) {
    entries[entries.length - 1] = from;
  } else {
    entries.push(from);
  }
  entries.push(to);
  return { entries: entries.slice(-100), cursor: Math.min(entries.length - 1, 99) };
}
export function moveHistory(
  history: History,
  from: Position,
  direction: -1 | 1,
): { history: History; target: Position | null } {
  const cursor = history.cursor + direction;
  if (cursor < 0 || cursor >= history.entries.length) {
    return { history, target: null };
  }
  const entries = history.entries.map((entry, index) => (index === history.cursor ? from : entry));
  return { history: { entries, cursor }, target: entries[cursor] };
}
export function correspondingPage(page: number, otherPages: number): number {
  return Math.max(1, Math.min(otherPages, page));
}
export function offsets(heights: number[], scale: number, gap = 20): number[] {
  const result = [gap];
  heights.forEach((height) => result.push(result[result.length - 1] + height * scale + gap));
  return result;
}
export function pageAt(tops: number[], scroll: number): number {
  let low = 0,
    high = tops.length - 2;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (tops[mid] <= scroll + 1) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(0, low);
}
export function visiblePages(tops: number[], scroll: number, viewport: number, buffer = 1): number[] {
  const first = Math.max(0, pageAt(tops, scroll) - buffer),
    last = Math.min(tops.length - 2, pageAt(tops, scroll + viewport) + buffer);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
export function anchoredScroll(
  oldScroll: number,
  pointer: number,
  oldScale: number,
  newScale: number,
): number {
  return Math.max(0, ((oldScroll + pointer) * newScale) / oldScale - pointer);
}
export function externalLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    return ["http:", "https:", "mailto:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/** Keep zoomed HiDPI pages within a per-canvas pixel budget, rather than allocating gigapixels. */
export function rasterRatio(width: number, height: number, deviceRatio: number): number {
  return Math.min(Math.max(1, deviceRatio || 1), 2.5, Math.sqrt(16_000_000 / Math.max(1, width * height)));
}
