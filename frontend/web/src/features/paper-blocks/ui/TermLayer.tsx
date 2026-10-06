import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/ui/wb/Button.js";
import { textTermRects, type TermRect } from "../state/term-rects.js";
import { termKind, type LocatedTerm } from "../domain/terms.js";
export function TermLayer({
  regions,
  terms,
  enabled,
  inline,
  jump,
}: {
  regions?: number[][];
  terms: LocatedTerm[];
  enabled: boolean;
  inline: boolean;
  jump: (page: number, y: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<TermRect[]>([]);
  const [hover, setHover] = useState<{ term: LocatedTerm; x: number; y: number } | null>(null);
  const close = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const page = root.current?.closest<HTMLElement>("[data-paper-page]");
    const layer = page?.querySelector<HTMLElement>(".pr-text-layer");
    if (!page || !layer || !enabled || !terms.length) {
      setRects([]);
      setHover(null);
      return;
    }
    let boxes: TermRect[] = [],
      frame = 0,
      visible = false;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!visible) return;
        boxes = textTermRects(layer, terms, page, inline).filter((box) =>
          regions?.some((region) => {
            const x = box.x + box.width / 2,
              y = box.y + box.height / 2;
            return x >= region[0] && x <= region[2] && y >= region[1] && y <= region[3];
          }),
        );
        setRects(boxes);
      });
    };
    const mutation = new MutationObserver(update);
    mutation.observe(layer, { childList: true, subtree: true });
    const inlineLayer = page.querySelector(".pb-inline-layer");
    if (inlineLayer) mutation.observe(inlineLayer, { childList: true, subtree: true, attributes: true });
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        update();
      },
      { root: page.closest("[data-pdf-pane]"), rootMargin: "100px" },
    );
    observer.observe(page);
    const leave = () => {
      clearTimeout(close.current);
      close.current = setTimeout(() => setHover(null), 160);
    };
    let hit: LocatedTerm | null = null;
    const move = (event: PointerEvent) => {
      if (
        event.buttons ||
        window.getSelection()?.toString().trim() ||
        (event.target as Element).closest("button,a,input,[data-annotation-id]")
      ) {
        hit = null;
        leave();
        return;
      }
      const bounds = page.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width,
        y = (event.clientY - bounds.top) / bounds.height;
      const box = boxes.find((b) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height);
      if (!box) {
        hit = null;
        leave();
        return;
      }
      if (hit === box.term) return;
      hit = box.term;
      clearTimeout(close.current);
      close.current = setTimeout(
        () =>
          setHover({
            term: box.term,
            x: Math.min(innerWidth - 290, event.clientX),
            y: Math.min(innerHeight - 150, event.clientY + 18),
          }),
        300,
      );
    };
    const hide = () => {
      hit = null;
      clearTimeout(close.current);
      setHover(null);
    };
    const pane = page.closest("[data-pdf-pane]");
    pane?.addEventListener("scroll", hide);
    page.addEventListener("pointermove", move);
    page.addEventListener("pointerleave", leave);
    page.addEventListener("pointerdown", hide);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(close.current);
      mutation.disconnect();
      observer.disconnect();
      pane?.removeEventListener("scroll", hide);
      page.removeEventListener("pointermove", move);
      page.removeEventListener("pointerleave", leave);
      page.removeEventListener("pointerdown", hide);
    };
  }, [terms, regions, enabled, inline]);
  return (
    <>
      <div ref={root} data-term-layer className="pointer-events-none absolute inset-0 z-[4]">
        {rects.map((box, index) => (
          <span
            key={index}
            data-term-mark={box.term.source}
            className="absolute border-b border-dotted border-wb-accent"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          />
        ))}
      </div>
      {hover
        ? createPortal(
            <div
              role="dialog"
              aria-label="术语释义"
              className="fixed z-[80] w-64 rounded-xl bg-wb-panel p-3 text-sm text-wb-text shadow-wb-pop"
              style={{ left: Math.max(8, hover.x), top: Math.max(8, hover.y) }}
              onPointerEnter={() => clearTimeout(close.current)}
              onPointerLeave={() => setHover(null)}
            >
              <strong>{hover.term.source}</strong>
              <p className="my-1">{hover.term.target}</p>
              <p className="my-1 text-xs text-wb-text-3">
                {termKind(hover.term.kind)} · 第 {hover.term.page} 页首次出现
              </p>
              <Button
                size="sm"
                onClick={() => {
                  jump(hover.term.page, hover.term.y);
                  setHover(null);
                }}
              >
                查看首次出现
              </Button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
