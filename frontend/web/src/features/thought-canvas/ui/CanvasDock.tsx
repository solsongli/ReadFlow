import { useEffect, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { useCanvases } from "./context.js";
import { CanvasView } from "./CanvasView.js";
export function CanvasDock() {
  const workspace = useCanvases();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  useEffect(() => {
    if (!workspace.list.some((canvas) => canvas.id === id)) {
      setId(workspace.list[0]?.id || "");
    }
  }, [workspace.list]);
  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="停靠画布">
      {id ? (
        <CanvasView
          key={id}
          id={id}
          titleControl={
            <select
              aria-label="当前画布"
              className="min-w-32 max-w-48 shrink-0 rounded bg-wb-fill p-1"
              value={id}
              onChange={(e) => setId(e.target.value)}
            >
              <option value="">选择画布…</option>
              {workspace.list.map((canvas) => (
                <option key={canvas.id} value={canvas.id}>
                  {canvas.name}
                </option>
              ))}
            </select>
          }
          endControl={
            <Button
              size="sm"
              onClick={() => workspace.open(id, workspace.list.find((c) => c.id === id)!.name)}
            >
              全屏打开
            </Button>
          }
        />
      ) : (
        <form
          className="space-y-3 p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            const canvas = await workspace.create(name, null, false);
            if (canvas) {
              setId(canvas.id);
            }
          }}
        >
          <p className="text-[0.8125rem] text-wb-text-3">为一个问题或课题新建画布。</p>
          <input
            aria-label="新画布名称"
            required
            maxLength={200}
            placeholder="画布名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded bg-wb-fill p-2"
          />
          <Button type="submit">新建画布</Button>
        </form>
      )}
    </div>
  );
}
