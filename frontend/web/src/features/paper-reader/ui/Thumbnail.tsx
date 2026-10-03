import { useEffect, useRef } from "react";
import type { PDFDocumentProxy, renderQueue } from "../state/document.js";
export function Thumbnail({
  pdf,
  page,
  queue,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  queue: ReturnType<typeof renderQueue>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = ref.current!;
    let gone = false,
      visible = false,
      generation = 0,
      render: { cancel: () => void } | undefined;
    target.width = target.height = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (visible === entry.isIntersecting) {
          return;
        }
        visible = entry.isIntersecting;
        const version = ++generation;
        if (!visible) {
          render?.cancel();
          target.width = target.height = 0;
          return;
        }
        queue.run(async () => {
          if (gone || version !== generation) {
            return;
          }
          try {
            const p = await pdf.getPage(page);
            if (gone || version !== generation) {
              return;
            }
            const viewport = p.getViewport({ scale: 120 / p.getViewport({ scale: 1 }).width });
            target.width = viewport.width;
            target.height = viewport.height;
            const task = p.render({ canvasContext: target.getContext("2d")!, viewport });
            render = task;
            await task.promise;
          } catch {
            /* Main page reports rendering failures. */
          }
        });
      },
      { rootMargin: "120px" },
    );
    observer.observe(target);
    return () => {
      gone = true;
      generation++;
      observer.disconnect();
      render?.cancel();
      target.width = target.height = 0;
    };
  }, [pdf, page, queue]);
  return (
    <canvas
      ref={ref}
      className="pr-thumbnail mx-auto h-[170px] w-[120px] object-contain"
      aria-label={`第 ${page} 页缩略图`}
    />
  );
}
