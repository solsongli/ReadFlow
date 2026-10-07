import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, Languages, X } from "lucide-react";
import { marginSide, packMargins, floatingMargin, type MarginSide } from "./margin-layout.js";
import { IconButton } from "./Button.js";
export interface MarginEntry {
  id: string;
  kind: "annotation" | "translation";
  x: number;
  y: number;
  bottom?: number;
  active?: boolean;
  selected?: boolean;
  color?: string;
  height: number;
  width?: number;
  label: string;
  activate: () => void;
  hover?: (active: boolean) => void;
  content: (width: number, scale: number) => ReactNode;
}
export const PageMargins = memo(function PageMargins({
  entries,
  width,
  height,
  scale,
  left,
  right,
  side,
}: {
  entries: MarginEntry[];
  width: number;
  height: number;
  scale: number;
  left: number;
  right: number;
  side: MarginSide;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<string>();
  const [floating, setFloating] = useState<React.CSSProperties>();
  const groups = { left: [] as MarginEntry[], right: [] as MarginEntry[] };
  entries.forEach((entry) => groups[marginSide(entry.x, left, right, side)].push(entry));
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => {
      const measured: Record<string, number> = {};
      node.querySelectorAll<HTMLElement>("[data-margin-content]").forEach((card) => {
        measured[card.dataset.marginContent!] = Math.min(360, card.scrollHeight + 12);
      });
      setSizes((old) =>
        Object.keys(measured).some((id) => Math.abs((old[id] || 0) - measured[id]) > 2) ? measured : old,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [entries]);
  const narrowSelected = entries.find(
    (entry) => entry.selected && (marginSide(entry.x, left, right, side) === "left" ? left : right) < 180,
  );
  const opened = entries.find((entry) => entry.id === expanded) || narrowSelected;
  useEffect(() => {
    if (!opened) return;
    const page = root.current?.closest<HTMLElement>("[data-paper-page]");
    const update = () => {
      if (!page) return;
      const rect = page.getBoundingClientRect();
      setFloating(
        floatingMargin(
          {
            top: rect.top + opened.y * rect.height,
            bottom: rect.top + (opened.bottom ?? opened.y + 0.03) * rect.height,
            left: rect.left + opened.x * rect.width,
            right: rect.right,
          },
          { width: innerWidth, height: innerHeight },
        ),
      );
    };
    update();
    const pane = page?.closest("[data-pdf-pane]");
    pane?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      pane?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [opened, width, height]);
  return (
    <div ref={root} data-page-margins className="pointer-events-none absolute inset-0 z-[5]">
      {(["left", "right"] as const).map((edge) => {
        const room = edge === "left" ? left : right;
        const collapsed = room < 180;
        const column = groups[edge];
        const packed = packMargins(
          column.map((entry) => ({
            id: entry.id,
            x: entry.x,
            y: entry.y,
            height: collapsed ? 28 : sizes[entry.id] || entry.height,
          })),
          height,
        );
        return packed.map((position) => {
          const entry = column.find((value) => value.id === position.id)!;
          const cardWidth = collapsed
            ? 26
            : Math.min(room - 24, Math.max(180, entry.width ? entry.width * scale : 320));
          const cardLeft = collapsed
            ? edge === "left"
              ? -Math.min(room - 2, 26)
              : width + Math.min(room - 28, 8)
            : edge === "left"
              ? -cardWidth - 12
              : width + 12;
          return (
            <div
              key={entry.id}
              data-margin-entry={entry.id}
              data-margin-kind={entry.kind}
              data-margin-side={edge}
              data-margin-collapsed={collapsed}
              data-active={entry.active || entry.selected}
              data-annotation-color={entry.color}
              className="pr-margin-entry absolute pointer-events-auto"
              style={{ left: cardLeft, top: position.top, width: cardWidth, maxHeight: position.height }}
            >
              {collapsed ? (
                <IconButton
                  label={entry.label}
                  title={entry.label}
                  onClick={() => {
                    entry.activate();
                    setExpanded((old) => (old === entry.id ? undefined : entry.id));
                  }}
                >
                  {entry.kind === "annotation" ? <MessageSquare size={15} /> : <Languages size={15} />}
                </IconButton>
              ) : (
                <div
                  className="pr-margin-card"
                  style={
                    {
                      maxHeight: position.height,
                      "--pr-margin-height": `${position.height}px`,
                    } as React.CSSProperties
                  }
                  onMouseEnter={() => entry.hover?.(true)}
                  onMouseLeave={() => entry.hover?.(false)}
                >
                  <div data-margin-content={entry.id}>{entry.content(cardWidth, scale)}</div>
                </div>
              )}
              {!collapsed ? (
                <svg
                  aria-hidden="true"
                  className="pr-margin-leader pointer-events-none absolute"
                  style={{
                    left: -cardLeft,
                    top: -position.top,
                    width,
                    height,
                  }}
                >
                  <line
                    x1={edge === "left" ? -12 : width + 12}
                    y1={position.top + Math.min(18, position.height / 2)}
                    x2={entry.x * width}
                    y2={entry.y * height}
                  />
                </svg>
              ) : null}
            </div>
          );
        });
      })}
      {opened && floating
        ? createPortal(
            <section
              data-margin-floating={opened.id}
              aria-label={opened.label}
              className="pr-margin-card fixed z-40 overflow-auto"
              style={floating}
            >
              {opened.kind === "annotation" ? (
                <IconButton label="收起页边批注" onClick={() => setExpanded(undefined)}>
                  <X size={14} />
                </IconButton>
              ) : null}
              {opened.content(Number(floating.width), scale)}
            </section>,
            root.current!.closest("[data-paper-reader]")!,
          )
        : null}
    </div>
  );
});
