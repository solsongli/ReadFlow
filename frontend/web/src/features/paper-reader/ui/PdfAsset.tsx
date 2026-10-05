import { useEffect, useRef, useState, type ReactNode } from "react";
import { openPdf, type PDFPageProxy } from "../state/document.js";
import { rasterRatio } from "../domain/navigation.js";
/** A retained vector PDF asset rasterized again at each zoom, not a magnified thumbnail. */
export function PdfAsset({
  url,
  headers,
  zoom,
  children,
  bounds,
}: {
  url: string;
  headers: Record<string, string>;
  zoom: number;
  bounds: { width: number; height: number };
  children?: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState<PDFPageProxy>(),
    [error, setError] = useState("");
  const [size, setSize] = useState({ width: 700, height: 400 });
  const credentials = JSON.stringify(headers);
  useEffect(() => {
    let cancelled = false;
    const task = openPdf(url, headers);
    setPage(undefined);
    setError("");
    void task.promise
      .then(async (pdf) => {
        const value = await pdf.getPage(1);
        if (cancelled) return;
        setPage(value);
      })
      .catch(() => {
        if (!cancelled) setError("图表裁剪未能读取，请重新分析文档后重试。");
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url, credentials]);
  useEffect(() => {
    if (!page) return;
    const view = page.getViewport({ scale: 1 });
    const fit = Math.min(bounds.width / view.width, bounds.height / view.height, 2);
    setSize({ width: view.width * fit, height: view.height * fit });
  }, [page, bounds.width, bounds.height]);
  useEffect(() => {
    if (!page) return;
    const target = canvas.current!;
    const base = page.getViewport({ scale: 1 });
    const ratio = rasterRatio(size.width * zoom, size.height * zoom, devicePixelRatio);
    const viewport = page.getViewport({ scale: (size.width / base.width) * zoom * ratio });
    target.width = Math.ceil(viewport.width);
    target.height = Math.ceil(viewport.height);
    const render = page.render({ canvasContext: target.getContext("2d", { alpha: false })!, viewport });
    void render.promise.catch((failure) => {
      if (failure?.name !== "RenderingCancelledException") setError("图表绘制失败，请重新打开。");
    });
    return () => {
      render.cancel();
      target.width = target.height = 0;
    };
  }, [page, zoom, size]);
  return (
    <div className="relative shrink-0" style={size} data-vector-asset>
      <canvas ref={canvas} className="h-full w-full" aria-label="图表矢量裁剪" />
      {page ? children : null}
      {error ? (
        <p role="status" className="absolute inset-x-0 top-0 bg-wb-panel p-3 text-wb-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
