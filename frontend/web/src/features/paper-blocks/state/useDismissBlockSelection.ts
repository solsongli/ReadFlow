import { useEffect } from "react";
export function useDismissBlockSelection(clear: () => void) {
  useEffect(() => {
    const changed = () => {
      const selection = window.getSelection();
      const parent = selection?.anchorNode?.parentElement;
      if (selection?.toString().trim() && parent?.closest("[data-paper-page]")) clear();
    };
    document.addEventListener("selectionchange", changed);
    return () => document.removeEventListener("selectionchange", changed);
  }, []);
}
