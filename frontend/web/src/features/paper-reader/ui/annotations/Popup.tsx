import { useAnnotationAnchor } from "../../state/annotations/useAnnotationAnchor.js";
import { useEffect, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import type { AnnotationController } from "../../state/annotations/useAnnotations.js";
import type { Semantics } from "../../domain/annotations/types.js";
import { annotationMarkdown } from "../../domain/annotations/markdown.js";
import { Colors } from "./Colors.js";
export function AnnotationPopup({
  controller: c,
  labels,
}: {
  controller: AnnotationController;
  labels: Semantics;
}) {
  const row = c.rows.find((entry) => entry.id === c.editingId);
  const anchor = useAnnotationAnchor(row?.id, () => c.setEditingId(null));
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setNote(row?.note ?? "");
    setConfirm(false);
  }, [row?.id, row?.note]);
  if (!row) {
    return null;
  }
  return (
    <section
      aria-label="编辑批注"
      ref={anchor.ref}
      style={anchor.style}
      className="fixed z-30 w-72 overflow-auto rounded-xl bg-wb-panel p-3 shadow-wb-pop"
    >
      <div className="flex items-center justify-between gap-2">
        <Colors labels={labels} value={row.color} change={(color) => void c.update([row.id], { color })} />
        <Button size="sm" onClick={() => c.setEditingId(null)}>
          收起
        </Button>
      </div>
      <textarea
        aria-label="编辑批注说明"
        placeholder="添加说明（Markdown）"
        value={note}
        maxLength={100000}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        className="my-2 w-full rounded-lg border-0 bg-wb-fill p-2 text-[0.8125rem]"
      />
      {note ? (
        <div
          aria-label="说明预览"
          className="max-h-24 overflow-auto text-[0.75rem]"
          dangerouslySetInnerHTML={{ __html: annotationMarkdown(note) }}
        />
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1">
        <Button
          size="sm"
          disabled={c.busy || note === row.note}
          onClick={() => void c.update([row.id], { note })}
        >
          保存说明
        </Button>
        <Button
          size="sm"
          disabled={!row.quote}
          onClick={() => {
            void navigator.clipboard.writeText(row.quote).catch(() => c.setNotice("复制失败，请重试。"));
          }}
        >
          复制引文
        </Button>
        <Button size="sm" onClick={() => setConfirm(true)}>
          删除
        </Button>
        {confirm ? (
          <Button size="sm" disabled={c.busy} onClick={() => void c.remove([row.id])}>
            确认删除
          </Button>
        ) : null}
      </div>
    </section>
  );
}
