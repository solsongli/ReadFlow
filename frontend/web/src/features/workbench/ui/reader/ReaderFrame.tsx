import { CREDENTIALS_CHANGED_EVENT } from "@/platform/contracts/credentials-contract.js";
import { useEffect, useRef } from "react";
import type { ReaderTab } from "../../domain/workbench-store.js";
import { parseWorkbenchReaderMessage, trustedWorkbenchMessage, workbenchReaderUrl, SOFT_READER_CLOSE_MESSAGE } from "../../domain/reader-messages.js";
import { WbEmptyState } from "@/ui/wb/EmptyState.js";
import { useWorkbench } from "../context.js";
import { useWorkbenchScheme } from "./useWorkbenchScheme.js";

export function ReaderFrame({ tab }: { tab: ReaderTab }) {
  const wb = useWorkbench();
  const scheme = useWorkbenchScheme();
  const frame = useRef<HTMLIFrameElement>(null);
  // Theme and progress updates must never change the iframe's src and reload the document.
  const source = useRef(workbenchReaderUrl(tab.url!, window.location.href, tab.itemId, scheme, tab.resumePage));
  const detachKeys = useRef<() => void>(() => {});
  const latestScheme = useRef(scheme);
  latestScheme.current = scheme;
  function syncScheme() {
    frame.current?.contentWindow?.postMessage({ type: "readflow:scheme", scheme: latestScheme.current }, window.location.origin);
  }
  useEffect(syncScheme, [scheme]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!trustedWorkbenchMessage(event, window.location.origin, frame.current?.contentWindow)) return;
      const message = parseWorkbenchReaderMessage(event.data, tab.itemId);
      if (!message) return;
      switch (message.type) {
        case SOFT_READER_CLOSE_MESSAGE: wb.closeTab(tab.id); break;
        case "readflow:reader-ready": syncScheme(); break;
        case "readflow:reader-progress": void wb.readerProgress(message); break;
        case "readflow:notes-changed": void wb.readerNotesChanged(message.itemId); break;
      }
    };
    const credentialsChanged = () => {
      try {
        const doc = frame.current?.contentDocument;
        if (!doc) return;
        const notification = doc.createEvent("CustomEvent");
        notification.initCustomEvent(CREDENTIALS_CHANGED_EVENT, false, false, null);
        doc.dispatchEvent(notification);
      } catch { /* Only a same-origin reader can consume the existing notification. */ }
    };
    window.addEventListener("message", receive);
    document.addEventListener(CREDENTIALS_CHANGED_EVENT, credentialsChanged);
    return () => { window.removeEventListener("message", receive); document.removeEventListener(CREDENTIALS_CHANGED_EVENT, credentialsChanged); detachKeys.current(); };
  }, [tab.id, tab.itemId, wb]);
  function loaded() {
    try {
      const path = frame.current?.contentWindow?.location.pathname ?? "";
      if (path && !path.endsWith("/reader.html")) { wb.closeTab(tab.id); return; }
      syncScheme();
      detachKeys.current();
      const child = frame.current?.contentWindow;
      const keys = (event: KeyboardEvent) => {
        if (event.isComposing || !(event.ctrlKey || event.metaKey)) return;
        if (event.key === ",") { event.preventDefault(); wb.openSettings(); }
        if (event.key === "/") { event.preventDefault(); wb.setShortcuts(true); }
        if (event.key.toLowerCase() === "k") { event.preventDefault(); wb.setPalette(true); }
        if (event.key === "1") { event.preventDefault(); wb.setMain("desk"); }
        if (event.key === "2") { event.preventDefault(); wb.browse({}); }
        if (event.key.toLowerCase() === "n") { event.preventDefault(); void wb.notes.create(); }
      };
      child?.addEventListener("keydown", keys);
      detachKeys.current = () => { try { child?.removeEventListener("keydown", keys); } catch { /* The frame may have navigated away. */ } };
    } catch { /* A foreign navigation cannot send trusted messages. */ }
  }
  if (!source.current) return <WbEmptyState title="无法嵌入此阅读器地址" hint="阅读器必须与工作台位于同一站点。" />;
  return <iframe ref={frame} title={tab.title} src={source.current} onLoad={loaded} className="min-h-0 w-full flex-1 border-0 bg-wb-panel" />;
}
