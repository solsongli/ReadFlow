import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { offsets, pageAt, visiblePages } from "../domain/navigation.js";
import type { Position, SearchOptions } from "../domain/types.js";
import type { PagePoint } from "../domain/alignment.js";
import type { PDFDocumentProxy, PageSize, renderQueue } from "../state/document.js";
import { PdfPage, type LinkBox } from "./PdfPage.js";
import { marginSpace, type MarginSide } from "@/ui/wb/margin-layout.js";
import type { MarginEntry } from "@/ui/wb/PageMargins.js";
export interface PaneHandle {
  scale: () => number;
  position: () => Position;
  jump: (target: Position) => void;
  scroll: (amount: number) => void;
  element: () => HTMLDivElement | null;
}
export type Zoom = "width" | "page" | number;
export const PdfPane = forwardRef<
  PaneHandle,
  {
    pdf: PDFDocumentProxy;
    sizes: PageSize[];
    zoom: Zoom;
    setZoom: (zoom: Zoom) => void;
    queue: ReturnType<typeof renderQueue>;
    search: SearchOptions & { query: string; currentPage?: number; currentOccurrence?: number };
    active: boolean;
    label: string;
    onPosition: (position: Position, programmatic: boolean) => void;
    onLink: (link: LinkBox) => void;
    onTextClick: (event: React.MouseEvent) => void;
    onHover: (event: React.MouseEvent, link?: LinkBox) => void;
    onLeave: () => void;
    painted: () => void;
    overlay?: (page: number) => React.ReactNode;
    margins?: (page: number) => MarginEntry[];
    marginSide?: MarginSide;
    paragraphMargins?: boolean;
    reserveMargins?: boolean;
    readingOverlay?: (page: number) => React.ReactNode;
    readingGuide?: {
      move: (point: PagePoint) => void;
      leave: () => void;
      click: (point: PagePoint) => void;
      doubleClick: (point: PagePoint) => void;
    };
  }
