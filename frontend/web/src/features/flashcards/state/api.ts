import { buildApiHeaders, buildApiUrl } from "@/platform/config/runtime.js";
export async function request<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(buildApiUrl("/api/research", "/workbench/" + path), {
    method,
    headers: buildApiHeaders({ "Content-Type": "application/json" }),
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error?.message || "闪卡未能保存，请重试。");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export async function cardReferences(item: string, annotation: string) {
  const result = await request<{ items: Array<{ annotation_id: string | null }> }>(
    `flashcards?item_id=${encodeURIComponent(item)}`,
  );
  return result.items.filter((card) => card.annotation_id === annotation).length;
}
