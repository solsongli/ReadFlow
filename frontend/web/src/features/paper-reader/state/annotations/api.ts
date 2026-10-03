import { buildApiHeaders, buildApiUrl } from "@/platform/config/runtime.js";
import type { Annotation, Semantics } from "../../domain/annotations/types.js";
export function annotationApi(item: string) {
  const root = `/workbench/items/${encodeURIComponent(item)}/annotations`;
  async function request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(buildApiUrl("/api/research", root + path), {
      method,
      headers: buildApiHeaders({ "Content-Type": "application/json" }),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.error?.message || "批注操作未能完成，请重试。");
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    list: async (): Promise<Annotation[]> => (await request("")).items,
    save: (row: Annotation, exists: boolean): Promise<Annotation> =>
      request(exists ? `/${encodeURIComponent(row.id)}` : "", exists ? "PATCH" : "POST", row),
    remove: (id: string, policy = "") =>
      request(`/${encodeURIComponent(id)}?canvas_policy=${policy}`, "DELETE"),
    references: async (): Promise<Array<{ canvas_id: string; annotation_id: string }>> => {
      const response = await fetch(
        buildApiUrl("/api/research", `/workbench/canvases/references?item_id=${encodeURIComponent(item)}`),
        { headers: buildApiHeaders() },
      );
      if (!response.ok) {
        throw new Error("无法检查画布引用，请重试。");
      }
      return (await response.json()).items;
    },
    cards: async (): Promise<Array<{ annotation_id: string }>> => {
      const response = await fetch(
        buildApiUrl("/api/research", `/workbench/flashcards?item_id=${encodeURIComponent(item)}`),
        { headers: buildApiHeaders() },
      );
      if (!response.ok) throw new Error("无法检查闪卡引用，请重试。");
      return (await response.json()).items;
    },
    export: (ids: string[], semantics: Semantics, as_note: boolean) =>
      request("/export", "POST", { ids, semantics, as_note }),
    image: async (row: Annotation): Promise<string> => {
      const response = await fetch(
        buildApiUrl("/api/research", `/annotations/${encodeURIComponent(row.id)}/image`),
        {
          headers: buildApiHeaders(),
        },
      );
      if (!response.ok) {
        throw new Error("截图加载失败。");
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        void response
          .blob()
          .then((blob) => reader.readAsDataURL(blob))
          .catch(reject);
      });
    },
  };
}
