import { buildApiHeaders, buildApiUrl } from "@/platform/config/runtime.js";
import type { CanvasData, CanvasPatch, CanvasReference, CanvasSummary } from "../domain/types.js";
const root = "/workbench/canvases";
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(buildApiUrl("/api/research", root + path), {
    method,
    headers: buildApiHeaders({ "Content-Type": "application/json" }),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || "画布暂时无法保存，请重试。");
  }
  return response.status === 204 ? null : response.json();
}
export const canvasApi = {
  list: async (): Promise<CanvasSummary[]> => (await request("")).items,
  get: (id: string): Promise<CanvasData> => request(`/${encodeURIComponent(id)}`),
  create: (name: string, group_id: string | null): Promise<CanvasData> =>
    request("", "POST", { name, group_id }),
  patch: (id: string, data: CanvasPatch): Promise<CanvasData> =>
    request(`/${encodeURIComponent(id)}`, "PATCH", data),
  remove: (id: string) => request(`/${encodeURIComponent(id)}`, "DELETE"),
  references: async (item: string): Promise<CanvasReference[]> =>
    (await request(`/references?item_id=${encodeURIComponent(item)}`)).items,
  image: async (canvas: string, node: string): Promise<string> => {
    const response = await fetch(
      buildApiUrl(
        "/api/research",
        `${root}/${encodeURIComponent(canvas)}/nodes/${encodeURIComponent(node)}/image`,
      ),
      { headers: buildApiHeaders() },
    );
    if (!response.ok) {
      throw new Error("画布图片加载失败。");
    }
    return URL.createObjectURL(await response.blob());
  },
};
