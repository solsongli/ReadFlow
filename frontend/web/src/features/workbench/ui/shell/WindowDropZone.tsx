import { useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import { dropDescription } from "../../domain/resilience.js";
import { useWorkbench } from "../context.js";

export function WindowDropZone() {
  const wb = useWorkbench();
  const [description, setDescription] = useState("");
  useEffect(() => {
    function bind(target: Window) {
      let depth = 0;
      const files = (event: DragEvent) => event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files");
      const describe = (data: DataTransfer) => {
        const entries = data.files.length ? Array.from(data.files) : Array.from(data.items).filter((item) => item.kind === "file").map((item) => item.getAsFile() ?? { type: item.type });
        return dropDescription(entries.length ? entries : [{ type: "" }]);
      };
      const enter = (event: DragEvent) => { if (files(event)) { depth++; setDescription(describe(event.dataTransfer!)); } };
      const over = (event: DragEvent) => { if (files(event)) { event.preventDefault(); event.dataTransfer!.dropEffect = "copy"; setDescription(describe(event.dataTransfer!)); } };
      const leave = (event: DragEvent) => { if (files(event) && --depth <= 0) { depth = 0; setDescription(""); } };
      const drop = (event: DragEvent) => {
        if (!files(event)) return;
        event.preventDefault(); event.stopPropagation(); depth = 0; setDescription("");
        void wb.importPdfs(Array.from(event.dataTransfer!.files));
      };
      target.addEventListener("dragenter", enter, true); target.addEventListener("dragover", over, true);
      target.addEventListener("dragleave", leave, true); target.addEventListener("drop", drop, true);
      return () => { target.removeEventListener("dragenter", enter, true); target.removeEventListener("dragover", over, true); target.removeEventListener("dragleave", leave, true); target.removeEventListener("drop", drop, true); };
    }
    const rootCleanup = bind(window), frames = new Map<HTMLIFrameElement, () => void>();
    const scan = () => {
      for (const [frame, cleanup] of frames) if (!frame.isConnected) { cleanup(); frames.delete(frame); }
      document.querySelectorAll("iframe").forEach((frame) => {
        if (frames.has(frame)) return;
        let childCleanup: (() => void) | undefined;
        const loaded = () => { childCleanup?.(); try { if (frame.contentWindow?.location.origin === location.origin) childCleanup = bind(frame.contentWindow); } catch { /* Only owned same-origin documents can participate. */ } };
        frame.addEventListener("load", loaded); loaded();
        frames.set(frame, () => { frame.removeEventListener("load", loaded); childCleanup?.(); });
      });
    };
    const observer = new MutationObserver(scan); observer.observe(document.body, { childList: true, subtree: true }); scan();
    return () => { observer.disconnect(); rootCleanup(); frames.forEach((cleanup) => cleanup()); };
  }, [wb]);
  return description ? <div role="status" aria-label="文件拖放导入" className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-wb-overlay backdrop-blur-sm"><div className="flex items-center gap-3 rounded-xl bg-wb-panel px-7 py-5 text-[1rem] font-medium shadow-wb-pop"><FileUp size={24} aria-hidden="true" />{description}</div></div> : null;
}
