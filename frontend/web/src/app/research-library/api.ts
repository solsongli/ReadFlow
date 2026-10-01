import type { AiStatus, Collection, EvidenceResult, ImportPayload, ImportPlan, ImportResult, ItemInput, LibraryResult, Note, NoteInput, PaperItem } from "./types";

const ROOT = "/api/research";
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "ApiError"; }
}
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(ROOT + path, { ...options, headers: { Accept: "application/json", ...options.headers } });
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const data = await response.json();
      const detail = data.message ?? data.detail ?? data.error;
      if (typeof detail === "string") message = detail;
      else if (detail && typeof detail.message === "string") message = detail.message;
    } catch { /* Keep the HTTP status if the server returned a non-JSON error. */ }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}
function json(body: unknown, method = "POST"): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
export const api = {
  items(query = "", collectionId = "", signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (collectionId) params.set("collection_id", collectionId);
    return request<LibraryResult>("/items?" + params, { signal });
  },
  item: (id: string) => request<PaperItem>("/items/" + encodeURIComponent(id)),
  createItem: (value: ItemInput) => request<PaperItem>("/items", json(value)),
  updateItem: (id: string, value: ItemInput) => request<PaperItem>("/items/" + encodeURIComponent(id), json(value, "PATCH")),
  createCollection: (name: string, parent_id: string | null) => request<Collection>("/collections", json({ name, parent_id })),
  upload(file: File, itemId?: string) {
    const params = new URLSearchParams({ filename: file.name });
    if (itemId) params.set("item_id", itemId);
    return request<PaperItem | { item: PaperItem; attachment: unknown }>("/files?" + params,
      { method: "POST", headers: { "Content-Type": "application/pdf" }, body: file });
  },
  createNote: (id: string, value: NoteInput) => request<Note>("/items/" + encodeURIComponent(id) + "/notes", json(value)),
  updateNote: (id: string, value: NoteInput) => request<Note>("/notes/" + encodeURIComponent(id), json(value, "PATCH")),
  deleteNote: (id: string) => request<{ deleted: boolean }>("/notes/" + encodeURIComponent(id), { method: "DELETE" }),
  previewImport: (payload: ImportPayload) => request<ImportPlan>("/imports/preview", json(payload)),
  commitImport: (payload: ImportPayload, plan_hash: string) => request<ImportResult>("/imports/commit", json({ payload, plan_hash })),
  localZoteroPreview: (sourceNamespace: string) => request<{ plan: ImportPlan; payload: ImportPayload }>("/imports/zotero-local/preview?" + new URLSearchParams({ source_namespace: sourceNamespace.trim() })),
  evidence: (id: string, query: string, attachment_id?: string) =>
    request<EvidenceResult>("/items/" + encodeURIComponent(id) + "/evidence", json({ query, ...(attachment_id ? { attachment_id } : {}) })),
  aiStatus: () => request<AiStatus>("/ai/status"),
};
export function pdfUrl(id: string): string {
  return ROOT + "/attachments/" + encodeURIComponent(id) + "/pdf";
}
export function exportUrl(id: string, format: "markdown" | "bibtex" | "csljson" | "sourcejson"): string {
  return ROOT + "/items/" + encodeURIComponent(id) + "/export?format=" + format;
}
