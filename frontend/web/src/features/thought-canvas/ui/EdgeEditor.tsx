import { useEffect, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import type { CanvasEdge } from "../domain/types.js";
export function EdgeEditor({
  edge,
  save,
  remove,
}: {
  edge: CanvasEdge;
  save: (value: CanvasEdge) => void;
  remove: () => void;
}) {
  const [label, setLabel] = useState(edge.label);
  useEffect(() => setLabel(edge.label), [edge.id, edge.label]);
  return (
    <div className="absolute bottom-3 left-3 flex gap-2 rounded-xl bg-wb-panel p-3 shadow-wb-pop">
      <input
        aria-label="连线标签"
        value={label}
        maxLength={200}
        className="w-32 rounded bg-wb-fill px-2"
        onChange={(event) => setLabel(event.target.value)}
        onBlur={() => {
          if (label !== edge.label) {
            save({ ...edge, label });
          }
        }}
      />
      <select
        aria-label="连线样式"
        value={edge.style}
        onChange={(event) => save({ ...edge, style: event.target.value as "arrow" | "line" })}
      >
        <option value="arrow">箭头</option>
        <option value="line">直连</option>
      </select>
      <Button size="sm" onClick={remove}>
        删除连线
      </Button>
    </div>
  );
}