>(function PdfPane(
  {
    pdf,
    sizes,
    zoom,
    setZoom,
    queue,
    search,
    active,
    label,
    onPosition,
    onLink,
    onHover,
    onTextClick,
    onLeave,
    painted,
    overlay,
    margins,
    marginSide = "auto",
    paragraphMargins = false,
    reserveMargins = true,
    readingOverlay,
    readingGuide,
  },
  ref,
) {
  const element = useRef<HTMLDivElement>(null),
    [box, setBox] = useState({ width: 700, height: 700 }),
    [scrollTop, setScrollTop] = useState(0);
  const programTarget = useRef<number | null>(null);
  const logical = useRef<Position>({ page: 1, offset: 0 }),
    previousScale = useRef<number | null>(null);
  const anchor = useRef<{
    page: number;
    local: number;
    pointer: number;
    horizontal: number;
    x: number;
  } | null>(null);
  const size = sizes[0],
    maximumWidth = Math.max(...sizes.map((page) => page.width));
  const space = marginSpace(box.width, Boolean(margins) && reserveMargins, marginSide, paragraphMargins);
  const scale =
    typeof zoom === "number"
      ? zoom
      : Math.max(
          0.15,
          Math.min(
            (box.width - space.left - space.right) / maximumWidth,
            zoom === "page" ? (box.height - 40) / size.height : 4,
          ),
        );
  const tops = useMemo(
    () =>
      offsets(
        sizes.map((s) => s.height),
        scale,
      ),
    [sizes, scale],
  );
  const visible = active ? visiblePages(tops, scrollTop, box.height) : [];
  const marginVisible = active ? visiblePages(tops, scrollTop, box.height, 0) : [];
  const visibleKey = marginVisible.join(",");
  const marginEntries = useMemo(
    () => new Map(marginVisible.map((index) => [index, margins?.(index)])),
    [margins, visibleKey],
  );
  const position = (): Position => {
    const page = pageAt(tops, element.current?.scrollTop ?? 0);
    return {
      page: page + 1,
      offset: ((element.current?.scrollTop ?? 0) - tops[page]) / (sizes[page].height * scale),
      x: (element.current?.scrollLeft ?? 0) / scale,
    };
  };
  const jump = (target: Position) => {
    logical.current = target;
    const index = Math.max(0, Math.min(sizes.length - 1, target.page - 1));
    if (element.current) {
      element.current.scrollTop = tops[index] + target.offset * sizes[index].height * scale;
      if (target.x != null) {
        element.current.scrollLeft = target.x * scale;
      }
      programTarget.current = element.current.scrollTop;
      setScrollTop(element.current.scrollTop);
    }
  };
  useImperativeHandle(
    ref,
    () => ({
      scale: () => scale,
      position,
      jump,
      scroll: (amount) => element.current?.scrollBy({ top: amount }),
      element: () => element.current,
    }),
    [tops, scale, sizes],
  );
  useEffect(() => {
    const target = element.current!;
    const observer = new ResizeObserver(() => {
      if (target.clientWidth) {
        setBox({ width: target.clientWidth, height: target.clientHeight });
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const target = element.current!;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !active) {
        return;
      }
      event.preventDefault();
      const rect = target.getBoundingClientRect(),
        pointer = event.clientY - rect.top,
        x = event.clientX - rect.left;
      const page = pageAt(tops, target.scrollTop + pointer);
      const oldMargin =
        space.left +
        (Math.max(target.clientWidth, maximumWidth * scale + space.left + space.right) -
          space.left -
          space.right -
          sizes[page].width * scale) /
          2;
      anchor.current = {
        page,
        local: (target.scrollTop + pointer - tops[page]) / scale,
        pointer,
        horizontal: (target.scrollLeft + x - oldMargin) / scale,
        x,
      };
      setZoom(Math.min(4, Math.max(0.2, scale * Math.exp(-event.deltaY * 0.002))));
    };
    target.addEventListener("wheel", wheel, { passive: false });
    return () => target.removeEventListener("wheel", wheel);
  }, [active, scale, tops, setZoom, sizes, maximumWidth, space.left, space.right]);
  useLayoutEffect(() => {
    const a = anchor.current,
      target = element.current;
    if (!target) {
      return;
    }
    if (!a) {
      if (previousScale.current != null && previousScale.current !== scale) {
        jump(logical.current);
      }
      previousScale.current = scale;
      return;
    }
    previousScale.current = scale;
    target.scrollTop = tops[a.page] + a.local * scale - a.pointer;
    target.scrollLeft =
      a.horizontal * scale +
      space.left +
      (Math.max(target.clientWidth, maximumWidth * scale + space.left + space.right) -
        space.left -
        space.right -
        sizes[a.page].width * scale) /
        2 -
      a.x;
    programTarget.current = target.scrollTop;
    setScrollTop(target.scrollTop);
    logical.current = position();
    anchor.current = null;
  }, [scale, tops, maximumWidth, sizes]);
  return (
    <div
      ref={element}
      tabIndex={0}
      aria-label={label}
      data-pdf-pane
      data-annotation-source={Boolean(overlay)}
      className="pr-desk relative min-h-0 min-w-0 flex-1 overflow-auto outline-none"
      onScroll={() => {
        if (!active) {
          return;
        }
        setScrollTop(element.current!.scrollTop);
        const next = position();
        logical.current = next;
        const programmatic =
          programTarget.current != null && Math.abs(element.current!.scrollTop - programTarget.current) < 1;
        programTarget.current = null;
        onPosition(next, programmatic);
      }}
    >
      <div
        className="relative"
        style={{
          height: tops.at(-1)! + Math.max(0, box.height - sizes.at(-1)!.height * scale - 20),
          minWidth: maximumWidth * scale + space.left + space.right,
        }}
      >
        {visible.map((index) => (
          <div
            key={index}
            className="absolute flex w-full justify-center"
            style={{ top: tops[index], paddingLeft: space.left, paddingRight: space.right }}
          >
            <PdfPage
              pdf={pdf}
              number={index + 1}
              scale={scale}
              size={sizes[index]}
              queue={queue}
              search={search}
              onLink={onLink}
              onTextClick={onTextClick}
              onHover={onHover}
              onLeave={onLeave}
              painted={painted}
              overlay={overlay?.(index)}
              readingOverlay={readingOverlay?.(index + 1)}
              readingGuide={readingGuide}
              margins={marginEntries.get(index)}
              marginSide={marginSide}
              marginLeft={
                space.left +
                (Math.max(box.width, maximumWidth * scale + space.left + space.right) -
                  space.left -
                  space.right -
                  sizes[index].width * scale) /
                  2
              }
              marginRight={
                space.right +
                (Math.max(box.width, maximumWidth * scale + space.left + space.right) -
                  space.left -
                  space.right -
                  sizes[index].width * scale) /
                  2
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
});
