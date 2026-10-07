import { useEffect, type RefObject } from "react";
import { settledSelection } from "@/ui/wb/selection-events.js";

/** Pointer-time state lives on the DOM: selecting must never rerender the reader. */
export function useSelectionGesture(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const reader = root.current;
    if (!reader) return;
    let start: { x: number; y: number } | undefined;
    const down = (event: PointerEvent) => {
      const element = event.target as Element;
      const layer =
        element.closest(".pr-text-layer") ||
        (element.closest(".pr-link")
          ? element.closest("[data-paper-page]")?.querySelector(".pr-text-layer")
          : null);
      if (event.button !== 0 || !layer) return;
      start = { x: event.clientX, y: event.clientY };
      layer.classList.add("selecting");
      if (element.closest(".pr-link")) reader.dataset.selecting = "true";
    };
    const move = (event: PointerEvent) => {
      if (start && event.buttons && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3)
        reader.dataset.selecting = "true";
    };
    const reset = () => {
      start = undefined;
      delete reader.dataset.selecting;
      reader.querySelectorAll(".selecting").forEach((layer) => layer.classList.remove("selecting"));
    };
    const cleanup = settledSelection(
      () => reader,
      () => {
        const value = getSelection();
        const range = value?.rangeCount ? value.getRangeAt(0) : undefined;
        for (const page of reader.querySelectorAll<HTMLElement>("[data-paper-page]")) {
          const layer = page.querySelector(".pr-text-layer");
          const selected = Boolean(value?.toString().trim() && layer && range?.intersectsNode(layer));
          page.dataset.textSelected = String(selected);
          layer?.classList.toggle("selecting", selected);
        }
      },
    );
    reader.addEventListener("pointerdown", down, true);
    reader.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", reset);
    window.addEventListener("pointercancel", reset);
    window.addEventListener("blur", reset);
    return () => {
      cleanup();
      reset();
      reader.removeEventListener("pointerdown", down, true);
      reader.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", reset);
      window.removeEventListener("pointercancel", reset);
      window.removeEventListener("blur", reset);
    };
  }, [root]);
}
