// ReadFlow 工作台 HTTP 客户端。分组即后端 collections（多对多），因此新建/改名沿用 /collections，
// 成员增减与删除走 /workbench/groups/*。条目元数据、上传、导入、原阅读器沿用 researchLibraryApi。
import { buildApiHeaders, buildApiUrl } from "@/platform/config/runtime.js";
import { ResearchApiError, researchLibraryApi } from "@/platform/api/research-library.js";
import type { Collection, Note } from "@/platform/contracts/research-library.js";
import type {
  WorkbenchDesk,
  WorkbenchListQuery,
  WorkbenchListResult,
  WorkbenchRow,
  WorkbenchStatePatch,
  WorkbenchNotesQuery,
  WorkbenchNotesResult,
} from "@/platform/contracts/workbench.js";

const ROOT = "/api/research";

async function errorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    const detail = data?.error ?? data?.detail ?? data?.message;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail.message === "string") return detail.message;
  } catch {
    // Non-JSON bodies keep the HTTP status message.
  }
  return `请求失败（${response.status}）`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(buildApiUrl(ROOT, path), {
    ...init,
    headers: buildApiHeaders({ Accept: "application/json", ...(init.headers as Record<string, string> | undefined) }),
  });
  if (!response.ok) throw new ResearchApiError(await errorMessage(response), response.status);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function send(body: unknown, method = "POST"): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function listQueryParams(query: WorkbenchListQuery): URLSearchParams {
  const params = new URLSearchParams({ view: query.view, sort: query.sort, order: query.order });
  if (query.groupId) params.set("group_id", query.groupId);
  if (query.tag) params.set("tag", query.tag);
  if (query.query) params.set("query", query.query);
  if (query.includeChildren === false) params.set("include_children", "false");
  return params;
}

const id = (value: string) => encodeURIComponent(value);

export function notesQueryParams(query: WorkbenchNotesQuery): URLSearchParams {
  const params = new URLSearchParams({ kind: query.kind ?? "all", limit: String(query.limit ?? 200), offset: String(query.offset ?? 0) });
  if (query.itemId) params.set("item_id", query.itemId);
  if (query.query) params.set("q", query.query);
  return params;
}

export const workbenchApi = {
  notes: (query: WorkbenchNotesQuery, signal?: AbortSignal) =>
    request<WorkbenchNotesResult>("/workbench/notes?" + notesQueryParams(query), { signal }),
  createNote: (itemId: string, value: { body: string }) => request<Note>("/items/" + id(itemId) + "/notes", send(value)),
  // Store.update_note synchronizes native reader_annotation.note/quote under its existing validation.
  updateNote: (noteId: string, body: string) => request<Note>("/notes/" + id(noteId), send({ body }, "PATCH")),
  deleteNote: (noteId: string) => request<void>("/notes/" + id(noteId), { method: "DELETE" }),
  list: (query: WorkbenchListQuery, signal?: AbortSignal) =>
    request<WorkbenchListResult>("/workbench/items?" + listQueryParams(query), { signal }),
  row: (itemId: string) => request<WorkbenchRow>("/workbench/items/" + id(itemId)),
  desk: (since: string, signal?: AbortSignal) =>
    request<WorkbenchDesk>("/workbench/desk?" + new URLSearchParams({ since }), { signal }),
  updateState: (itemId: string, patch: WorkbenchStatePatch) =>
    request<WorkbenchRow>("/workbench/items/" + id(itemId) + "/state", send(patch, "PATCH")),
  markOpened: (itemId: string, progress: { page?: number; pages?: number } = {}) =>
    request<WorkbenchRow>("/workbench/items/" + id(itemId) + "/opened", send(progress)),
  trash: (itemIds: string[]) => request<{ updated: number }>("/workbench/items/trash", send({ item_ids: itemIds })),
  restore: (itemIds: string[]) => request<{ updated: number }>("/workbench/items/restore", send({ item_ids: itemIds })),
  changeGroup: (groupId: string, add: string[], remove: string[] = []) =>
    request<{ added: number; removed: number }>("/workbench/groups/" + id(groupId) + "/items", send({ add, remove })),
  deleteGroup: (groupId: string) => request<{ deleted: number }>("/workbench/groups/" + id(groupId) + "/delete", send({})),
  createGroup: (name: string, parentId: string | null) => request<Collection>("/collections", send({ name, parent_id: parentId })),
  renameGroup: (groupId: string, name: string) => request<Collection>("/collections/" + id(groupId), send({ name }, "PATCH")),
  moveGroup: (groupId: string, parentId: string | null) =>
    request<Collection>("/collections/" + id(groupId), send({ parent_id: parentId }, "PATCH")),
  item: researchLibraryApi.item,
  updateItem: researchLibraryApi.updateItem,
  upload: researchLibraryApi.upload,
  nativeReader: researchLibraryApi.nativeReader,
  previewImport: researchLibraryApi.previewImport,
  commitImport: researchLibraryApi.commitImport,
  ocrJobs: researchLibraryApi.ocrJobs,
  ocrModules: researchLibraryApi.ocrModules,
  startOcrJob: researchLibraryApi.startOcrJob,
  exportItem: researchLibraryApi.download,
};

export type WorkbenchApi = typeof workbenchApi;
export { ResearchApiError };
