import {
  MousePointer2,
  Highlighter,
  Underline,
  StickyNote,
  Scan,
  Pencil,
  Eraser,
  Undo2,
  Redo2,
} from "lucide-react";
import { IconButton } from "@/ui/wb/Button.js";
import type { AnnotationController } from "../../state/annotations/useAnnotations.js";
import type { Semantics, Tool } from "../../domain/annotations/types.js";
import { Colors } from "./Colors.js";
const TOOLS = [
  ["select", "选择", "V", MousePointer2],
  ["highlight", "高亮", "H", Highlighter],
  ["underline", "下划线", "U", Underline],
  ["sticky", "便签", "N", StickyNote],
  ["region", "框选", "R", Scan],
  ["ink", "手写", "P", Pencil],
  ["erase", "橡皮", "E", Eraser],
] as const;
export function AnnotationTools({
  controller: c,
  labels,
  disabled,
}: {
  controller: AnnotationController;
  labels: Semantics;
  disabled: boolean;
}) {
  return (
    <div aria-label="批注工具" role="toolbar" className="flex flex-wrap items-center gap-1">
      {TOOLS.map(([tool, label, key, Icon]) => (
        <IconButton
          key={tool}
          label={label}
          title={`${label}（${key}）`}
          disabled={disabled || c.busy}
          aria-pressed={c.tool === tool}
          onClick={() => c.setTool(tool as Tool)}
        >
          <Icon size={15} />
        </IconButton>
      ))}
      <Colors value={c.color} labels={labels} change={c.setColor} />
      {c.tool === "ink" ? (
        <select
          aria-label="画笔粗细"
          value={c.width}
          onChange={(event) => c.setWidth(Number(event.target.value) as 1 | 2 | 4)}
          className="rounded bg-wb-fill text-[0.75rem]"
        >
          <option value={1}>细</option>
          <option value={2}>中</option>
          <option value={4}>粗</option>
        </select>
      ) : null}
      <IconButton
        label="撤销批注"
        title="撤销批注（Ctrl Z）"
        disabled={!c.canUndo || c.busy}
        onClick={() => void c.travel(false)}
      >
        <Undo2 size={15} />
      </IconButton>
      <IconButton
        label="重做批注"
        title="重做批注（Ctrl Shift Z）"
        disabled={!c.canRedo || c.busy}
        onClick={() => void c.travel(true)}
      >
        <Redo2 size={15} />
      </IconButton>
    </div>
  );
}
