import type { TagColor } from "@/platform/contracts/workbench.js";

/** Theme-token dot classes for palette slots 1–7 (index 0 is unused). */
export const TAG_DOT = ["", "bg-wb-tag-1", "bg-wb-tag-2", "bg-wb-tag-3", "bg-wb-tag-4", "bg-wb-tag-5", "bg-wb-tag-6", "bg-wb-tag-7"];
export const TAG_COLOR_NAMES = ["", "橙", "青", "蓝", "紫", "红", "绿", "灰"];

export function normalizeTag(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Zotero behaviour: if every selected item already has the tag, remove it; otherwise add it to all. */
export function toggleTagPlan(tagLists: string[][], name: string): { add: string[]; remove: string[] } {
  const everyone = tagLists.length > 0 && tagLists.every((tags) => tags.includes(name));
  return everyone ? { add: [], remove: [name] } : { add: [name], remove: [] };
}

/** Colored tags present on a row, in keyboard-position order (what Zotero draws as dots beside the title). */
export function rowColoredTags(tags: string[], colors: TagColor[]): TagColor[] {
  const present = new Set(tags);
  return colors.filter((entry) => present.has(entry.name)).sort((a, b) => a.position - b.position);
}

/** Autocomplete: prefix matches first, then substring matches, excluding tags the item already has. */
export function suggestTags(all: string[], typed: string, existing: string[], limit = 8): string[] {
  const query = normalizeTag(typed).toLocaleLowerCase();
  const taken = new Set(existing);
  const pool = all.filter((name) => !taken.has(name));
  if (!query) return pool.slice(0, limit);
  const lower = (name: string) => name.toLocaleLowerCase();
  const prefix = pool.filter((name) => lower(name).startsWith(query));
  const inner = pool.filter((name) => !lower(name).startsWith(query) && lower(name).includes(query));
  return [...prefix, ...inner].slice(0, limit);
}

/** Sidebar order: colored tags by position first, then the rest alphabetically. */
export function sidebarTagOrder<T extends { name: string }>(tags: T[], colors: TagColor[]): T[] {
  const position = new Map(colors.map((entry) => [entry.name, entry.position]));
  return [...tags].sort((a, b) => {
    const pa = position.get(a.name) ?? 99,
      pb = position.get(b.name) ?? 99;
    return pa - pb || a.name.localeCompare(b.name, "zh-CN");
  });
}
