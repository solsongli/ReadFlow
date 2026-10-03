import { useId } from "react";
import { edgePath, intersects, world } from "../domain/geometry.js";
import type { CanvasEdge, CanvasNode, Point, View } from "../domain/types.js";
export function Edges({
  nodes,
  edges,
  view,
  width,
  height,
  selected,
  select,
  connection,
}: {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  view: View;
  width: number;
  height: number;
  selected: string | null;
  select: (id: string) => void;
  connection: { from: string; to: Point } | null;
}) {
  const markerId = useId().replace(/:/g, "-");
  const viewport = {
    ...world({ x: -50, y: -50 }, view),
    width: (width + 100) / view.zoom,
    height: (height + 100) / view.zoom,
  };
  const index = new Map(nodes.map((node) => [node.id, node]));
  const pending = connection && index.get(connection.from);
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-label="画布连线"
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {edges.map((edge) => {
          const from = index.get(edge.from_id),
            to = index.get(edge.to_id);
          if (!from || !to) {
            return null;
          }
          const route = edgePath(from, to);
          if (!intersects(viewport, route.bounds)) {
            return null;
          }
          return (
            <g
              key={edge.id}
              data-edge={edge.id}
              className="pointer-events-auto cursor-pointer text-wb-text-3"
              onPointerDown={(event) => {
                event.stopPropagation();
                select(edge.id);
              }}
            >
              <path
                d={route.path}
                fill="none"
                stroke="currentColor"
                strokeWidth={selected === edge.id ? 3 : 1.5}
                markerEnd={edge.style === "arrow" ? `url(#${markerId})` : undefined}
              />
              <path d={route.path} fill="none" stroke="transparent" strokeWidth={14} />
              {edge.label ? (
                <foreignObject x={route.label.x - 100} y={route.label.y - 26} width={200} height={24}>
                  <div
                    className="tc-edge-label mx-auto w-fit max-w-full truncate rounded-full px-2 py-1 text-[12px] leading-4"
                    title={edge.label}
                  >
                    {edge.label}
                  </div>
                </foreignObject>
              ) : null}
            </g>
          );
        })}
        {pending && connection ? (
          <path
            d={edgePath(pending, { ...connection.to, width: 1, height: 1 }).path}
            stroke="currentColor"
            fill="none"
            strokeDasharray="5 4"
          />
        ) : null}
      </g>
    </svg>
  );
}
