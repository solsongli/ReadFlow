import { useEffect } from "react";
import { noteNeedsSave } from "../../domain/notes.js";
import { useWorkbench } from "../context.js";

export function useNotesLifecycle() {
  const wb = useWorkbench();
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === "hidden") void wb.notes.flush(); };
    const leaving = (event: BeforeUnloadEvent) => {
      if (!noteNeedsSave(wb.store.getSnapshot().notes.draft)) return;
      void wb.notes.flush(); event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", leaving);
    document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("beforeunload", leaving); document.removeEventListener("visibilitychange", hidden); wb.notes.dispose(); };
  }, [wb]);
}
