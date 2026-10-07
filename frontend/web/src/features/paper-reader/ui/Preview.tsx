import { useEffect, useRef } from "react";
import type { FigureTarget, Reference } from "../domain/types.js";
import type { PDFDocumentProxy, renderQueue } from "../state/document.js";
import { Button } from "@/ui/wb/Button.js";
import { previewRegion } from "../domain/navigation.js";
export interface HoverPreview {
  x: number;
  y: number;
  references?: Reference[];
  figure?: FigureTarget;
  target?: { page: number; y: number };
  pdf: PDFDocumentProxy;
}
export function Preview({
  preview,
  queue,
  jump,
  lookup,
  matches,
  leave,
  hold,
}: {
  preview: HoverPreview;
  queue: ReturnType<typeof renderQueue>;
  jump: (page: number, y: number) => void;
  lookup: (reference: Reference) => void;
  matches: Array<{ id: string; title: string }>;
  leave: () => void;
  hold: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!preview.figure && !preview.target) {
      return;
    }
    let gone = false;
    let task: { cancel: () => void } | undefined;
    const target = canvas.current!,
      figure = preview.figure;
    queue.run(async () => {
      if (gone) {
        return;
      }
      try {
        const pageNumber = figure?.page ?? preview.target!.page;
        const page = await preview.pdf.getPage(pageNumber);
        if (gone) {
          return;
        }
        const native = page.getViewport({ scale: 1 });
        const region = figure
          ? { top: figure.top, bottom: figure.bottom }
          : previewRegion(preview.target!.y, native.height);
        const scale = 380 / native.width,
          viewport = page.getViewport({ scale });
        target.width = viewport.width * 2;
        target.height = (region.bottom - region.top) * scale * 2;
        const render = page.render({
          canvasContext: target.getContext("2d")!,
          viewport,
          transform: [2, 0, 0, 2, 0, -region.top * scale * 2],
        });
        task = render;
        await render.promise;
      } catch {
        /* Preview is optional; its page can still be opened. */
      }
    });
    return () => {
      gone = true;
      task?.cancel();
      target.width = target.height = 0;
    };
  }, [preview, queue]);
  return (
    <aside
      role="dialog"
      aria-label={preview.figure ? "图表预览" : preview.references?.length ? "引用预览" : "链接预览"}
      className="fixed z-50 max-h-[60vh] w-[410px] max-w-[calc(100vw-24px)] overflow-auto rounded-xl border border-wb-line-soft bg-wb-panel p-4 text-wb-text shadow-wb-pop"
      style={{
        left: Math.max(12, Math.min(preview.x, innerWidth - 430)),
        top: Math.max(12, Math.min(preview.y + 15, innerHeight - 400)),
      }}
      onMouseEnter={hold}
      onMouseLeave={leave}
    >
      {preview.figure ? (
        <>
          <button
            type="button"
            aria-label="跳到图表区域"
            className="block w-full border-0 bg-transparent p-0"
            onClick={() => jump(preview.figure!.page, preview.figure!.top)}
          >
            <canvas ref={canvas} className="w-full" />
          </button>
          <p className="text-[0.75rem] text-wb-text-3">{preview.figure.caption} · 原文启发式区域</p>
          <Button size="sm" onClick={() => jump(preview.figure!.page, preview.figure!.top)}>
            跳到图表
          </Button>
        </>
      ) : (
        <>
          {preview.target ? (
            <button
              type="button"
              aria-label="跳到链接目标"
              className="mb-3 block w-full border-0 bg-transparent p-0"
              onClick={() => jump(preview.target!.page, preview.target!.y)}
            >
              <canvas ref={canvas} className="w-full" />
            </button>
          ) : null}
          {preview.references?.map((reference) => (
          <div key={reference.id} className="mb-3 last:mb-0">
            <p className="m-0 mb-3 font-wb-serif text-[0.875rem] leading-relaxed">
              {reference.number ? `[${reference.number}] ` : ""}
              {reference.text}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => jump(reference.page, reference.y)}>
                跳到参考文献
              </Button>
              <Button size="sm" onClick={() => void navigator.clipboard.writeText(reference.text)}>
                复制条目
              </Button>
              <Button size="sm" onClick={() => lookup(reference)}>
                在文献库中查找
              </Button>
            </div>
          </div>
          ))}
          {!preview.references?.length && preview.target ? (
            <Button size="sm" onClick={() => jump(preview.target!.page, preview.target!.y)}>
              跳到目标位置 · 第 {preview.target.page} 页
            </Button>
          ) : null}
        </>
      )}
      {matches.length ? (
        <p className="mb-0 text-[0.75rem] text-wb-link">
          已在库中 · {matches.map((m) => m.title).join("；")}
        </p>
      ) : null}
    </aside>
  );
}
