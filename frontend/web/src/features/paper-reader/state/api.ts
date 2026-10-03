import { buildApiHeaders, buildApiUrl } from "@/platform/config/runtime.js";
import type { Bookmark } from "../domain/types.js";
export interface ReadingData {
  bookmarks: Bookmark[];
  seconds: number;
}
export function readingApi(itemId: string) {
  const root = `/workbench/items/${encodeURIComponent(itemId)}/reader`;
  async function request(path = "", method = "GET", body?: unknown): Promise<ReadingData> {
    const response = await fetch(buildApiUrl("/api/research", root + path), {
      method,
      headers: buildApiHeaders({ "Content-Type": "application/json" }),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      throw new Error("阅读记录未能保存，请重试。");
    }
    return response.json();
  }
  return {
    load: () => request(),
    add: (page: number, offset: number, name: string, mode: "source" | "translated") =>
      request("/bookmarks", "POST", { page, offset, name, mode }),
    remove: (id: string) => request(`/bookmarks/${encodeURIComponent(id)}`, "DELETE"),
    time: (seconds: number, id: string) => request("/time", "POST", { seconds, id }),
  };
}
