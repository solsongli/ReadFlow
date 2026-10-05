import { useEffect, useRef, useState } from "react";
import { labelAt } from "../domain/reading.js";
import type { PageGeometry } from "../domain/model.js";
import { blockAt, plainClick, type Block } from "../domain/model.js";
export function BlockLayer({
  blocks,
  page,
  active,
  open,
  expand,
  highlighted,
  geometry,
  labelHints,
}: {
  blocks: Block[];
  page: number;
  active: boolean;
  open: (block: Block, x: number, y: number) => void;
  expand?: (block: Block, x: number, y: number) => void;
  highlighted?: string;
  geometry?: PageGeometry;
  labelHints?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef({ blocks, open, geometry, labelHints });
  latest.current = { blocks, open, geometry, labelHints };
  const [hover, setHover] = useState<ReturnType<typeof blockAt>>();
  useEffect(() => {
    const element = root.current?.closest<HTMLElement>("[data-paper-page]");
    if (!element || !active) {
      setHover(undefined);
      return;
    }
    let start: { x: number; y: number } | null = null,
      moved = 0;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const eligible = (event: MouseEvent) =>
      !(event.target as Element).closest("button,a,svg,input,textarea,[data-annotation-id]");
    const hit = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      return blockAt(
        latest.current.blocks,
        page,
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
      );
    };
    const down = (event: PointerEvent) => {
      start = event.button === 0 && eligible(event) ? { x: event.clientX, y: event.clientY } : null;
      moved = 0;
    };
    const move = (event: PointerEvent) => {
      if ((event.target as Element).closest("[data-block-tools]")) return;
      if (start && event.buttons)
        moved = Math.max(moved, Math.hypot(event.clientX - start.x, event.clientY - start.y));
      const value = !event.buttons && eligible(event) ? hit(event) : undefined;
      const rect = element.getBoundingClientRect();
      const label = latest.current.labelHints
        ? labelAt(
            latest.current.blocks,
            page,
            latest.current.geometry,
            (event.clientX - rect.left) / rect.width,
            (event.clientY - rect.top) / rect.height,
          )
        : undefined;
      element.title = label?.translation || value?.block.translation || "";
      setHover((old) => (old?.block.id === value?.block.id && old?.anchor === value?.anchor ? old : value));
    };
    const click = (event: MouseEvent) => {
      const value = start && eligible(event) ? hit(event) : undefined;
      const distance = moved;
      start = null;
      // Wait until bubbling reaches React's root; microtasks can run between native listeners.
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (
          value &&
          plainClick(distance, window.getSelection()?.toString() || "", event.detail, event.defaultPrevented)
        )
          latest.current.open(value.block, event.clientX, event.clientY);
      }, 0);
    };
    const leave = () => {
      setHover(undefined);
      element.title = "";
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("click", click);
    element.addEventListener("pointerleave", leave);
    return () => {
      clearTimeout(pending);
      element.title = "";
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("click", click);
      element.removeEventListener("pointerleave", leave);
    };
  }, [active, page]);
  const indicated = blocks.find((b) => b.id === highlighted);
  const box = hover?.anchor.view_bbox || indicated?.anchors.find((a) => a.page === page)?.view_bbox;
  return (
    <div
      ref={root}
      data-block-layer={page}
      data-block-active={active}
      data-block-count={blocks.length}
      className="pointer-events-none absolute inset-0 z-[2]"
    >
      {box ? (
        <div
          data-block-hover={hover?.block.id || highlighted}
          className="absolute rounded border border-wb-accent bg-wb-accent-soft"
          style={{
            left: `${box[0] * 100}%`,
            top: `${box[1] * 100}%`,
            width: `${(box[2] - box[0]) * 100}%`,
            height: `${(box[3] - box[1]) * 100}%`,
          }}
        />
      ) : null}
      {hover && expand ? (
        <button
          type="button"
          data-block-tools
          className="pointer-events-auto absolute rounded-lg border-0 bg-wb-panel px-2 py-1 text-xs text-wb-text shadow-wb-pop"
          style={{
            left: `${Math.min(75, hover.anchor.view_bbox[0] * 100)}%`,
            top: `${hover.anchor.view_bbox[1] * 100}%`,
            transform: "translateY(-100%)",
          }}
          onClick={(event) => {
            event.stopPropagation();
            expand(hover.block, event.clientX, event.clientY);
          }}
        >
          展开译文
        </button>
      ) : null}
    </div>
  );
}
