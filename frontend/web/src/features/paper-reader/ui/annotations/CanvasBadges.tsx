import type { Annotation } from "../../domain/annotations/types.js";
import type { ReaderPorts } from "../../domain/types.js";
export function CanvasBadges({ rows, ports }: { rows: Annotation[]; ports: ReaderPorts }) {
  return (
    <>
      {rows.map((row) => {
        const references = ports.canvasLinks?.filter((link) => link.annotation_id === row.id);
        const rect = row.rects[0];
        if (!references?.length || !rect) {
          return null;
        }
        return (
          <button
            key={row.id}
            type="button"
            title={references.map((link) => link.name).join("、")}
            aria-label={`打开批注所在画布 ${references[0].name}`}
            className="absolute z-20 rounded border-0 bg-wb-panel px-1 text-[0.625rem] text-wb-link shadow-wb-card"
            style={{ left: `${Math.min(0.88, rect.x + rect.width) * 100}%`, top: `${rect.y * 100}%` }}
            onClick={(event) => {
              event.stopPropagation();
              const link = references[0];
              ports.openCanvasLink?.(link.canvas_id, link.name, link.node_id);
            }}
          >
            画布
          </button>
        );
      })}
    </>
  );
}
