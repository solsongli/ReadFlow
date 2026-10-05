import { useEffect, useRef, useState } from "react";
import { PdfAsset, useReaderDialogFocus } from "@/features/paper-reader/index.js";
import { buildApiHeaders } from "@/platform/config/runtime.js";
import { Button } from "@/ui/wb/Button.js";
import type { Block, PageGeometry } from "../domain/model.js";
import { labelBox } from "../domain/reading.js";
import { FittedTranslation } from "./FittedTranslation.js";
import { InlineRuns } from "./InlineRuns.js";
export function FigureViewer({
  block,
  caption,
  geometry,
  url,
  imageText,
  close,
}: {
  block: Block;
  caption?: Block;
  geometry?: PageGeometry;
  url: string;
  imageText: boolean;
  close: () => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState(imageText),
    [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  useEffect(() => setLabels(imageText), [imageText]);
  const [bounds, setBounds] = useState({ width: 850, height: 500 });
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() =>
      setBounds({
        width: Math.max(50, Math.min(850, element.clientWidth - 24)),
        height: Math.max(50, Math.min(500, element.clientHeight - 24)),
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const latest = useRef(view);
  latest.current = view;
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  useReaderDialogFocus(root, true, close);
  useEffect(() => {
    const element = viewport.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const current = latest.current,
        zoom = Math.max(0.3, Math.min(5, current.zoom * Math.exp(-event.deltaY * 0.002)));
      const x = event.clientX - rect.left - rect.width / 2,
        y = event.clientY - rect.top - rect.height / 2;
      setView({
        zoom,
        x: x - ((x - current.x) * zoom) / current.zoom,
        y: y - ((y - current.y) * zoom) / current.zoom,
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  const anchor = block.anchors[0].view_bbox;
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="图表放大"
      className="absolute inset-0 z-50 flex flex-col bg-wb-panel p-4 text-wb-text"
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <strong className="mr-auto">图表 · 第 {block.page} 页</strong>
        <Button onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.3, v.zoom / 1.2) }))}>缩小</Button>
        <span aria-live="polite">{Math.round(view.zoom * 100)}%</span>
        <Button onClick={() => setView((v) => ({ ...v, zoom: Math.min(5, v.zoom * 1.2) }))}>放大</Button>
        <Button onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>适应窗口</Button>
        <Button aria-pressed={labels} onClick={() => setLabels(!labels)}>
          图内译文
        </Button>
        <Button onClick={close}>关闭</Button>
      </header>
      <div
        ref={viewport}
        className="relative min-h-0 flex-1 touch-none overflow-hidden rounded-xl bg-wb-desk-bg"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, left: view.x, top: view.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setView((v) => ({ ...v, x: d.left + e.clientX - d.x, y: d.top + e.clientY - d.y }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            transform: `translate(${view.x}px,${view.y}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <div className="pr-reader -translate-x-1/2 -translate-y-1/2" data-tone="white">
            <PdfAsset url={url} headers={buildApiHeaders()} zoom={view.zoom} bounds={bounds}>
              {labels && geometry
                ? block.figure_text
                    ?.filter((l) => l.translation && l.bbox)
                    .map((label) => {
                      const box = labelBox(label.bbox!, geometry);
                      return (
                        <div
                          key={label.id}
                          data-viewer-label
                          className="pointer-events-none absolute overflow-hidden"
                          style={{
                            left: `${((box[0] - anchor[0]) / (anchor[2] - anchor[0])) * 100}%`,
                            top: `${((box[1] - anchor[1]) / (anchor[3] - anchor[1])) * 100}%`,
                            width: `${((box[2] - box[0]) / (anchor[2] - anchor[0])) * 100}%`,
                            height: `${((box[3] - box[1]) / (anchor[3] - anchor[1])) * 100}%`,
                          }}
                        >
                          <FittedTranslation text={label.translation!} base={12} label />
                        </div>
                      );
                    })
                : null}
            </PdfAsset>
          </div>
        </div>
      </div>
      <p className="mb-0 max-h-32 overflow-auto text-sm leading-relaxed">
        {caption ? (
          <InlineRuns text={caption.translation || caption.text} runs={caption.translation_runs} />
        ) : (
          "原图没有可关联的图注。"
        )}
      </p>
    </div>
  );
}
