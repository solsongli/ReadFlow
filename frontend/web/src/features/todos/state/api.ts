import { buildApiHeaders, buildApiUrl } from "@/platform/config/runtime.js";
import type { Todo } from "../domain/model.js";
const root = "/workbench/todos";
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(buildApiUrl("/api/research", root + path), {
    method,
    headers: buildApiHeaders({ "Content-Type": "application/json" }),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || "待办暂时无法保存，请重试。");
  }
  return response.status === 204 ? null : response.json();
}
export type TodoPatch = Partial<Pick<Todo, "title" | "done" | "due" | "item_id">>;
export const todoApi = {
  list: async (): Promise<Todo[]> => (await request("")).items,
  create: (data: { title: string; due?: string | null; item_id?: string | null }): Promise<Todo> =>
    request("", "POST", data),
  patch: (id: string, data: TodoPatch): Promise<Todo> => request(`/${encodeURIComponent(id)}`, "PATCH", data),
  remove: (id: string) => request(`/${encodeURIComponent(id)}`, "DELETE"),
  reorder: async (ids: string[]): Promise<Todo[]> => (await request("/reorder", "POST", { ids })).items,
  clearDone: (): Promise<{ removed: number }> => request("/clear-done", "POST", {}),
};
export type TodoApi = typeof todoApi;
