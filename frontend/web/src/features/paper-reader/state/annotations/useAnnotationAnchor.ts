import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
export function useAnnotationAnchor(id: string | undefined, close: () => void) {
  const ref = useRef<HTMLElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const latest = useRef(close);
  latest.current = close;
  useLayoutEffect(() => {
    if (!id || !ref.current) {
      return;
    }
    const popup = ref.current;
    const root = popup.closest("[data-paper-reader]");
    const mark = root?.querySelector(`[data-annotation-id="${CSS.escape(id)}"]`);
    const pane = mark?.closest("[data-pdf-pane]");
    const paper = mark?.closest("[data-paper-page]");
    if (!mark || !pane || !paper) {
      setStyle({ visibility: "hidden" });
      return;
    }
    const position = () => {
      const target = mark.getBoundingClientRect();
      const page = paper.getBoundingClientRect();
      const viewport = pane.getBoundingClientRect();
      const left = Math.max(viewport.left, page.left) + 8;
      const right = Math.min(viewport.right, page.right) - 8;
      const width = Math.min(288, right - left);
      const height = Math.min(popup.scrollHeight, viewport.height - 16);
      const top =
        target.top - height - 8 >= viewport.top + 8
          ? target.top - height - 8
          : Math.min(target.bottom + 8, viewport.bottom - height - 8);
      setStyle({
        left: Math.max(left, Math.min(target.left, right - width)),
        top: Math.max(viewport.top + 8, top),
        width,
        maxHeight: viewport.height - 16,
        visibility: "visible",
      });
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(popup);
    observer.observe(paper);
    observer.observe(pane);
    const scroll = (event: Event) => {
      if (event.target !== popup && !popup.contains(event.target as Node)) {
        latest.current();
      }
    };
    pane.addEventListener("scroll", scroll);
    window.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      pane.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", position);
    };
  }, [id]);
  return { ref, style };
}
