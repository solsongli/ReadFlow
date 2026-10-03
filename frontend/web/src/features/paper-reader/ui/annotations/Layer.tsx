import { annotationMarkdown } from "../../domain/annotations/markdown.js";
import { useRef, useState } from "react";
import type { Annotation, Point, Rect } from "../../domain/annotations/types.js";
import { boxBetween, simplifyInk } from "../../domain/annotations/geometry.js";
import type { AnnotationController } from "../../state/annotations/useAnnotations.js";

function regionImage(element: SVGSVGElement, rect: Rect) {
  const original = element.closest("[data-paper-page]")?.querySelector("canvas");
  if (!original?.width) {
    throw new Error("页面尚未绘制完成。");
  }
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(rect.width * original.width));
  output.height = Math.max(1, Math.round(rect.height * original.height));
  output
    .getContext("2d")!
    .drawImage(
      original,
      rect.x * original.width,
      rect.y * original.height,
      output.width,
      output.height,
      0,
      0,
      output.width,
      output.height,
    );
  return output.toDataURL("image/png");
}
export function AnnotationLayer({
  page,
  rows,
  controller: c,
}: {
  page: number;
  rows: Annotation[];
  controller: AnnotationController;
}) {
  const [draft, setDraft] = useState<Point[]>([]);
  const gesture = useRef<{ points: Point[]; moving?: Annotation } | null>(null);
  const interactive = ["sticky", "region", "ink", "erase"].includes(c.tool);
  const point = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    };
  };
  function start(event: React.PointerEvent<SVGSVGElement>) {
    if (c.busy || event.button !== 0) {
      return;
    }
    const target = (event.target as Element).closest("[data-annotation-id]");
    const row = rows.find((entry) => entry.id === target?.getAttribute("data-annotation-id"));
    if (c.tool === "erase") {
      if (row?.type === "ink") {
        void c.remove([row.id]);
      }
      event.stopPropagation();
      return;
    }
    if (row) {
      c.setEditingId(row.id);
      if (row.type !== "sticky") {
        return;
      }
    } else if (!interactive) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { points: [point(event)], moving: row };
    setDraft(gesture.current.points);
  }
  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (!gesture.current) {
      return;
    }
    const points = [...gesture.current.points, point(event)].slice(-10000);
    gesture.current.points = points;
    setDraft(points);
  }
  function finish(event: React.PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    gesture.current = null;
    setDraft([]);
    if (!current) {
      return;
    }
    event.stopPropagation();
    const end = point(event);
    if (current.moving) {
      const old = current.moving.rects[0];
      const start = current.points[0];
      const rect = {
        ...old,
        x: Math.max(0, Math.min(1 - old.width, old.x + end.x - start.x)),
        y: Math.max(0, Math.min(1 - old.height, old.y + end.y - start.y)),
      };
      void c.update([current.moving.id], { rects: [rect] });
    } else if (c.tool === "sticky") {
      void c.create({
        type: "sticky",
        page_index: page,
        rects: [{ x: Math.min(0.975, end.x), y: Math.min(0.975, end.y), width: 0.025, height: 0.025 }],
      });
    } else if (c.tool === "ink") {
      const ink = simplifyInk([...current.points, end]);
      if (ink.length >= 2) {
        void c.create({ type: "ink", page_index: page, ink });
      }
    } else if (c.tool === "region") {
      const rect = boxBetween(current.points[0], end);
      if (rect.width < 0.005 || rect.height < 0.005) {
        return;
      }
      try {
        void c.create({
          type: "region",
          page_index: page,
          rects: [rect],
          image: regionImage(event.currentTarget, rect),
        });
      } catch {
        c.setNotice("请等待页面绘制完成后重新框选。");
      }
    }
  }
  const path = (points: Point[]) => points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ");
  const preview = draft.length ? boxBetween(draft[0], draft.at(-1)!) : null;
  const hovered = rows.find((row) => row.id === c.hover && row.type === "sticky");
  return (
    <>
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-label={`第 ${page + 1} 页批注层`}
        className="pr-annotations absolute inset-0 h-full w-full"
        style={{ pointerEvents: interactive ? "auto" : "none" }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={() => {
          gesture.current = null;
          setDraft([]);
        }}
      >
        {rows.map((row) => (
          <g
            key={row.id}
            data-annotation-id={row.id}
            data-annotation-color={row.color}
            data-flash={c.flash === row.id}
            data-active={
              c.editingId === row.id ||
              c.selected.includes(row.id) ||
              c.hover === row.id ||
              c.flash === row.id
            }
            className="pr-mark"
            style={{ pointerEvents: "auto" }}
            onClick={(event) => {
              event.stopPropagation();
              c.setEditingId(row.id);
            }}
            onMouseEnter={() => c.setHover(row.id)}
            onMouseLeave={() => c.setHover(null)}
          >
            <title>{row.note || row.quote || "批注"}</title>
            {row.type === "ink" ? (
              <polyline
                points={path(row.ink)}
                fill="none"
                stroke="currentColor"
                strokeWidth={row.width * 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              row.rects.map((rect, i) => (
                <rect
                  key={i}
                  x={rect.x * 1000}
                  y={(rect.y + (row.type === "underline" ? rect.height * 0.88 : 0)) * 1000}
                  width={rect.width * 1000}
                  height={(row.type === "underline" ? 0.002 : rect.height) * 1000}
                  className={`pr-mark-${row.type}`}
                />
              ))
            )}
            {row.type === "sticky" && row.rects[0] ? (
              <text
                x={row.rects[0].x * 1000 + 5}
                y={row.rects[0].y * 1000 + 18}
                fontSize="17"
                fill="currentColor"
              >
                ≡
              </text>
            ) : null}
          </g>
        ))}
        {draft.length ? (
          <g data-annotation-color={c.color} className="pr-mark" pointerEvents="none">
            {c.tool === "ink" ? (
              <polyline points={path(draft)} fill="none" stroke="currentColor" strokeWidth={c.width * 1.5} />
            ) : preview ? (
              <rect
                x={preview.x * 1000}
                y={preview.y * 1000}
                width={preview.width * 1000}
                height={preview.height * 1000}
                className="pr-mark-region"
              />
            ) : null}
          </g>
        ) : null}
      </svg>
      {hovered?.note && hovered.rects[0] ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 max-w-64 rounded-lg bg-wb-panel p-3 text-[0.75rem] shadow-wb-pop"
          style={{
            left: `${Math.min(0.65, hovered.rects[0].x) * 100}%`,
            top: `${hovered.rects[0].y * 100}%`,
          }}
          dangerouslySetInnerHTML={{ __html: annotationMarkdown(hovered.note) }}
        />
      ) : null}
    </>
  );
}
