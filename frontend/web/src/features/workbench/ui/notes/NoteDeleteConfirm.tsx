import { cardReferences, useFlashcards } from "@/features/flashcards/index.js";
import { useEffect, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { canvasApi, useCanvases } from "@/features/thought-canvas/index.js";
import { useWorkbench } from "../context.js";
export function NoteDeleteConfirm({
  id,
  item,
  annotation,
  deleting,
  setDeleting,
  close,
}: {
  id: string;
  item: string;
  annotation: boolean;
  deleting: boolean;
  setDeleting: (value: boolean) => void;
  close: () => void;
}) {
  const wb = useWorkbench();
  const flashcards = useFlashcards();
  const [cardCount, setCardCount] = useState(0);
  const canvases = useCanvases();
  const [count, setCount] = useState<number | null>(annotation ? null : 0);
  const [error, setError] = useState("");
  async function load() {
    try {
      const references = (await canvasApi.references(item)).filter((row) => row.annotation_id === id);
      setCardCount(await cardReferences(item, id));
      setCount(new Set(references.map((row) => row.canvas_id)).size);
      setError("");
    } catch {
      setError("无法检查画布引用，请重试。");
    }
  }
  useEffect(() => {
    if (annotation) void load();
  }, [id, annotation]);
  async function remove(policy?: "keep" | "remove") {
    setDeleting(true);
    try {
      await wb.notes.remove(policy);
      await canvases.reload();
      await flashcards?.reload();
      close();
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div
      role="alertdialog"
      aria-label="确认删除笔记"
      className="mx-6 mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-wb-panel-2 p-3 text-[0.75rem]"
    >
      <span className="flex-1">
        {count || cardCount
          ? `该批注在 ${count} 个画布中被引用，有 ${cardCount} 张闪卡引用了它。`
          : count == null
            ? "正在检查画布引用…"
            : `删除这条${annotation ? "批注及其笔记" : "笔记"}？此操作无法撤销。`}
      </span>
      <Button size="sm" disabled={deleting} onClick={close}>
        取消
      </Button>
      {count || cardCount ? (
        <>
          <Button size="sm" disabled={deleting} onClick={() => void remove("keep")}>
            保留为静态摘录
          </Button>
          <Button size="sm" disabled={deleting} onClick={() => void remove("remove")}>
            一并删除画布卡和闪卡
          </Button>
        </>
      ) : (
        <Button size="sm" variant="danger" disabled={deleting || count == null} onClick={() => void remove()}>
          确认删除
        </Button>
      )}
      {error ? (
        <span role="status">
          {error}
          <Button size="sm" onClick={() => void load()}>
            重试
          </Button>
        </span>
      ) : null}
    </div>
  );
}
