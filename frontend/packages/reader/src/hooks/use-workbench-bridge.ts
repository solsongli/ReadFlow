import { useEffect, useRef } from "react";
import { parseWorkbenchEmbed, parseWorkbenchSchemeMessage, trustedWorkbenchMessage, validReaderProgress, type ReaderProgressMessage } from "../domain/workbench-embed.js";
import { applyWorkbenchAppearance, applyWorkbenchScheme } from "../shared/theme/theme.js";

/** Installed only for explicit workbench embeds, with listeners owned by the mounted Reader. */
export function useWorkbenchSchemeBridge() {
  useEffect(() => {
    const embed = parseWorkbenchEmbed(window.location.search);
    if (!embed || window.parent === window) return;
    const receive = (event: MessageEvent) => {
      if (!trustedWorkbenchMessage(event, window.location.origin, window.parent)) return;
      const message = parseWorkbenchSchemeMessage(event.data);
      if (message) { applyWorkbenchScheme(message.scheme); if (message.appearance) applyWorkbenchAppearance(message.appearance); }
    };
    window.addEventListener("message", receive);
    if (embed.itemId) window.parent.postMessage({ type: "readflow:reader-ready", itemId: embed.itemId }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);
}

/** Trailing throttle: rapid scrolling sends the latest page at most once per second. */
export function useWorkbenchReaderProgress(page: number, pages: number, enabled: boolean) {
  const pending = useRef<ReaderProgressMessage | null>(null);
  const last = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestEnabled = useRef(enabled);
  latestEnabled.current = enabled;
  useEffect(() => {
    const embed = parseWorkbenchEmbed(window.location.search);
    if (!enabled || !embed?.itemId || window.parent === window || !validReaderProgress(page, pages)) {
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      return;
    }
    const message: ReaderProgressMessage = { type: "readflow:reader-progress", itemId: embed.itemId, page, pages };
    if (!timer.current && last.current === JSON.stringify(message)) { pending.current = null; return; }
    pending.current = message;
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const current = pending.current;
      if (!current || !latestEnabled.current) return;
      last.current = JSON.stringify(current);
      window.parent.postMessage(current, window.location.origin);
      pending.current = null;
    }, 1000);
  }, [page, pages, enabled]);
  useEffect(() => {
    if (!parseWorkbenchEmbed(window.location.search) || window.parent === window) return;
    const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const current = pending.current;
      pending.current = null;
      if (current && latestEnabled.current) window.parent.postMessage(current, window.location.origin);
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, []);
}
