import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { useCanvases } from "./context.js";
export function CanvasPicker({
  annotationIds,
  text,
  resolve,
  close,
}: {
  annotationIds?: string[];
  text?: string;
  resolve?: () => Promise<string[]>;
  close: () => void;
}) {
  const workspace = useCanvases();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("button,input")?.focus();
  }, []);
  async function choose(id: string) {
    setBusy(true);
    try {
      if (text !== undefined) {
        await workspace.add(id, { type: "sticky", text });
        close();
        return;
      }
      const ids = annotationIds ?? (await resolve?.()) ?? [];
      if (!ids.length) {
        throw new Error("请先选中原文文字。");
      }
      for (const [index, annotation_id] of ids.entries()) {
        await workspace.add(
          id,
          { type: "excerpt", annotation_id },
          { x: 80 + index * 30, y: 80 + index * 30 },
        );
      }
      close();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="加入画布"
      ref={root}
      className="absolute inset-0 z-50 flex items-center justify-center bg-wb-overlay p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
        if (event.key === "Tab") {
          const nodes = [...root.current!.querySelectorAll<HTMLElement>("button:not(:disabled),input")];
          const index = nodes.indexOf(document.activeElement as HTMLElement);
          event.preventDefault();
          nodes[(index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length]?.focus();
        }
      }}
    >
      <div className="max-h-[80vh] w-80 overflow-auto rounded-xl bg-wb-panel p-4 shadow-wb-pop">
        <h2 className="mt-0 text-[1rem]">加入画布</h2>
        {workspace.list.map((canvas) => (
          <Button
            key={canvas.id}
            className="mb-2 w-full"
            disabled={busy}
            onClick={() => void choose(canvas.id)}
          >
            {canvas.name}
          </Button>
        ))}
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const created = await workspace.create(name, null, false);
            if (created) {
              await choose(created.id);
            }
          }}
        >
          <input
            aria-label="画布名称"
            required
            maxLength={200}
            value={name}
            placeholder="新画布名称"
            onChange={(e) => setName(e.target.value)}
            className="mb-2 w-full rounded bg-wb-fill p-2"
          />
          <Button type="submit" disabled={busy}>
            新建并加入
          </Button>
        </form>
        {error ? (
          <p role="status" className="text-[0.75rem] text-wb-text-3">
            {error}
          </p>
        ) : null}
        <Button className="mt-3" onClick={close}>
          取消
        </Button>
      </div>
    </div>
  );
}
