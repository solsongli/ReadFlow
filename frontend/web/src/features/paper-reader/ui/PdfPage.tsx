import { restoreImageColors } from "../state/image-colors.js";
import { rasterRatio } from "../domain/navigation.js";
import { useEffect, useRef, useState } from "react";
import { TextLayer, type PDFDocumentProxy, type PageSize, type renderQueue } from "../state/document.js";
export interface LinkBox {
  rect: number[];
  dest?: unknown;
  url?: string;
  text?: string;
}
export function PdfPage({
  pdf,
  number,
  scale,
  size,
  queue,
  query,
  onLink,
  onHover,
  onTextClick,
  onLeave,
  painted,
  overlay,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  scale: number;
  size: PageSize;
  queue: ReturnType<typeof renderQueue>;
  query: string;
  onLink: (link: LinkBox) => void;
  onTextClick: (event: React.MouseEvent) => void;
  onHover: (event: React.MouseEvent, link?: LinkBox) => void;
  onLeave: () => void;
  painted: () => void;
  overlay?: React.ReactNode;
}) {
  const imageColors = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<LinkBox[]>([]),
    [version, setVersion] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    let gone = false,
      task: { cancel: () => void } | undefined,
      layer: TextLayer | undefined;
    const imageTarget = imageColors.current!;
    const target = canvas.current!,
      container = text.current!;
    target.style.visibility = "hidden";
    imageTarget.style.visibility = "hidden";
    queue.run(async () => {
      if (gone) {
        return;
      }
      try {
        const page = await pdf.getPage(number);
        if (gone) {
          return;
        }
        const viewport = page.getViewport({ scale }),
          ratio = rasterRatio(viewport.width, viewport.height, window.devicePixelRatio);
        target.width = Math.ceil(viewport.width * ratio);
        target.height = Math.ceil(viewport.height * ratio);
        const render = page.render({
          canvasContext: target.getContext("2d", { alpha: false })!,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        task = render;
        await render.promise;
        if (gone) {
          return;
        }
        await restoreImageColors(page, target, imageTarget, viewport, ratio, () => gone).catch(() => {
          if (!gone) setError("本页图片原色恢复失败；文字与阅读仍可用。");
        });
        if (gone) return;
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
      target.width = target.height = 0;
      imageTarget.width = imageTarget.height = 0;
      container.replaceChildren();
    };
  }, [pdf, number, scale, queue]);
  useEffect(() => {
    const spans = [...(text.current?.querySelectorAll("span") ?? [])];
    const joined = spans
        .map((span) => span.textContent || "")
        .join(" ")
        .toLowerCase(),
      term = query.trim().toLowerCase();
    const matches: number[] = [];
    if (term) {
      for (let at = joined.indexOf(term); at >= 0; at = joined.indexOf(term, at + term.length)) {
        matches.push(at);
      }
    }
    let offset = 0;
    for (const span of spans) {
      const end = offset + (span.textContent?.length ?? 0);
      span.classList.toggle(
        "pr-search-hit",
        matches.some((at) => at < end && at + term.length > offset),
      );
      offset = end + 1;
    }
  }, [query, version]);
  return (
    <div
      className="pr-page relative shrink-0"
      data-paper-page={number}
      style={{ width: size.width * scale, height: size.height * scale }}
      onClick={onTextClick}
      onMouseMove={(event) => onHover(event)}
      onMouseLeave={onLeave}
    >
      <canvas ref={canvas} aria-label={`第 ${number} 页`} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={imageColors}
        aria-hidden="true"
        className="pr-image-colors pointer-events-none absolute inset-0 h-full w-full"
      />
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
      {error ? (
        <p role="status" className="absolute inset-x-4 top-4 rounded-lg bg-wb-panel p-3 text-wb-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
