import type { ImportPayload } from "@/platform/contracts/research-library.js";

/** CSL JSON array, or Zotero Web API items (array of {key, data}). */
export function payloadOf(text: string, fileName: string): ImportPayload {
  const data = JSON.parse(text);
  const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
  if (!items) throw new Error("文件里没有文献条目：需要 CSL JSON 数组或 Zotero 导出的条目列表。");
  const zotero = items.some((entry: Record<string, unknown>) => entry && typeof entry === "object" && "data" in entry && "key" in entry);
  return { format: zotero ? "zotero-api" : "csl-json", source_id: "file:" + fileName, data: items, collections: zotero ? data?.collections ?? [] : undefined };
}

