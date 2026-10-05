import { buildApiHeaders, buildApiUrl } from "@/platform/config/runtime.js";
export function blocksApi(item: string, attachment: string, language = "zh-CN") {
  const root = `/workbench/items/${encodeURIComponent(item)}/blocks`;
  const query = `attachment_id=${encodeURIComponent(attachment)}`;
  const url = (suffix: string) =>
    buildApiUrl("/api/research", `${root}${suffix}${suffix.includes("?") ? "&" : "?"}${query}`);
  async function request(suffix: string, method = "GET", body?: unknown) {
    const response = await fetch(url(suffix), {
      method,
      headers: buildApiHeaders({ "Content-Type": "application/json" }),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const value = await response.json().catch(() => null);
      throw Object.assign(new Error(value?.error?.message || "块翻译暂不可用，请重试。"), {
        code: value?.error?.code,
      });
    }
    return response;
  }
  return {
    url,
    status: async () => (await request(`?language=${encodeURIComponent(language)}`)).json(),
    start: async (body: unknown, extract = false) =>
      (await request(extract ? "/extract" : "/translate", "POST", body)).json(),
    render: async (body: unknown) => (await request("/render", "POST", body)).json(),
    terms: async (body: unknown) =>
      (await request("/terms", "PATCH", { ...(body as object), attachment_id: attachment, language })).json(),
    cancel: async (id: string) => request(`/jobs/${encodeURIComponent(id)}/cancel`, "POST", {}),
    latex: async () => (await request("/latex")).blob(),
    pdf: async (format: "layout" | "reflow" = "layout") =>
      (await request(`/files/${format === "layout" ? "translated-layout.pdf" : "translated.pdf"}`)).blob(),
  };
}
