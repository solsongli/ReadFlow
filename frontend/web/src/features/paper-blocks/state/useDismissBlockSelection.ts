import { useEffect } from "react";
import { settledSelection } from "@/ui/wb/selection-events.js";
export function useDismissBlockSelection(clear: () => void) {
  useEffect(() => {
    const changed = () => {
      const selection = window.getSelection();
      const parent = selection?.anchorNode?.parentElement;
      if (selection?.toString().trim() && parent?.closest("[data-paper-page]")) clear();
    };
    return settledSelection(() => document.querySelector("[data-wb-reader-active=\"true\"]"), changed);
  }, []);
}
