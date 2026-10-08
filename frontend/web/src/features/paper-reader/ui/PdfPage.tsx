import { useRef } from "react";
import { usePageSurface } from "../state/usePageSurface.js";
import type { PDFDocumentProxy, PageSize, renderQueue } from "../state/document.js";
import { PageMargins, type MarginEntry } from "@/ui/wb/PageMargins.js";
import type { MarginSide } from "@/ui/wb/margin-layout.js";
import type { PagePoint } from "../domain/alignment.js";
import type { SearchOptions } from "../domain/types.js";

export interface LinkBox {
  rect: number[];
  dest?: unknown;
  url?: string;
  text?: string;
}

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  number: number;
  scale: number;
  size: PageSize;
  queue: ReturnType<typeof renderQueue>;
  deferRender: boolean;
  visiblePage: boolean;
  search: SearchOptions & { query: string; currentPage?: number; currentOccurrence?: number };
  onLink: (link: LinkBox) => void;
  onTextClick: (event: React.MouseEvent) => void;
  onHover: (event: React.MouseEvent, link?: LinkBox) => void;
  onLeave: () => void;
  painted: () => void;
  overlay?: React.ReactNode;
  readingOverlay?: React.ReactNode;
  readingGuide?: {
    move: (point: PagePoint) => void;
    leave: () => void;
    click: (point: PagePoint) => void;
    doubleClick: (point: PagePoint) => void;
  };
  margins?: MarginEntry[];
  marginSide?: MarginSide;
  marginLeft?: number;
  marginRight?: number;
}

export function PdfPage({
  pdf,
  number,
  scale,
  size,
  queue,
  deferRender,
  visiblePage,
  search,
  onLink,
  onHover,
  onTextClick,
  onLeave,
  painted,
  overlay,
  readingOverlay,
  readingGuide,
  margins,
  marginSide = "auto",
  marginLeft = 20,
  marginRight = 20,
}: PdfPageProps) {
  const { imageColors, canvas, text, links, highlights, error } = usePageSurface({
    pdf,
    number,
    scale,
    queue,
    deferHighResolution: deferRender,
    visiblePage,
    search,
    painted,
  });
  const gesture = useRef<{ x: number; y: number; moved: number } | undefined>(undefined);
  const linkAt = (event: React.MouseEvent) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left,
      y = event.clientY - box.top;
    return links.find(
      ({ rect: [x1, y1, x2, y2] }) =>
        x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(y1, y2) && y <= Math.max(y1, y2),
    );
  };
  const pagePoint = (event: React.MouseEvent): PagePoint => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      page: number,
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    };
  };
  return (
    <div
      className="pr-page relative shrink-0"
      data-paper-page={number}
      style={{ width: size.width * scale, height: size.height * scale }}
      onPointerDown={(event) => {
        gesture.current = event.button === 0 ? { x: event.clientX, y: event.clientY, moved: 0 } : undefined;
      }}
      onClick={(event) => {
        const destination = linkAt(event);
        if (
          destination &&
          gesture.current &&
          gesture.current.moved < 3 &&
          event.detail === 1 &&
          !getSelection()?.toString().trim() &&
          !event.defaultPrevented
        )
          onLink(destination);
        else {
          onTextClick(event);
          if (
            readingGuide &&
            gesture.current &&
            gesture.current.moved < 3 &&
            event.detail === 1 &&
            !getSelection()?.toString().trim() &&
            !event.defaultPrevented
          )
            readingGuide.click(pagePoint(event));
        }
      }}
      onDoubleClick={(event) => readingGuide?.doubleClick(pagePoint(event))}
      onMouseMove={(event) => {
        if (gesture.current && event.buttons)
          gesture.current.moved = Math.max(
            gesture.current.moved,
            Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y),
          );
        if (!event.buttons) {
          onHover(event, linkAt(event));
          readingGuide?.move(pagePoint(event));
        }
      }}
      onMouseLeave={() => {
        onLeave();
        readingGuide?.leave();
      }}
    >
      <canvas ref={canvas} aria-label={`第 ${number} 页`} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={imageColors}
        aria-hidden="true"
        className="pr-image-colors pointer-events-none absolute inset-0 h-full w-full"
      />
      {readingOverlay}
      <div data-search-highlights className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
        {highlights.map((highlight, index) => (
          <div
            key={index}
            className="pr-search-hit absolute rounded-[2px]"
            data-search-current={highlight.current}
            style={{
              left: highlight.left,
              top: highlight.top,
              width: highlight.width,
              height: highlight.height,
              background: highlight.current ? "var(--pr-search-current)" : "var(--pr-search)",
            }}
          />
        ))}
      </div>
      <div ref={text} className="pr-text-layer" style={{ "--scale-factor": scale } as React.CSSProperties} />
      {links.map((link, index) => {
        const [x1, y1, x2, y2] = link.rect;
        return (
          <button
            key={index}
            type="button"
            aria-label={link.url ? "外部链接" : "文内链接"}
            title={link.url || "跳转文内引用"}
            className="pr-link absolute border-0 bg-transparent"
            style={{
              left: Math.min(x1, x2),
              top: Math.min(y1, y2),
              width: Math.abs(x2 - x1),
              height: Math.abs(y2 - y1),
            }}
            onClick={(event) => {
              event.stopPropagation();
              onLink(link);
            }}
            onMouseMove={(event) => {
              event.stopPropagation();
              onHover(event, link);
            }}
            onMouseLeave={onLeave}
          />
        );
      })}
      {overlay}
      {margins?.length ? (
        <PageMargins
          entries={margins}
          width={size.width * scale}
          height={size.height * scale}
          scale={scale}
          left={marginLeft}
          right={marginRight}
          side={marginSide}
        />
      ) : null}
      {error ? (
        <p role="status" className="absolute inset-x-4 top-4 rounded-lg bg-wb-panel p-3 text-wb-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
