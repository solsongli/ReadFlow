import { useState } from "react";
import { loadDeveloperStoredConfig } from "@/platform/config/persisted-config.js";
import type { blocksApi } from "./api.js";
export function useLocalReview(
  api: ReturnType<typeof blocksApi>,
  attachment: string,
  language: string,
  refresh: () => Promise<void>,
  error: (message: string) => void,
) {
  const [pending, setPending] = useState(false);
  return {
    pending,
    run: async () => {
      if (pending) return;
      setPending(true);
      try {
        await api.recheck({
          attachment_id: attachment,
          language,
          glossary_id: loadDeveloperStoredConfig().glossaryId || "",
        });
        await refresh();
        error("");
      } catch (failure) {
        error((failure as Error).message || "本地质检未完成，请重试。");
      } finally {
        setPending(false);
      }
    },
  };
}
