import { useEffect, useRef, useState } from "react";
import { restoreImageColors } from "./image-colors.js";
import { rasterDimensions } from "../domain/navigation.js";
import { searchRanges } from "../domain/analysis.js";
import { joinedSearchText, spanSeparator, splitSearchMatches } from "../domain/search-highlight.js";
import {
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type renderQueue,
} from "./document.js";
import type { SearchOptions } from "../domain/types.js";

interface SurfaceLink {
  rect: number[];
  dest?: unknown;
  url?: string;
  text?: string;
}

interface RasterIdentity {
  pdf: PDFDocumentProxy;
  number: number;
  scale: number;
  ratio: number;
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

async function renderRaster({
  page,
  scale,
  ratio,
  restore,
  target,
  imageTarget,
  gone,
  setTask,
  setError,
}: {
  page: PDFPageProxy;
  scale: number;
  ratio: number;
  restore: boolean;
  target: HTMLCanvasElement;
  imageTarget: HTMLCanvasElement;
  gone: () => boolean;
  setTask: (task: ReturnType<PDFPageProxy["render"]>) => void;
  setError: (message: string) => void;
}) {
  const viewport = page.getViewport({ scale });
  const bitmap = document.createElement("canvas");
  bitmap.width = Math.max(1, Math.ceil(viewport.width * ratio));
  bitmap.height = Math.max(1, Math.ceil(viewport.height * ratio));
  const task = page.render({
    canvasContext: bitmap.getContext("2d", { alpha: false })!,
    viewport,
    transform: [ratio, 0, 0, ratio, 0, 0],
  });
  setTask(task);
  await task.promise;
  if (gone()) return;
  const images = document.createElement("canvas");
  if (restore) {
    await restoreImageColors(page, bitmap, images, viewport, ratio, gone).catch(() => {
      if (!gone()) setError("本页图片原色恢复失败；文字与阅读仍可用。");
    });
    if (gone()) return;
  }
  target.width = bitmap.width;
  target.height = bitmap.height;
  target.getContext("2d", { alpha: false })!.drawImage(bitmap, 0, 0);
  target.style.visibility = "visible";
  if (restore) {
    imageTarget.width = images.width;
    imageTarget.height = images.height;
    imageTarget.style.cssText = images.style.cssText;
    Object.assign(imageTarget.dataset, images.dataset);
    if (images.width && images.height) imageTarget.getContext("2d")!.drawImage(images, 0, 0);
    imageTarget.style.visibility = "visible";
  }
  bitmap.width = bitmap.height = images.width = images.height = 0;
}

export function usePageSurface({
  pdf,
  number,
  scale,
  queue,
  deferHighResolution,
  visiblePage,
  search,
  painted,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  scale: number;
  queue: ReturnType<typeof renderQueue>;
  deferHighResolution: boolean;
  visiblePage: boolean;
  search: SearchOptions & { query: string; currentPage?: number; currentOccurrence?: number };
  painted: () => void;
}) {
  const imageColors = useRef<HTMLCanvasElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null),
    raster = useRef<RasterIdentity | null>(null);
  const [links, setLinks] = useState<SurfaceLink[]>([]);
  const [highlights, setHighlights] = useState<
    Array<{ left: number; top: number; width: number; height: number; current: boolean }>
  >([]);
  const [version, setVersion] = useState(0),
    [error, setError] = useState("");

  useEffect(() => {
    const existing = raster.current;
    if (existing?.pdf === pdf && existing.number === number && existing.scale === scale) return;
    let gone = false;
    let task: ReturnType<PDFPageProxy["render"]> | undefined;
    queue.run(async () => {
      if (gone) return;
      try {
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale });
        const ratio = Math.min(1, rasterDimensions(viewport.width, viewport.height, 1).ratio);
        await renderRaster({
          page,
          scale,
          ratio,
          restore: false,
          target: canvas.current!,
          imageTarget: imageColors.current!,
          gone: () => gone,
          setTask: (value) => (task = value),
          setError,
        });
        if (!gone) {
          raster.current = { pdf, number, scale, ratio };
          painted();
        }
      } catch {
        if (!gone) setError("本页渲染失败，请重新打开文献。");
      }
    }, visiblePage ? 5 : 3);
    return () => {
      gone = true;
      task?.cancel();
    };
  }, [pdf, number, scale, queue, visiblePage]);

  useEffect(() => {
    if (deferHighResolution) return;
    let gone = false;
    let task: ReturnType<PDFPageProxy["render"]> | undefined;
    queue.run(async () => {
      if (gone) return;
      try {
        const page = await pdf.getPage(number),
          viewport = page.getViewport({ scale }),
          ratio = rasterDimensions(viewport.width, viewport.height, window.devicePixelRatio).ratio;
        const existing = raster.current;
        if (
          existing?.pdf === pdf &&
          existing.number === number &&
          existing.scale === scale &&
          existing.ratio >= ratio
        )
          return;
        await renderRaster({
          page,
          scale,
          ratio,
          restore: true,
          target: canvas.current!,
          imageTarget: imageColors.current!,
          gone: () => gone,
          setTask: (value) => (task = value),
          setError,
        });
        if (!gone) {
          raster.current = { pdf, number, scale, ratio };
          painted();
        }
      } catch {
        if (!gone) setError("本页高清渲染失败；已保留快速预览。");
      }
    }, visiblePage ? 2 : 1);
    return () => {
      gone = true;
      task?.cancel();
    };
  }, [pdf, number, scale, queue, deferHighResolution, visiblePage]);

  useEffect(() => {
    let gone = false;
    let layer: TextLayer | undefined;
    const container = text.current!;
    container.replaceChildren();
    setLinks([]);
    queue.run(async () => {
      if (gone) return;
      try {
        const page = await pdf.getPage(number),
          viewport = page.getViewport({ scale }),
          content = await page.getTextContent();
        if (gone) return;
        layer = new TextLayer({ textContentSource: content, container, viewport });
        await layer.render();
        if (gone) return;
        const end = document.createElement("div");
        end.className = "endOfContent";
        container.append(end);
        setVersion((value) => value + 1);
        const annotations = await page.getAnnotations({ intent: "display" });
        if (gone) return;
        setLinks(
          annotations
            .filter((annotation) => annotation.subtype === "Link")
            .map((annotation) => ({
              rect: viewport.convertToViewportRectangle(annotation.rect),
              dest: annotation.dest,
              url: annotation.url,
              text: annotation.contentsObj?.str,
            })),
        );
      } catch {
        if (!gone) setError("本页文本层未能生成；页面画面仍可阅读。");
      }
    }, visiblePage ? 4 : 2);
    return () => {
      gone = true;
      layer?.cancel();
      container.replaceChildren();
    };
  }, [pdf, number, scale, queue]);

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
                current: number === search.currentPage && part.match === search.currentOccurrence,
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

  useEffect(
    () => () => {
      const target = canvas.current,
        imageTarget = imageColors.current;
      if (target) target.width = target.height = 0;
      if (imageTarget) imageTarget.width = imageTarget.height = 0;
      text.current?.replaceChildren();
    },
    [],
  );
  return { imageColors, canvas, text, links, highlights, error };
}
