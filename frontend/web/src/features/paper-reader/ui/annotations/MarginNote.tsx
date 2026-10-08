import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import type { Annotation } from "../../domain/annotations/types.js";
import type { AnnotationController } from "../../state/annotations/useAnnotations.js";
import { AnnotationTags } from "./Tags.js";
import { annotationDragPayload } from "../../domain/annotations/citation.js";
export function MarginNote({
  row,
  controller,
  open,
}: {
  row: Annotation;
  controller: AnnotationController;
  open: () => void;
}) {
  const [note, setNote] = useState(row.note);
  const [saving, setSaving] = useState(false);
  useEffect(() => setNote(row.note), [row.note]);
  const save = async () => {
    if (note === row.note || saving) return;
    setSaving(true);
    try {
      await controller.update([row.id], { note });
    } finally {
      setSaving(false);
    }
  };
  return (
    <article
      draggable
      data-margin-note={row.id}
      className="space-y-2 p-2.5"
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        const payload = annotationDragPayload(row, controller.citation(row));
        event.dataTransfer.setData("application/x-readflow-canvas", payload.canvas);
        event.dataTransfer.setData("text/plain", payload.plain);
        event.dataTransfer.setData("text/html", payload.html);
      }}
    >
      <button
        type="button"
        title="定位这条批注"
        aria-label="定位这条批注"
        onClick={open}
        className="flex w-full items-start gap-2 border-0 bg-transparent p-0 text-left text-wb-text"
      >
        <MessageSquare size={13} className="pr-margin-color mt-1 shrink-0" />
        <span className="line-clamp-1 font-wb-serif text-[0.8125rem] leading-snug">
          {row.quote || "页面批注"}
        </span>
      </button>
      <textarea
        aria-label="页边批注说明"
        placeholder="添加说明…"
        value={note}
        rows={2}
        maxLength={100000}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
        className="w-full resize-y border-0 bg-transparent p-0 text-[0.8125rem] leading-snug text-wb-text"
      />
      <AnnotationTags row={row} controller={controller} />
      {saving ? (
        <span role="status" className="text-xs text-wb-text-3">
          正在保存…
        </span>
      ) : null}
    </article>
  );
}
