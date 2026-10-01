/** Native research-library note host. No model calls, credentials, or local-note migration. */
import { getReaderAdapters, setReaderAdapters } from "@retainpdf/reader/adapters";
import type { ReaderAnnotationScope, ReaderAnnotationsDataPort, ReaderNote } from "@retainpdf/reader/contracts";

type NativeRoute = { itemId: string; attachmentId: string; documentId: string };
type ServerNote = {
  id: string; item_id: string; attachment_id: string | null; page_idx: number | null;
  quote: string; translated_quote: string; body: string; created_at: string;
  reader_annotation?: Record<string, unknown>;
};
type NativeItem = {
  id: string; attachments: Array<{ id: string; item_id: string; sha256: string; page_count: number }>;
  notes: ServerNote[];
};
export function parseNativeReaderRoute(search: string): NativeRoute | null {
  const params = new URLSearchParams(search);
  if (!params.has("research_item_id") && !params.has("attachment_id")) return null;
  const itemId = params.get("research_item_id") || "";
  const attachmentId = params.get("attachment_id") || "";
  const documentId = params.get("document_id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(itemId) || !/^[0-9a-f-]{36}$/i.test(attachmentId)
      || !/^[0-9a-f]{64}$/.test(documentId) || params.get("job_id")) {
    throw new Error("文献或附件来源参数不完整，请从文献库重新打开。");
  }
  return { itemId, attachmentId, documentId };
}
export function createNativeReaderAnnotationsPort(route: NativeRoute, fetchResource: typeof fetch = fetch): ReaderAnnotationsDataPort {
  const key = `research:${route.itemId}:${route.attachmentId}:${route.documentId}`;
  function assertScope(scope: ReaderAnnotationScope) {
    if (scope.key !== key || scope.documentId !== route.documentId) throw new Error("批注与当前文献不匹配。");
  }
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchResource("/api/research" + path, {
      ...init, credentials: "same-origin",
      headers: { Accept: "application/json", ...init.headers },
    });
    if (!response.ok) {
      let message = `本地文献库请求失败（${response.status}）。`;
      try { const body = await response.json(); if (typeof body?.error?.message === "string") message = body.error.message; } catch { /* Keep status. */ }
      throw new Error(message);
    }
    return response.status === 204 ? undefined as T : response.json();
  }
  async function owned(scope: ReaderAnnotationScope, signal?: AbortSignal): Promise<NativeItem> {
    assertScope(scope);
    const item = await request<NativeItem>("/items/" + encodeURIComponent(route.itemId), { signal });
    const attachment = item.attachments?.find((entry) => entry.id === route.attachmentId);
    if (item.id !== route.itemId || !attachment || attachment.item_id !== route.itemId || attachment.sha256 !== route.documentId) {
      throw new Error("附件归属或原 PDF 哈希不匹配，批注未读写。");
    }
    return item;
  }
  function matches(note: ServerNote): boolean {
    return note.item_id === route.itemId && note.attachment_id === route.attachmentId
      && Number.isInteger(note.page_idx) && note.page_idx! >= 0 && Boolean(note.quote);
  }
  function view(note: ServerNote): ReaderNote {
    if (!matches(note)) throw new Error("批注缺少当前原 PDF 的有效页码。");
    const raw = note.reader_annotation;
    if (raw && (raw.id !== note.id || raw.itemId !== route.itemId || raw.attachmentId !== route.attachmentId
        || raw.documentId !== route.documentId || raw.page !== note.page_idx! + 1 || raw.pane !== "source")) {
      throw new Error("已保存批注的来源锚点不一致。");
    }
    return { id: note.id, page: note.page_idx! + 1, pane: "source", quote: note.quote, note: note.body,
      ...(note.translated_quote ? { translatedQuote: note.translated_quote } : {}),
      createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : note.created_at };
  }
  function body(note: ReaderNote): Record<string, unknown> {
    if (note.pane !== "source" || !Number.isInteger(note.page) || note.page < 1) {
      throw new Error("首版只持久保存已核实的原 PDF 页批注；译文页尚未建立原文映射。");
    }
    return {
      attachment_id: route.attachmentId, page_idx: note.page - 1, quote: note.quote,
      body: note.note, translated_quote: note.translatedQuote || "",
      reader_annotation: { ...note, itemId: route.itemId, attachmentId: route.attachmentId, documentId: route.documentId },
    };
  }
  const json = (value: unknown, method: string, signal?: AbortSignal): RequestInit => ({
    method, signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
  });
  return {
    resolveScope: (document) => !document.jobId && document.documentId === route.documentId ? { key, documentId: route.documentId } : null,
    load: async (scope, options) => {
      const item = await owned(scope, options?.signal);
      const pageCount = item.attachments.find((entry) => entry.id === route.attachmentId)!.page_count;
      return item.notes.filter(matches).map((note) => {
        if (note.page_idx! >= pageCount) throw new Error("批注页码超出原 PDF，未创建替代页码。");
        return view(note);
      });
    },
    create: async (scope, note, options) => {
      await owned(scope, options?.signal);
      return view(await request<ServerNote>("/items/" + encodeURIComponent(route.itemId) + "/notes", json(body(note), "POST", options?.signal)));
    },
    update: async (scope, note, options) => {
      const item = await owned(scope, options?.signal);
      const original = item.notes.find((entry) => entry.id === note.id && matches(entry));
      if (!original) throw new Error("批注不属于当前文献和附件，未修改。");
      // Preserve imported/raw notes: only native notes receive the native extension.
      const value = original.reader_annotation ? body(note) : { body: note.note };
      if (original.reader_annotation) {
        // An edit changes Reader fields while retaining captured geometry/unknown extensions.
        // The server still validates the immutable paper, attachment, hash, and page binding.
        value.reader_annotation = { ...original.reader_annotation,
          ...(value.reader_annotation as Record<string, unknown>) };
      }
      return view(await request<ServerNote>("/notes/" + encodeURIComponent(note.id), json(value, "PATCH", options?.signal)));
    },
    remove: async (scope, id, options) => {
      const item = await owned(scope, options?.signal);
      if (!item.notes.some((entry) => entry.id === id && matches(entry))) throw new Error("批注不属于当前文献和附件，未删除。");
      await request<void>("/notes/" + encodeURIComponent(id), { method: "DELETE", signal: options?.signal });
    },
  };
}
export function configureNativeReaderAnnotations(search = globalThis.location?.search || ""): boolean {
  const current = getReaderAdapters();
  if (!current) throw new Error("Reader host adapters must be registered first.");
  try {
    const route = parseNativeReaderRoute(search);
    if (!route) return false;
    setReaderAdapters({ ...current, annotationDataPort: createNativeReaderAnnotationsPort(route) });
  } catch (error) {
    const unavailable = async (): Promise<never> => { throw error; };
    setReaderAdapters({ ...current, annotationDataPort: {
      resolveScope: (document) => ({ key: "invalid-research-route", documentId: document.documentId || "" }),
      load: unavailable, create: unavailable, update: unavailable, remove: unavailable,
    } });
  }
  return true;
}
