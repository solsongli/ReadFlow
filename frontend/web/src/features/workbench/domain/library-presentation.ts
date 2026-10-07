import type { WorkbenchView } from "@/platform/contracts/workbench.js";

type LibraryContext = { view: WorkbenchView; group?: string | null; tag?: string | null; query?: string };

/** Filters in effect; the count itself lives in the header badge (libraryCount). */
export function librarySubtitle({ view, group, tag, query, unread }: LibraryContext & { total?: number; unread?: number }): string {
  const filters = [group && `分组 ${group}`, tag && `标签 ${tag}`, query && `搜索「${query}」`].filter(Boolean);
  if (filters.length) return filters.join(" · ");
  return view === "all" ? `${unread ?? "…"} 篇待读` : "";
}

/** "共 N 篇" for the whole library or the trash, "N / 总数 篇" for any subset of the live library. */
export function libraryCount({ view, group, tag, query, total, all }: LibraryContext & { total?: number; all?: number }): string {
  const shown = total ?? "…";
  const subset = view !== "trash" && (view !== "all" || Boolean(group || tag || query));
  return subset && all != null ? `${shown} / ${all} 篇` : `共 ${shown} 篇`;
}

const EMPTY_VIEWS = {
  all: { icon: "import", title: "这里还没有文献" },
  trash: { icon: "trash", title: "回收站是空的" },
  unread: { icon: "unread", title: "没有待读文献" },
  starred: { icon: "starred", title: "还没有星标文献" },
  recent: { icon: "recent", title: "还没有阅读记录" },
  unfiled: { icon: "group", title: "没有未分组的文献" },
  notes: { icon: "notes", title: "还没有带笔记或批注的文献" },
  needs_ocr: { icon: "ocr", title: "没有需要 OCR 的文献" },
  missing_doi: { icon: "doi", title: "没有缺少 DOI 的文献" },
  no_zh_title: { icon: "translation", title: "没有缺少中文题名的文献" },
} as const;

export function libraryEmptyState({ view, group, tag, query }: LibraryContext) {
  if (query) return { icon: "search" as const, title: `没有找到与「${query}」相关的文献`, hint: "搜索覆盖中英题名、作者、DOI、出处、引用键和标签。" };
  if (group) return { icon: "group" as const, title: "这个分组还没有文献", hint: "从文献库拖入文献，或使用“加入分组”。" };
  if (tag) return { icon: "tag" as const, title: "这个标签下还没有文献", hint: undefined };
  return { ...EMPTY_VIEWS[view], hint: undefined };
}
