import type { MarginEntry } from "@/ui/wb/PageMargins.js";
import type { Annotation } from "../../domain/annotations/types.js";
import type { AnnotationController } from "./useAnnotations.js";
import { MarginNote } from "../../ui/annotations/MarginNote.js";
export function annotationMargins(
  rows: Annotation[],
  c: AnnotationController,
  open: (row: Annotation) => void,
): MarginEntry[] {
  return rows.map((row) => {
    const point = row.rects[0] || row.ink[0] || { x: 0.5, y: 0 };
    return {
      id: `note-${row.id}`,
      kind: "annotation",
      x: point.x,
      y: point.y,
      bottom: point.y + (row.rects[0]?.height || 0.03),
      color: row.color,
      active: c.hover === row.id || c.flash === row.id || c.editingId === row.id,
      height: 110,
      label: `页边批注：${row.quote || row.note || "页面批注"}`,
      activate: () => open(row),
      hover: (active) => c.setHover(active ? row.id : null),
      content: () => <MarginNote row={row} controller={c} open={() => open(row)} />,
    };
  });
}
