import type { ImportPayload, ItemInput, NoteInput, PaperItem } from "@/platform/contracts/research-library.js";

export const EMPTY_ITEM: ItemInput = {
  title: "", item_type: "journalArticle", authors: [], date: "", doi: "", url: "", abstract: "", tags: [], collection_ids: [],
};

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
export function splitTags(text: string): string[] {
  return [...new Set(text.split(/[,，;；\n]/).map((s) => s.trim()).filter(Boolean))];
}
export function itemInput(item: PaperItem): ItemInput {
  return { title: item.title, item_type: item.item_type, authors: [...item.authors], date: item.date,
    doi: item.doi, url: item.url, abstract: item.abstract, tags: [...item.tags], collection_ids: [...item.collection_ids] };
}
export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}
export function buildImportPayload(raw: unknown, sourceId: string): ImportPayload {
  const source_id = sourceId.trim();
  if (!source_id) throw new Error("请填写固定的导入来源名称；重复导入请沿用同一名称。");
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (obj.format === "zotero-api" || obj.format === "csl-json") {
      const nested = obj.data && typeof obj.data === "object" && !Array.isArray(obj.data) ? obj.data as Record<string, unknown> : null;
      if (obj.format === "csl-json" && !Array.isArray(obj.data)) throw new Error("CSL JSON 的 data 必须是数组。");
      if (obj.format === "zotero-api" && !Array.isArray(obj.data) && !Array.isArray(nested?.items)) throw new Error("API 快照的 data 必须是数组或包含 items 数组的对象。");
      return { format: obj.format, source_id, data: obj.data,
        ...(Array.isArray(obj.collections) ? { collections: obj.collections } : {}),
        ...(obj.snapshot && typeof obj.snapshot === "object" && !Array.isArray(obj.snapshot) ? { snapshot: obj.snapshot as Record<string, unknown> } : {}) };
    }
    if (Array.isArray(obj.items)) {
      return { format: "zotero-api", source_id, data: obj.items,
        ...(Array.isArray(obj.collections) ? { collections: obj.collections } : {}) };
    }
    throw new Error("请选择 Zotero CSL JSON 导出文件或包含 items 数组的 API JSON 快照。");
  }
  if (!Array.isArray(raw)) throw new Error("JSON 顶层必须是数组或导入快照对象。");
  const zotero = raw.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const value = entry as Record<string, unknown>;
    const data = value.data as Record<string, unknown> | undefined;
    return typeof value.itemType === "string" || typeof data?.itemType === "string";
  });
  return { format: zotero ? "zotero-api" : "csl-json", source_id, data: raw };
}
export function validateNote(input: NoteInput, pageCount?: number | null): string | null {
  if (!input.body.trim() && !input.quote.trim() && !input.translated_quote.trim()) return "请填写笔记或原文摘录。";
  if (input.page_idx !== null) {
    if (!input.attachment_id) return "带页码的笔记需要关联 PDF。";
    if (!Number.isInteger(input.page_idx) || input.page_idx < 0) return "页码必须是大于零的整数。";
    if (pageCount && input.page_idx >= pageCount) return `页码不能超过 ${pageCount}。`;
  }
  return null;
}
export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN");
}
export function countConflicts(value: number | unknown[]): number {
  return Array.isArray(value) ? value.length : Number(value || 0);
}
