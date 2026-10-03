import { useRef, useState, type ReactNode } from "react";
export type ReaderLayout = "document" | "split" | "canvas";
export function ReaderCanvasLayout({
  layout,
  canvas,
  children,
}: {
  layout: ReaderLayout;
  canvas?: ReactNode;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [fraction, setFraction] = useState(0.55);
  return (
    <div ref={root} className="flex min-h-0 min-w-0 flex-1">
      <div
        className={layout === "canvas" ? "hidden" : "flex min-h-0 min-w-0"}
        style={{ width: layout === "split" ? `${fraction * 100}%` : "100%" }}
      >
        {children}
      </div>
      {layout === "split" ? (
        <div
          role="separator"
          aria-label="调整文献与画布宽度"
          aria-orientation="vertical"
          tabIndex={0}
          className="w-1.5 shrink-0 cursor-col-resize bg-wb-line-soft hover:bg-wb-accent"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              setFraction((value) =>
                Math.max(0.25, Math.min(0.75, value + (event.key === "ArrowLeft" ? -0.03 : 0.03))),
              );
            }
          }}
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
              return;
            }
            const box = root.current!.getBoundingClientRect();
            setFraction(Math.max(0.25, Math.min(0.75, (event.clientX - box.left) / box.width)));
          }}
          onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        />
      ) : null}
      {layout !== "document" ? <div className="flex min-h-0 min-w-0 flex-1">{canvas}</div> : null}
    </div>
  );
}
