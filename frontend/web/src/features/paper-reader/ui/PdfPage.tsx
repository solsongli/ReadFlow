import { restoreImageColors } from "../state/image-colors.js";
import { rasterDimensions } from "../domain/navigation.js";
import { useEffect, useRef, useState } from "react";
import { TextLayer, type PDFDocumentProxy, type PageSize, type renderQueue } from "../state/document.js";
import { PageMargins, type MarginEntry } from "@/ui/wb/PageMargins.js";
import type { MarginSide } from "@/ui/wb/margin-layout.js";
import type { PagePoint } from "../domain/alignment.js";
import type { SearchOptions } from "../domain/types.js";
import { searchRanges } from "../domain/analysis.js";
import { joinedSearchText, spanSeparator, splitSearchMatches } from "../domain/search-highlight.js";
export interface LinkBox {
  rect: number[];
  dest?: unknown;
  url?: string;
  text?: string;
}
function textRange(element: Element, start: number, end: number) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  const locate = (offset: number) => {
    let cursor = 0;
    for (const node of nodes) {
      const length = node.data.length;
      if (offset <= cursor + length) return { node, offset: Math.max(0, offset - cursor) };
      cursor += length;
    }
    const node = nodes.at(-1);
    return node ? { node, offset: node.data.length } : null;
  };
  const from = locate(start),
    to = locate(end);
  if (!from || !to) return null;
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}
export function PdfPage({
  pdf,
  number,
  scale,
  size,
  queue,
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
}: {
  pdf: PDFDocumentProxy;
  number: number;
  scale: number;
  size: PageSize;
  queue: ReturnType<typeof renderQueue>;
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
}) {
  const imageColors = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<LinkBox[]>([]),
    [highlights, setHighlights] = useState<
      Array<{ left: number; top: number; width: number; height: number; current: boolean }>
    >([]),
    [version, setVersion] = useState(0),
    [error, setError] = useState("");
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
  useEffect(() => {
    let gone = false,
      task: { cancel: () => void } | undefined,
      layer: TextLayer | undefined;
    const imageTarget = imageColors.current!;
    const target = canvas.current!,
      container = text.current!;
    const next = document.createElement("canvas");
    const nextImages = document.createElement("canvas");
    queue.run(async () => {
      if (gone) {
        return;
      }
      try {
        const page = await pdf.getPage(number);
        if (gone) {
          return;
        }
        const viewport = page.getViewport({ scale });
        const dimensions = rasterDimensions(viewport.width, viewport.height, window.devicePixelRatio);
        const ratio = dimensions.ratio;
        next.width = dimensions.width;
        next.height = dimensions.height;
        const render = page.render({
          canvasContext: next.getContext("2d", { alpha: false })!,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        task = render;
        await render.promise;
        if (gone) {
          return;
        }
        await restoreImageColors(page, next, nextImages, viewport, ratio, () => gone).catch(() => {
          if (!gone) setError("本页图片原色恢复失败；文字与阅读仍可用。");
        });
        if (gone) return;
        // Keep the last bitmap through zoom; commit the completed raster in one frame.
        target.width = next.width;
        target.height = next.height;
        target.getContext("2d", { alpha: false })!.drawImage(next, 0, 0);
        imageTarget.width = nextImages.width;
        imageTarget.height = nextImages.height;
        imageTarget.style.cssText = nextImages.style.cssText;
        Object.assign(imageTarget.dataset, nextImages.dataset);
        if (nextImages.width && nextImages.height) imageTarget.getContext("2d")!.drawImage(nextImages, 0, 0);
        next.width = next.height = nextImages.width = nextImages.height = 0;
        target.style.visibility = "visible";
        imageTarget.style.visibility = "visible";
        painted();
        const content = await page.getTextContent();
        if (gone) {
          return;
        }
        container.replaceChildren();
        layer = new TextLayer({ textContentSource: content, container, viewport });
        await layer.render();
        if (gone) {
          return;
        }
        const end = document.createElement("div");
        end.className = "endOfContent";
        container.append(end);
        setVersion((v) => v + 1);
        const annotations = await page.getAnnotations({ intent: "display" });
        if (gone) {
          return;
        }
        setLinks(
          annotations
            .filter((a) => a.subtype === "Link")
            .map((a) => ({
              rect: viewport.convertToViewportRectangle(a.rect),
              dest: a.dest,
              url: a.url,
              text: a.contentsObj?.str,
            })),
        );
      } catch (err) {
        if (!gone) {
          setError("本页渲染失败，请重新打开文献。");
        }
      }
    });
    return () => {
      gone = true;
      task?.cancel();
      layer?.cancel();
      next.width = next.height = nextImages.width = nextImages.height = 0;
      container.replaceChildren();
    };
  }, [pdf, number, scale, queue]);
  useEffect(() => {
    const target = canvas.current!,
      imageTarget = imageColors.current!;
    return () => {
      target.width = target.height = imageTarget.width = imageTarget.height = 0;
    };
  }, []);
  useEffect(() => {
    const spans = [...(text.current?.querySelectorAll("span") ?? [])];
    const texts = spans.map((span) => span.textContent || ""),
      boxes = spans.map((span) => span.getBoundingClientRect()),
      separators = spans.map((span, index) => {
        const next = spans[index + 1];
        if (!next) return "";
        const left = boxes[index],
          right = boxes[index + 1];
        return spanSeparator(
          span.textContent || "",
          next.textContent || "",
          right.left - left.right,
          Math.max(left.height, right.height),
          Math.abs(left.top - right.top) < Math.min(left.height, right.height) * 0.5,
        );
      }),
      joined = joinedSearchText(texts, separators),
      term = search.query.trim();
    const matches = searchRanges(joined, term, search);
    const page = text.current?.closest("[data-paper-page]")?.getBoundingClientRect();
    if (!page) return setHighlights([]);
    setHighlights(
      splitSearchMatches(texts, matches, separators).flatMap((part) => {
        const range = textRange(spans[part.span], part.start, part.end);
        return range
          ? [...range.getClientRects()]
              .filter((rect) => rect.width > 0 && rect.height > 0)
              .map((rect) => ({
                left: rect.left - page.left,
                top: rect.top - page.top,
                width: rect.width,
                height: rect.height,
                current:
                  number === search.currentPage && part.match === search.currentOccurrence,
              }))
          : [];
      }),
    );
  }, [
    search.query,
    search.caseSensitive,
    search.wholeWord,
    search.currentPage,
    search.currentOccurrence,
    version,
  ]);
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
