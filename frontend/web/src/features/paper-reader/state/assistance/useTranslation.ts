import { useRef, useState } from "react";
import {
  assistanceError,
  translationCacheKey,
  type AssistanceError,
  type AssistancePorts,
} from "../../domain/assistance.js";
import type { SelectionAnchor } from "../../domain/annotations/types.js";
import { assistanceApi } from "./api.js";
export function useSelectionTranslation(
  item: string,
  ports: AssistancePorts,
  selected: () => SelectionAnchor[],
) {
  const [card, setCard] = useState<{
    selection: SelectionAnchor[];
    text: string;
    service: string;
    notices?: string[];
  } | null>(null);
  const [error, setError] = useState<AssistanceError | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef<{ quote: string; text: string } | null>(null);
  const cache = useRef(new Map<string, Promise<{ text: string; service: string; notices?: string[] }>>());
  const epoch = useRef(0);
  async function translate(anchors = selected()) {
    const text = anchors.map((anchor) => anchor.quote).join("\n");
    if (!text) {
      return;
    }
    const version = ++epoch.current;
    setCard({ selection: anchors, text: "", service: "" });
    setBusy(true);
    setError(null);
    try {
      const config = await ports.translationConfig();
      const key = translationCacheKey(text, config.translation);
      let work = cache.current.get(key);
      if (!work) {
        work = assistanceApi(item).translate(text, config.translation);
        cache.current.set(key, work);
        void work.catch(() => cache.current.delete(key));
      }
      const result = await work;
      last.current = { quote: text, text: result.text };
      if (version === epoch.current) {
        setCard({ selection: anchors, ...result });
      }
    } catch (failure) {
      if (version === epoch.current) {
        setError(assistanceError(failure));
      }
    } finally {
      if (version === epoch.current) {
        setBusy(false);
      }
    }
  }
  return {
    card,
    existing: (quote: string) => (last.current?.quote === quote ? last.current.text : undefined),
    error,
    busy,
    translate,
    close: () => {
      epoch.current++;
      setCard(null);
      setError(null);
    },
  };
}
