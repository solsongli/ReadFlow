import { useEffect, useRef, useState } from "react";
import { blockAt, plainClick, type Block } from "../domain/model.js";
export function BlockLayer({
  blocks,
  page,
  active,
  open,
}: {
  blocks: Block[];
  page: number;
  active: boolean;
  open: (block: Block, x: number, y: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
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
        blocks,
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
      if (start && event.buttons)
        moved = Math.max(moved, Math.hypot(event.clientX - start.x, event.clientY - start.y));
      const value = !event.buttons && eligible(event) ? hit(event) : undefined;
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
          open(value.block, event.clientX, event.clientY);
      }, 0);
    };
    const leave = () => setHover(undefined);
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("click", click);
    element.addEventListener("pointerleave", leave);
    return () => {
      clearTimeout(pending);
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("click", click);
      element.removeEventListener("pointerleave", leave);
    };
  }, [active, blocks, page, open]);
  const box = hover?.anchor.view_bbox;
  return (
    <div
      ref={root}
      data-block-layer={page}
      data-block-active={active}
      data-block-count={blocks.length}
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      {box ? (
        <div
          data-block-hover={hover!.block.id}
          className="absolute rounded border border-wb-accent bg-wb-accent-soft"
          style={{
            left: `${box[0] * 100}%`,
            top: `${box[1] * 100}%`,
            width: `${(box[2] - box[0]) * 100}%`,
            height: `${(box[3] - box[1]) * 100}%`,
          }}
        />
      ) : null}
    </div>
  );
}
