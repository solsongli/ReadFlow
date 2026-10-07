import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, Languages, X } from "lucide-react";
import {
  assignMarginSides,
  floatingMargin,
  leaderEndpoint,
  marginSide,
  packMargins,
  type MarginSide,
} from "./margin-layout.js";
import { IconButton } from "./Button.js";
export interface MarginEntry {
  id: string;
  kind: "annotation" | "translation";
  x: number;
  right?: number;
  y: number;
  bottom?: number;
  active?: boolean;
  selected?: boolean;
  compact?: boolean;
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
  const [grows, setGrows] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<string>();
  const [floating, setFloating] = useState<React.CSSProperties>();
  const [viewportBottom, setViewportBottom] = useState(height);
  const groups = { left: [] as MarginEntry[], right: [] as MarginEntry[] };
  const assigned = assignMarginSides(
    entries.map((entry) => ({ ...entry, height: sizes[entry.id] || entry.height })),
    height,
    left,
    right,
    side,
  );
  entries.forEach((entry) => {
    const placement = assigned.find((value) => value.id === entry.id);
    groups[placement?.side || marginSide(entry.x, left, right, side)].push(entry);
  });
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => {
      const measured: Record<string, number> = {};
      const natural: Record<string, number> = {};
      node.querySelectorAll<HTMLElement>("[data-margin-content]").forEach((card) => {
        const entry = entries.find((value) => value.id === card.dataset.marginContent);
        const body = card.querySelector<HTMLElement>("[data-margin-body]");
        const shell = card.closest<HTMLElement>(".pr-margin-card");
        if (entry?.compact && body && shell)
          natural[entry.id] = Math.ceil(body.scrollHeight + shell.offsetHeight - body.clientHeight);
        const block = card.querySelector<HTMLElement>("[data-block-card]");
        const naturalBlockHeight = block
          ? [...block.children].reduce((sum, child) => {
              const element = child as HTMLElement;
              const body = element.querySelector<HTMLElement>("[data-margin-body]");
              return sum + (body?.scrollHeight || element.scrollHeight);
            }, 28)
          : card.scrollHeight + 12;
        measured[card.dataset.marginContent!] = entry?.compact
          ? entry.height
          : entry?.selected
            ? naturalBlockHeight
            : Math.min(360, card.scrollHeight + 12);
      });
      const changed = (old: Record<string, number>, next: Record<string, number>) =>
        Object.keys(next).length !== Object.keys(old).length ||
        Object.keys(next).some((id) => Math.abs((old[id] || 0) - next[id]) > 2);
      setSizes((old) => (changed(old, measured) ? measured : old));
      setGrows((old) => (changed(old, natural) ? natural : old));
    });
    return () => cancelAnimationFrame(frame);
  }, [entries]);
  useEffect(() => {
    const page = root.current?.closest<HTMLElement>("[data-paper-page]");
    const update = () => {
      if (!page) return;
      const rect = page.getBoundingClientRect();
      setViewportBottom(Math.max(0, Math.min(height, innerHeight - rect.top - 12)));
    };
    update();
    const pane = page?.closest("[data-pdf-pane]");
    pane?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      pane?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [height]);
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
        const packed = [
          ...packMargins(
            column
              .filter((entry) => !entry.selected)
              .map((entry) => ({
                id: entry.id,
                x: entry.x,
                right: entry.right,
                y: entry.y,
                height: collapsed ? 28 : sizes[entry.id] || entry.height,
                grow: collapsed ? undefined : grows[entry.id],
              })),
            height,
          ),
          ...column
            .filter((entry) => entry.selected)
            .map((entry) => {
              const top = entry.y * height;
              const available = Math.max(96, Math.min(height - top, viewportBottom - top));
              return {
                id: entry.id,
                x: entry.x,
                right: entry.right,
                y: entry.y,
                top,
                height: collapsed ? 28 : Math.min(sizes[entry.id] || entry.height, available),
              };
            }),
        ];
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
                    x2={leaderEndpoint(edge, entry, width)}
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
