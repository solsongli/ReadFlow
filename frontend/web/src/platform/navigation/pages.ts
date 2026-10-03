// 阅读器导航参数与 URL 契约。

export type ReaderAnchor = {
  page?: number | null;
  pageIdx?: number | null;
  blockId?: string;
};

export type ReaderParams = {
  jobId: string;
  documentId: string;
  /** 0 基页码；来自规范名 page_idx，或历史别名 page。 */
  page: number | null;
  blockId: string;
  mock: string;
};

function defaultReaderSearch(): string {
  return typeof globalThis.location !== "undefined" ? globalThis.location.search : "";
}

/**
 * reader URL 的唯一解析真源：规范名优先，历史别名（page/blockId）兼容。
 * 构造侧只写规范名，见 buildReaderParams。
 */
export function parseReaderParams(search?: string): ReaderParams {
  const query = search ?? defaultReaderSearch();
  const empty: ReaderParams = { jobId: "", documentId: "", page: null, blockId: "", mock: "" };
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    return empty;
  }
  const jobId = `${params.get("job_id") || ""}`.trim();
  const documentId = `${params.get("document_id") || ""}`.trim();
  // page_idx 是阅读器运行时真值，故优先于历史别名 page。
  const rawPage = `${params.get("page_idx") ?? params.get("page") ?? ""}`.trim();
  const pageNum = rawPage === "" ? NaN : Number(rawPage);
  const rawBlock = `${params.get("block_id") ?? params.get("blockId") ?? ""}`.trim();
  const mock = `${params.get("mock") || ""}`.trim();
  return {
    jobId,
    documentId,
    page: Number.isFinite(pageNum) ? Math.max(0, Math.floor(pageNum)) : null,
    blockId: rawBlock,
    mock,
  };
}

/**
 * reader URL 的唯一构造真源：只写规范名 page_idx/block_id，不写 page/blockId 别名。
 * mock 也在此集中注入，供独立 iframe 文档透传。
 */
export function buildReaderParams({
  jobId = "",
  documentId = "",
  anchor = null,
  mock = "",
}: {
  jobId?: string;
  documentId?: string;
  anchor?: ReaderAnchor | null;
  mock?: string;
} = {}): Record<string, string> {
  const id = `${jobId || ""}`.trim();
  const docId = `${documentId || ""}`.trim();
  const params: Record<string, string> = {};
  if (id) params.job_id = id;
  else if (docId) params.document_id = docId;
  const rawPage = anchor?.page ?? anchor?.pageIdx ?? null;
  const pageNum = rawPage === null || rawPage === undefined ? NaN : Number(rawPage);
  if (Number.isFinite(pageNum)) {
    params.page_idx = `${Math.max(0, Math.floor(pageNum))}`;
  }
  const blockId = `${anchor?.blockId || ""}`.trim();
  if (blockId) params.block_id = blockId;
  const scenario = `${mock || ""}`.trim();
  if (scenario) params.mock = scenario;
  return params;
}

export function buildReaderUrl(
  jobId: string,
  anchor: ReaderAnchor | null = null,
  extra: { documentId?: string } = {},
): string {
  const id = `${jobId || ""}`.trim();
  const documentId = `${extra.documentId || ""}`.trim();
  if (!id && !documentId) return "";
  const params = buildReaderParams({ jobId: id, documentId, anchor });
  return `./reader.html?${new URLSearchParams(params).toString()}`;
}

/**
 * 把 URL 上的历史别名（page/blockId）补成规范名（page_idx/block_id）。
 * 返回新的 query；无变化或解析失败返回 null，供 reader 宿主 replaceState 归一化。
 */
export function canonicalizeReaderSearch(search?: string): string | null {
  const query = search ?? defaultReaderSearch();
  const parsed = parseReaderParams(query);
  if (parsed.page === null && !parsed.blockId) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    return null;
  }
  let dirty = false;
  if (parsed.page !== null) {
    if (!params.has("page_idx")) {
      params.set("page_idx", `${parsed.page}`);
      dirty = true;
    }
    // 别名只读：归一后从 URL 移除，保持单一规范形式。
    if (params.has("page")) {
      params.delete("page");
      dirty = true;
    }
  }
  if (parsed.blockId) {
    if (!params.has("block_id")) {
      params.set("block_id", parsed.blockId);
      dirty = true;
    }
    if (params.has("blockId")) {
      params.delete("blockId");
      dirty = true;
    }
  }
  return dirty ? params.toString() : null;
}

/** 全站唯一跳转出口：assign（默认）/ replace（深链、避免返回死循环）。 */
export function navigateTo(url: string, options: { replace?: boolean } = {}): void {
  const target = `${url || ""}`.trim();
  if (!target || typeof window === "undefined") return;
  if (options.replace) window.location.replace(target);
  else window.location.assign(target);
}
