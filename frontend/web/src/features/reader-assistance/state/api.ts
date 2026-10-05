import { buildApiHeaders, buildApiUrl } from "@/platform/config/runtime.js";
import type { AiStatus, Conversation } from "../domain/assistance.js";
export function assistanceApi(item: string) {
  const root = `/workbench/items/${encodeURIComponent(item)}/assistance`;
  async function request(path: string, method = "GET", body?: unknown, signal?: AbortSignal) {
    const response = await fetch(buildApiUrl("/api/research", path), {
      method,
      headers: buildApiHeaders({ "Content-Type": "application/json" }),
      signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw { code: data?.error?.code, status: response.status };
    }
    return response;
  }
  return {
    status: async (signal?: AbortSignal): Promise<AiStatus> =>
      (await request("/workbench/assistance/status", "GET", undefined, signal)).json(),
    load: async (signal?: AbortSignal): Promise<Conversation> =>
      (await request(root + "/conversation", "GET", undefined, signal)).json(),
    clear: async (): Promise<Conversation> => (await request(root + "/conversation", "DELETE")).json(),
    translate: async (text: string, translation: Record<string, unknown>, signal?: AbortSignal) => {
      const value = await (await request(root + "/translate", "POST", { text, translation }, signal)).json();
      if (value.error) {
        throw value.error;
      }
      return value as { text: string; service: string; notices?: string[] };
    },
    ask: async (
      body: unknown,
      signal: AbortSignal,
      event: (value: { type: string; text?: string; code?: string }) => void,
    ) => {
      const response = await request(root + "/ask", "POST", body, signal);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || "";
          for (const block of blocks) {
            const data = block
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");
            if (data) {
              event(JSON.parse(data));
            }
          }
          if (done) {
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
