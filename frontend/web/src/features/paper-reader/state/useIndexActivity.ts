import { useEffect, useRef, type RefObject } from "react";

interface IndexController {
  pauseIndexing: (milliseconds?: number) => void;
}

export function useIndexActivity(
  root: RefObject<HTMLElement | null>,
  active: boolean,
  documents: IndexController[],
) {
  const current = useRef(documents);
  current.current = documents;
  useEffect(() => {
    const target = root.current;
    if (!active || !target) return;
    const pause = (event: Event) => {
      if ((event.target as Element | null)?.closest?.("[data-paper-search]")) return;
      for (const document of new Set(current.current)) document.pauseIndexing();
    };
    const events = ["scroll", "wheel", "keydown", "pointerdown"] as const;
    for (const event of events) target.addEventListener(event, pause, true);
    return () => {
      for (const event of events) target.removeEventListener(event, pause, true);
    };
  }, [root, active]);
}
