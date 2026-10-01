import { buildApiHeaders, buildApiUrl, isMockMode } from "@/platform/config/runtime.js";
import type { ResearchOcrModule, ResearchOcrPreview, ResearchOcrJob, ResearchAgentStatus, ResearchAgentRun, Attachment, Collection, ConnectorStatus, ImportPayload, ImportPlan, ImportResult, ItemInput, LibraryResult, Note, NoteInput, PaperItem } from "@/platform/contracts/research-library.js";

const ROOT = "/api/research";
export class ResearchApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "ResearchApiError"; }
}
async function check(response: Response): Promise<Response> {
  if (response.ok) return response;
  let message = `请求失败（${response.status}）`;
  try {
    const data = await response.json();
    const detail = data.message ?? data.detail ?? data.error ?? data.native_bridge;
    if (typeof detail === "string") message = detail;
    else if (detail && typeof detail.message === "string") message = detail.message;
  } catch { /* Preserve HTTP status for non-JSON errors. */ }
  throw new ResearchApiError(message, response.status);
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (isMockMode()) throw new ResearchApiError("模拟演示不会访问真实文献管理库；请启动隔离本地预览。", 409);
  const response = await check(await fetch(buildApiUrl(ROOT, path), {
    ...options, headers: buildApiHeaders({ Accept: "application/json", ...options.headers }),
  }));
  return response.json() as Promise<T>;
}
function json(body: unknown, method = "POST"): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
export type ResearchExportFormat = "markdown" | "bibtex" | "csljson" | "sourcejson";
export const researchLibraryApi = {
  ocrModules: (signal?: AbortSignal) => request<{ modules: ResearchOcrModule[] }>("/ocr/modules", { signal }),
  ocrPreview: (id: string) => request<ResearchOcrPreview>("/ocr/modules/" + encodeURIComponent(id) + "/preview"),
  installOcr: (id: string, preview_hash: string) => request<{ module_id: string; status: string }>("/ocr/modules/" + encodeURIComponent(id) + "/install", json({ preview_hash })),
  cancelOcrInstall: (id: string) => request<unknown>("/ocr/modules/" + encodeURIComponent(id) + "/cancel", json({})),
  removeOcr: (id: string) => request<unknown>("/ocr/modules/" + encodeURIComponent(id), { method: "DELETE" }),
  ocrJobs: (signal?: AbortSignal) => request<{ jobs: ResearchOcrJob[] }>("/ocr/jobs", { signal }),
  startOcrJob: (attachment_id: string, module_id: string) => request<ResearchOcrJob>("/ocr/jobs", json({ attachment_id, module_id })),
  cancelOcrJob: (id: string) => request<ResearchOcrJob>("/ocr/jobs/" + encodeURIComponent(id) + "/cancel", json({})),
  retryOcrJob: (id: string) => request<ResearchOcrJob>("/ocr/jobs/" + encodeURIComponent(id) + "/retry", json({})),
  agentStatus: (signal?: AbortSignal) => request<ResearchAgentStatus>("/agent/status", { signal }),
  saveAgentConfig: (value: { base_url: string; model: string; api_key: string }) => request<ResearchAgentStatus>("/agent/config", json(value, "PUT")),
  clearAgentConfig: () => request<ResearchAgentStatus>("/agent/config", { method: "DELETE" }),
  startAgentRun: (item_ids: string[], query: string, mode: "source-search" | "agent") => request<ResearchAgentRun>("/agent/runs", json({ item_ids, query, mode })),
  agentRun: (id: string, signal?: AbortSignal) => request<ResearchAgentRun>("/agent/runs/" + encodeURIComponent(id), { signal }),
  cancelAgentRun: (id: string) => request<ResearchAgentRun>("/agent/runs/" + encodeURIComponent(id) + "/cancel", json({})),
  connectorStatus: (signal?: AbortSignal) => request<ConnectorStatus>("/connector/status", { signal }),
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
    return request<{ item: PaperItem; attachment: Attachment; partial_failure?: boolean; duplicate?: boolean }>("/files?" + params,
      { method: "POST", headers: { "Content-Type": "application/pdf" }, body: file });
  },
  nativeReader: (id: string) => request<{ item: PaperItem; attachment: Attachment; native_bridge?: Attachment["native_bridge"]; partial_failure?: boolean }>("/attachments/" + encodeURIComponent(id) + "/native-reader", json({})),
  createNote: (id: string, value: NoteInput) => request<Note>("/items/" + encodeURIComponent(id) + "/notes", json(value)),
  previewImport: (payload: ImportPayload) => request<ImportPlan>("/imports/preview", json(payload)),
  commitImport: (payload: ImportPayload, plan_hash: string) => request<ImportResult>("/imports/commit", json({ payload, plan_hash })),
  async download(id: string, format: ResearchExportFormat, title: string) {
    if (isMockMode()) throw new ResearchApiError("模拟演示不会下载真实文献库数据。", 409);
    const response = await check(await fetch(buildApiUrl(ROOT, "/items/" + encodeURIComponent(id) + "/export?format=" + format), { headers: buildApiHeaders() }));
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    const extension = format === "markdown" ? "md" : format === "bibtex" ? "bib" : "json";
    link.href = url; link.download = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 100) + "." + extension; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
type OptionalResearchApi = "ocrModules" | "ocrPreview" | "installOcr" | "cancelOcrInstall" | "removeOcr" | "ocrJobs" | "startOcrJob" | "cancelOcrJob" | "retryOcrJob" | "connectorStatus" | "agentStatus" | "saveAgentConfig" | "clearAgentConfig" | "startAgentRun" | "agentRun" | "cancelAgentRun";
export type ResearchLibraryApi = Omit<typeof researchLibraryApi, OptionalResearchApi> & Partial<Pick<typeof researchLibraryApi, OptionalResearchApi>>;
